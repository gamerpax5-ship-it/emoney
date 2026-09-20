/** Final presentation build. Run AFTER the existing startup transforms.
 * No backend, payment, authentication or persistence code is modified here.
 */
import {readFile, writeFile, mkdir, rename} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname, join, resolve, extname} from 'node:path';
import {createHash} from 'node:crypto';
import vm from 'node:vm';

export const EMONEY_VERSION = '1.1.0';
const repoRoot = fileURLToPath(new URL('..', import.meta.url));
export async function buildEMoney({root = repoRoot, destination} = {}) {
  const source = join(root,'ui','emoney');
  const files = ['index.html','style.css','qr-code.js','app.js','assets.json','asset-sha256.json'];
  const contents = Object.fromEntries(await Promise.all(files.map(async file=>[file,await readFile(join(source,file),'utf8')])));
  const mapping = JSON.parse(contents['assets.json']);
  const hashes = JSON.parse(contents['asset-sha256.json']);
  const art = {};
  for (const [name,relative] of Object.entries(mapping)) {
    if (!/^assets\/[A-Za-z0-9_-]+\.(?:webp|png|jpg|jpeg)$/.test(relative)) throw new Error(`Unsafe asset path: ${relative}`);
    const raw = await readFile(join(source,relative));
    const digest = createHash('sha256').update(raw).digest('hex');
    if (hashes[relative] !== digest) throw new Error(`Approved artwork hash mismatch: ${relative}`);
    const mime = extname(relative)==='.webp'?'image/webp':extname(relative)==='.png'?'image/png':'image/jpeg';
    art[name] = `data:${mime};base64,${raw.toString('base64')}`;
  }
  for (const name of ['app.js','qr-code.js']) new vm.Script(contents[name],{filename:name});
  const forbidden = [/demo@emoney/i,/Demo@12345/,/startPreview\s*\(/,/demoApi\s*\(/,/PREVIEW-ONLY-NOT-A-REAL/,/const\s+demo\s*=/,/id=["']demoButton["']/];
  const checked = contents['index.html']+'\n'+contents['app.js'];
  if (forbidden.some(pattern=>pattern.test(checked))) throw new Error('Demo authentication or sample business state found in the production source.');
  let html=contents['index.html'];
  for(const token of ['<!-- EMONEY_STYLE -->','<!-- EMONEY_SCRIPTS -->']) if(html.split(token).length!==2)throw new Error(`Expected one build marker: ${token}`);
  html=html.replace(/\{\{ASSET:([A-Za-z0-9]+)\}\}/g,(_,name)=>{if(!art[name])throw new Error(`Missing artwork: ${name}`);return art[name]});
  html=html.replace('<!-- EMONEY_STYLE -->',()=>`<style>\n${contents['style.css']}\n</style>`);
  const escapeScript = value => value.replace(/<\/script/gi,'<\\/script');
  const script = `window.__EMONEY_ART=${JSON.stringify(art)};\n${contents['qr-code.js']}\n${contents['app.js']}`;
  html=html.replace('<!-- EMONEY_SCRIPTS -->',()=>`<script>\n${escapeScript(script)}\n</script>`);
  // Check the final embedded code as well: replacement strings must never interpret dollar signs.
  for (const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(match[1], {filename:'embedded-emoney.js'});
  const digest=createHash('sha256').update(html).digest('hex');
  html=`<!-- eMoney ${EMONEY_VERSION}; source SHA-256 ${digest} -->\n`+html;
  const target=destination||join(root,'website','digirupee-app.html');
  await mkdir(dirname(target),{recursive:true});
  await writeFile(target+'.tmp',html,'utf8');await rename(target+'.tmp',target);
  return {target,version:EMONEY_VERSION,sha256:digest,bytes:Buffer.byteLength(html),artwork:Object.keys(art).length};
}
// Module is deliberately imported immediately before server-runtime.mjs in persistent-start.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log('Prepared eMoney approved mobile UI:', await buildEMoney());
}
