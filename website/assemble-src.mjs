import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const srcDir = join(root, 'src');
const files = (await readdir(srcDir))
  .filter(name => /^part-\d+\.html$/.test(name))
  .sort((a,b)=>a.localeCompare(b, undefined, { numeric:true }));

if (files.length !== 11) throw new Error(`Expected 11 editable LOKTRON source parts, found ${files.length}`);
const chunks = await Promise.all(files.map(name => readFile(join(srcDir,name),'utf8')));
const html = chunks.join('');
for (const marker of ['<!DOCTYPE html>','LOKTRON','Buy USDT','id="dashboard"',"api('/auth/login'",'</html>']) {
  if (!html.includes(marker)) throw new Error(`Editable website source verification failed: missing ${marker}`);
}
if (Buffer.byteLength(html) < 92000) throw new Error(`Editable website source unexpectedly small: ${Buffer.byteLength(html)} bytes`);
await writeFile(join(root,'index.html'), html, 'utf8');
console.log(`Assembled editable LOKTRON website from ${files.length} parts (${Buffer.byteLength(html)} bytes)`);
