import { copyFile, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const configuredWebAppUrl = process.env.DIGIRUPEE_WEB_APP_URL || 'https://tronpay-production.up.railway.app/';
const webAppUrl = configuredWebAppUrl.endsWith('.html') ? configuredWebAppUrl : `${configuredWebAppUrl.replace(/\/$/, '')}/digirupee-app.html`;
const uploadedWtron = process.env.WTRON_ANDROID_HTML || '';
const canonicalAppJs = join(root, 'ui/digirupee-app.js');
const canonicalQrJs = join(root, 'ui/digirupee-qr.js');

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function replaceOverlay(source, id, replacement) {
  const start = source.indexOf(`<div class="overlay" id="${id}"`);
  if (start < 0) return source;
  const tags = /<div\b|<\/div>/gi;
  tags.lastIndex = start;
  let depth = 0;
  let match;
  while ((match = tags.exec(source))) {
    if (match[0].startsWith('</')) depth -= 1;
    else depth += 1;
    if (depth === 0) return source.slice(0, start) + replacement + source.slice(tags.lastIndex);
  }
  throw new Error(`Could not replace overlay ${id}`);
}

function productionHtml(source) {
  let html = source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  html = html.replace(/<title>[\s\S]*?<\/title>/i, '<title>digiRupee — Sell USDT</title>');
  html = html.replace(/<details class="prototype-box">[\s\S]*?<\/details>/gi, '');
  html = html.replace(/Prototype intraday rate movement\./gi, 'Live rate snapshot.');
  html = html.replace(/Prototype toggle for an additional login verification step\./gi, 'Use an authenticator app and recovery code.');
  html = html.replace(/Prototype support center\./gi, 'Create and track support tickets.');
  html = html.replace(/prototype/gi, 'legacy');
  html = html.replace(/Devid Europe/g, 'Account');
  html = html.replace(/EU4587293/g, '—');
  html = html.replace(/9876543210/g, '');
  html = html.replace(/value="1000"/g, 'value=""');
  html = html.replace(/≈ ₹1,11,240/g, 'Enter an amount');
  html = html.replace(/₹111\.24/g, '—');
  html = html.replace(/₹108\.00/g, '—');
  html = replaceOverlay(html, 'sessionsOv', '<div class="overlay" id="sessionsOv" onclick="bg(event,\'sessionsOv\')"><div class="sheet"><div class="handle"></div><h3>Login & Devices</h3><p class="desc">Loading active sessions…</p></div></div>');
  html = replaceOverlay(html, 'supportOv', '<div class="overlay" id="supportOv" onclick="bg(event,\'supportOv\')"><div class="sheet"><div class="handle"></div><h3>Help & Support</h3><p class="desc">Loading your support tickets…</p></div></div>');
  html = html.replace(/<\/body>/i, '<script src="/digirupee-qr.js" defer></script><script src="/digirupee-app.js" defer></script></body>');
  return html;
}

async function rebuildAndroid() {
  const assetDir = join(root, 'android/app/src/main/assets');
  const partsDir = join(assetDir, 'wtron-parts');
  await mkdir(assetDir, { recursive: true });
  let sourceHtml;
  if (uploadedWtron) {
    sourceHtml = await readFile(uploadedWtron, 'utf8');
  } else if (await exists(partsDir)) {
    const parts = (await readdir(partsDir)).filter(name => /^part-\d+$/.test(name)).sort();
    if (!parts.length) throw new Error('No WTRON Android asset parts found');
    const b64 = (await Promise.all(parts.map(name => readFile(join(partsDir, name), 'utf8')))).join('');
    sourceHtml = Buffer.from(b64, 'base64').toString('utf8');
  } else {
    throw new Error('WTRON Android HTML asset is missing');
  }
  const hostedHtml = join(root, 'website/digirupee-app.html');
  const hostedJs = join(root, 'website/digirupee-app.js');
  const hostedQrJs = join(root, 'website/digirupee-qr.js');
  await writeFile(hostedHtml, productionHtml(sourceHtml), 'utf8');
  await copyFile(canonicalAppJs, hostedJs);
  await copyFile(canonicalQrJs, hostedQrJs);
  const fallback = join(assetDir, 'offline.html');
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>digiRupee</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#070512;color:#fff;font:16px Arial,sans-serif}.box{max-width:340px;padding:24px;text-align:center}p{color:#c9c4df;line-height:1.5}button{border:0;border-radius:9px;padding:13px 18px;background:#7c4dff;color:#fff;font-weight:700}</style></head><body><div class="box"><h1>digiRupee</h1><p>An internet connection is required to use the secure application.</p><button onclick="location.href='${webAppUrl.replace(/'/g, '%27')}'">Retry</button></div></body></html>`;
  await writeFile(fallback, html);
  return { hostedHtml, hostedJs, hostedQrJs, fallback, webAppUrl, bytes: Buffer.byteLength(sourceHtml) };
}

const android = await rebuildAndroid();
console.log('Prepared Android fallback asset:', android);
