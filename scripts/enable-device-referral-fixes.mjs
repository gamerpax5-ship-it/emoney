import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const canonicalJs = join(root, 'ui/digirupee-device-fixes.js');
const hostedJs = join(root, 'website/digirupee-device-fixes.js');
const htmlPath = join(root, 'website/digirupee-app.html');
const runtimePath = join(root, 'website/server-runtime.mjs');

await copyFile(canonicalJs, hostedJs);

let html = await readFile(htmlPath, 'utf8');
const scriptTag = '<script src="/digirupee-device-fixes.js?v=20260916d" defer></script>';
if (/\/digirupee-device-fixes\.js(?:\?v=[^"']+)?/.test(html)) {
  html = html.replace(/<script src="\/digirupee-device-fixes\.js(?:\?v=[^"']+)?" defer><\/script>/, scriptTag);
} else {
  html = html.replace(/<\/body>/i, `${scriptTag}</body>`);
}
await writeFile(htmlPath, html, 'utf8');

let runtime = await readFile(runtimePath, 'utf8');
if (!runtime.includes("'/digirupee-device-fixes.js'")) {
  const start = runtime.indexOf('const digiStaticFiles = new Set([');
  if (start < 0) throw new Error('digiRupee static allowlist start was not found');
  const end = runtime.indexOf(']);', start);
  if (end < 0) throw new Error('digiRupee static allowlist end was not found');
  const block = runtime.slice(start, end);
  const comma = /,\s*$/.test(block) ? '' : ',';
  runtime = runtime.slice(0, end) + `${comma}\n      '/digirupee-device-fixes.js'\n    ` + runtime.slice(end);
  await writeFile(runtimePath, runtime, 'utf8');
}

await import('./enable-live-reward-tasks.mjs');
console.log('Enabled digiRupee clean responsive UI, referral handoff and live reward tasks');
