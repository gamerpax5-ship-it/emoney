import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const canonicalJs = join(root, 'ui/digirupee-device-fixes.js');
const hostedJs = join(root, 'website/digirupee-device-fixes.js');
const canonicalProfileJs = join(root, 'ui/digirupee-profile-polish.js');
const hostedProfileJs = join(root, 'website/digirupee-profile-polish.js');
const htmlPath = join(root, 'website/digirupee-app.html');
const runtimePath = join(root, 'website/server-runtime.mjs');

await copyFile(canonicalJs, hostedJs);
await copyFile(canonicalProfileJs, hostedProfileJs);

let html = await readFile(htmlPath, 'utf8');
const scriptTag = '<script src="/digirupee-device-fixes.js?v=20260916d" defer></script>';
if (/\/digirupee-device-fixes\.js(?:\?v=[^"']+)?/.test(html)) {
  html = html.replace(/<script src="\/digirupee-device-fixes\.js(?:\?v=[^"']+)?" defer><\/script>/, scriptTag);
} else {
  html = html.replace(/<\/body>/i, `${scriptTag}</body>`);
}

const profileScriptTag = '<script src="/digirupee-profile-polish.js?v=20260919b" defer></script>';
if (/\/digirupee-profile-polish\.js(?:\?v=[^"']+)?/.test(html)) {
  html = html.replace(/<script src="\/digirupee-profile-polish\.js(?:\?v=[^"']+)?" defer><\/script>/, profileScriptTag);
} else {
  html = html.replace(/<\/body>/i, `${profileScriptTag}</body>`);
}
await writeFile(htmlPath, html, 'utf8');

let runtime = await readFile(runtimePath, 'utf8');
for (const asset of ['/digirupee-device-fixes.js', '/digirupee-profile-polish.js']) {
  if (runtime.includes(`'${asset}'`)) continue;
  const start = runtime.indexOf('const digiStaticFiles = new Set([');
  if (start < 0) throw new Error('digiRupee static allowlist start was not found');
  const end = runtime.indexOf(']);', start);
  if (end < 0) throw new Error('digiRupee static allowlist end was not found');
  const block = runtime.slice(start, end);
  const comma = /,\s*$/.test(block) ? '' : ',';
  runtime = runtime.slice(0, end) + `${comma}\n      '${asset}'\n    ` + runtime.slice(end);
}
await writeFile(runtimePath, runtime, 'utf8');

await import('./enable-live-reward-tasks.mjs');
console.log('Enabled digiRupee clean responsive UI, referral handoff, profile polish and live reward tasks');
