import { copyFile, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const configuredWebAppUrl = process.env.DIGIRUPEE_WEB_APP_URL || 'https://digirupee.loktron.com/';
const webAppUrl = configuredWebAppUrl.endsWith('.html') ? configuredWebAppUrl : `${configuredWebAppUrl.replace(/\/$/, '')}/digirupee-app.html`;
const uploadedWtron = process.env.WTRON_ANDROID_HTML || '';
const canonicalAppJs = join(root, 'ui/digirupee-app.js');
const canonicalQrJs = join(root, 'ui/digirupee-qr.js');
const canonicalRewardsJs = join(root, 'ui/digirupee-rewards.js');
const canonicalLayoutJs = join(root, 'ui/digirupee-layout-v3.js');
const canonicalEnhancementsJs = join(root, 'ui/digirupee-enhancements.js');
const canonicalRewardHeroFixJs = join(root, 'ui/digirupee-reward-hero-fix.js');

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function replaceRequired(source, pattern, replacement, label) {
  const next = source.replace(pattern, replacement);
  if (next === source) throw new Error(`Required production transform did not match: ${label}`);
  return next;
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

function extractPngDataUrl(source, name) {
  const pattern = new RegExp(`const\\s+${name}\\s*=\\s*['\"](data:image\\/png;base64,[A-Za-z0-9+/=]+)['\"]`);
  return source.match(pattern)?.[1] || '';
}

function rewardAssetsFrom(source) {
  const assets = {
    content: extractPngDataUrl(source, 'CONTENT') || extractPngDataUrl(source, 'ART'),
    nav: extractPngDataUrl(source, 'NAV'),
    wheel: extractPngDataUrl(source, 'WHEEL') || extractPngDataUrl(source, 'SEG')
  };
  if (!assets.content || !assets.nav || !assets.wheel) throw new Error('Approved Rewards artwork assets are missing from WTRON source');
  return assets;
}

function productionHtml(source) {
  let html = source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  html = html.replace(/<title>[\s\S]*?<\/title>/i, '<title>digiRupee — Sell USDT</title>');
  html = html.replace(/<\/head>/i, '<style id="digi-boot-guard">body:not(.digi-ready)>*:not(script){visibility:hidden!important}body:not(.digi-ready) .app{visibility:hidden!important}body:not(.digi-ready)::before{content:"digiRupee";position:fixed;inset:0;z-index:9999;display:grid;place-items:center;background:#050607;color:#f1cf67;font:800 22px system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:-.02em}body.digi-ready::before{display:none!important}</style></head>');
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
  html = html.replace(/<\/body>/i, '<script src="/digirupee-qr.js?v=20260919c" defer></script><script src="/digirupee-app.js?v=20260919c" defer></script><script src="/digirupee-layout-v3.js?v=20260919c" defer></script><script src="/digirupee-rewards-assets.js?v=20260919c" defer></script><script src="/digirupee-rewards.js?v=20260919c" defer></script><script src="/digirupee-enhancements.js?v=20260919c" defer></script><script src="/digirupee-reward-hero-fix.js?v=20260919c" defer></script></body>');
  return html;
}

async function prepareDigiAdmin() {
  const path = join(root, 'website/digirupee-admin.html');
  let html = await readFile(path, 'utf8');
  html = html.replace('Inviter reward USDT', 'Inviter commission %');
  html = html.replace('<input class="input" id="inviterReward" type="number" min="0" step="0.000001">', '<input class="input" id="inviterReward" type="number" min="0" max="100" step="0.01">');
  html = html.replace(/<div class="field"><label>Referred reward USDT<\/label><input class="input" id="referredReward" type="number" min="0" step="0\.000001"><\/div>/, '');
  html = html.replace("$('inviterReward').value = policy.inviterRewardUsdt ?? 0; $('referredReward').value = policy.referredRewardUsdt ?? 0;", "$('inviterReward').value = policy.inviterCommissionPercent ?? 1;");
  html = html.replace("inviterRewardUsdt:Number($('inviterReward').value),referredRewardUsdt:Number($('referredReward').value),minimumCompletedUsdt:Number($('referralMinimum').value)", "inviterCommissionPercent:Number($('inviterReward').value),minimumCompletedUsdt:Number($('referralMinimum').value)");
  await writeFile(path, html, 'utf8');
}

async function compileProductionServer() {
  const sourcePath = join(root, 'website/server.mjs');
  const outputPath = join(root, 'website/server-runtime.mjs');
  let source = await readFile(sourcePath, 'utf8');

  source = replaceRequired(
    source,
    "referrals: { enabled: true, inviterRewardUsdt: 10, referredRewardUsdt: 0, minimumCompletedUsdt: 0 },",
    "referrals: { enabled: true, inviterCommissionPercent: 1, minimumCompletedUsdt: 0 },",
    'default referral percentage policy'
  );

  source = replaceRequired(
    source,
    /function referralPolicy\(\) \{[\s\S]*?\n\}/,
    `function referralPolicy() {\n  const policy = db.digirupee.config.referrals || {};\n  return { enabled: policy.enabled !== false, inviterCommissionPercent: Number(policy.inviterCommissionPercent ?? 1), minimumCompletedUsdt: Number(policy.minimumCompletedUsdt || 0) };\n}`,
    'referralPolicy'
  );

  source = replaceRequired(
    source,
    /  referral\.qualifyingOrderId = order\.id;\n  appendDigiAudit\(\{ actorType: 'system', actorId: 'digirupee', action: 'referral\.qualified'[\s\S]*?  referral\.status = 'rewarded';/,
    `  referral.qualifyingOrderId = order.id;\n  appendDigiAudit({ actorType: 'system', actorId: 'digirupee', action: 'referral.qualified', entityType: 'referral', entityId: referral.id, details: { qualifyingOrderId: order.id } });\n  const inviter = db.digirupee.users.find(user => user.id === referral.referrerUserId);\n  const commissionMicros = Math.max(0, Math.floor(Number(order.usdtMicros || 0) * Number(policy.inviterCommissionPercent || 0) / 100));\n  if (inviter && commissionMicros > 0) {\n    const result = issueDigiReward({ userId: inviter.id, amountMicros: commissionMicros, type: 'referral', sourceType: 'referral', sourceId: \`${'${referral.id}'}:inviter\`, description: \`Referral commission ${'${Number(policy.inviterCommissionPercent || 0)}'}% on qualifying completed sell order\` });\n    if (result.entry) referral.inviterRewardLedgerId = result.entry.id;\n  }\n  referral.status = 'rewarded';`,
    'percentage referral award'
  );

  source = replaceRequired(
    source,
    /  if \(req\.method === 'PATCH' && path === '\/admin\/referral-policy'\) \{[\s\S]*?\n  \}\n\n  if \(req\.method === 'GET' && path === '\/payout-methods'\)/,
    `  if (req.method === 'PATCH' && path === '/admin/referral-policy') {\n    const admin = adminAuth(req); requireAdminRole(admin, ['owner']); const b = await body(req);\n    const inviterCommissionPercent = Number(b.inviterCommissionPercent ?? 1);\n    const minimumCompletedUsdt = validDigiAmount(b.minimumCompletedUsdt ?? 0, 0, 1_000_000);\n    if (!Number.isFinite(inviterCommissionPercent) || inviterCommissionPercent < 0 || inviterCommissionPercent > 100 || minimumCompletedUsdt === null) return send(res, 400, { error: 'Referral commission policy is invalid' });\n    db.digirupee.config.referrals = { enabled: b.enabled !== false, inviterCommissionPercent, minimumCompletedUsdt };\n    db.digirupee.config.updatedAt = Date.now();\n    appendDigiAudit({ actorType: 'admin', actorId: admin.email, action: 'referral.policy.updated', entityType: 'referral-policy', entityId: 'config', details: { enabled: db.digirupee.config.referrals.enabled, inviterCommissionPercent, minimumCompletedUsdt } });\n    await persist();\n    return send(res, 200, { policy: referralPolicy() });\n  }\n\n  if (req.method === 'GET' && path === '/payout-methods')`,
    'admin referral policy endpoint'
  );

  source = replaceRequired(
    source,
    /  if \(req\.method === 'GET' && path === '\/referrals'\) \{[\s\S]*?\n  \}\n\n  if \(req\.method === 'GET' && path === '\/admin\/rewards'\)/,
    `  if (req.method === 'GET' && path === '/referrals') {\n    const { user } = digirupeeAuth(req);\n    const own = db.digirupee.referrals.filter(referral => referral.referrerUserId === user.id);\n    const code = user.referralCode || null;\n    const downloadUrl = code ? \`https://digirupee.loktron.com/download/digirupee.apk?ref=${'${encodeURIComponent(code)}'}\` : null;\n    return send(res, 200, { referralCode: code, shareText: code ? \`Download digiRupee and earn with my referral code ${'${code}'}\` : null, webUrl: downloadUrl, downloadUrl, invitedCount: own.length, qualifiedCount: own.filter(item => ['qualified', 'rewarded'].includes(item.status)).length, rewardEarned: formatUsdtMicros(own.reduce((sum, referral) => sum + Number(db.digirupee.rewardLedger.find(entry => entry.id === referral.inviterRewardLedgerId)?.amountMicros || 0), 0)), referrals: own.map(referralPublic) });\n  }\n\n  if (req.method === 'GET' && path === '/admin/rewards')`,
    'APK referral share URL'
  );

  source = source.replace("'/digirupee-layout-v3.js'\n    ]);", "'/digirupee-layout-v3.js',\n      '/digirupee-enhancements.js'\n    ]);");

  await writeFile(outputPath, source, 'utf8');
  return outputPath;
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

  const rewardAssets = rewardAssetsFrom(sourceHtml);
  const hostedHtml = join(root, 'website/digirupee-app.html');
  const hostedJs = join(root, 'website/digirupee-app.js');
  const hostedQrJs = join(root, 'website/digirupee-qr.js');
  const hostedRewardsJs = join(root, 'website/digirupee-rewards.js');
  const hostedRewardsAssetsJs = join(root, 'website/digirupee-rewards-assets.js');
  const hostedLayoutJs = join(root, 'website/digirupee-layout-v3.js');
  const hostedEnhancementsJs = join(root, 'website/digirupee-enhancements.js');
  const hostedRewardHeroFixJs = join(root, 'website/digirupee-reward-hero-fix.js');

  await writeFile(hostedHtml, productionHtml(sourceHtml), 'utf8');
  await copyFile(canonicalAppJs, hostedJs);
  await copyFile(canonicalQrJs, hostedQrJs);
  await copyFile(canonicalRewardsJs, hostedRewardsJs);
  await copyFile(canonicalLayoutJs, hostedLayoutJs);
  await copyFile(canonicalEnhancementsJs, hostedEnhancementsJs);
  await copyFile(canonicalRewardHeroFixJs, hostedRewardHeroFixJs);
  await writeFile(hostedRewardsAssetsJs, `window.__DIGIRUPEE_REWARD_ASSETS=${JSON.stringify(rewardAssets)};\n`, 'utf8');

  const publishedApk = join(root, 'dist/digiRupee.apk');
  if (await exists(publishedApk)) await copyFile(publishedApk, join(root, 'website/digiRupee.apk'));

  const fallback = join(assetDir, 'offline.html');
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>digiRupee</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#070512;color:#fff;font:16px Arial,sans-serif}.box{max-width:340px;padding:24px;text-align:center}p{color:#c9c4df;line-height:1.5}button{border:0;border-radius:9px;padding:13px 18px;background:#7c4dff;color:#fff;font-weight:700}</style></head><body><div class="box"><h1>digiRupee</h1><p>An internet connection is required to use the secure application.</p><button onclick="location.href='${webAppUrl.replace(/'/g, '%27')}'">Retry</button></div></body></html>`;
  await writeFile(fallback, html);
  return { hostedHtml, hostedJs, hostedQrJs, hostedRewardsJs, hostedRewardsAssetsJs, hostedLayoutJs, hostedEnhancementsJs, fallback, webAppUrl, bytes: Buffer.byteLength(sourceHtml) };
}

await prepareDigiAdmin();
const runtimeServer = await compileProductionServer();
const android = await rebuildAndroid();
console.log('Prepared digiRupee production assets:', { ...android, runtimeServer });