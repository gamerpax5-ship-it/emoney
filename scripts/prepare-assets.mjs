import { copyFile, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const webAppUrl = process.env.DIGIRUPEE_WEB_APP_URL || 'https://tronpay-production.up.railway.app/';
const uploadedWtron = process.env.WTRON_ANDROID_HTML || '';

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function rebuildAndroid() {
  const assetDir = join(root, 'android/app/src/main/assets');
  const output = join(assetDir, 'wtron.html');
  const partsDir = join(assetDir, 'wtron-parts');
  await mkdir(assetDir, { recursive: true });
  if (uploadedWtron) {
    if (uploadedWtron !== output) await copyFile(uploadedWtron, output);
  } else if (await exists(partsDir)) {
    const parts = (await readdir(partsDir)).filter(name => /^part-\d+$/.test(name)).sort();
    if (!parts.length) throw new Error('No WTRON Android asset parts found');
    const b64 = (await Promise.all(parts.map(name => readFile(join(partsDir, name), 'utf8')))).join('');
    await writeFile(output, Buffer.from(b64, 'base64'));
  } else if (!await exists(output)) {
    throw new Error('WTRON Android HTML asset is missing');
  }
  const fallback = join(assetDir, 'offline.html');
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>digiRupee</title></head><body><h1>digiRupee</h1><p>The packaged WTRON interface is included in this app.</p><p>Website: <a href="${webAppUrl}">${webAppUrl}</a></p></body></html>`;
  await writeFile(fallback, html);
  const info = await stat(output);
  return { output, fallback, webAppUrl, bytes: info.size };
}

const android = await rebuildAndroid();
console.log('Prepared Android fallback asset:', android);
