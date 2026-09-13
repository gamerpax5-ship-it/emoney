import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const webAppUrl = process.env.DIGIRUPEE_WEB_APP_URL || 'https://tronpay-production.up.railway.app/';

async function rebuildAndroid() {
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0; url=${webAppUrl}"><title>digiRupee</title></head><body><a href="${webAppUrl}">Open digiRupee</a></body></html>`;
  const output = join(root, 'android/app/src/main/assets/offline.html');
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, html);
  return { output, webAppUrl, bytes: html.length };
}

const android = await rebuildAndroid();
console.log('Prepared Android fallback asset:', android);
