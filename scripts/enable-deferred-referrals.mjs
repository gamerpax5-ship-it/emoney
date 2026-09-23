import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const runtimePath = join(root, 'website/server-runtime.mjs');
let source = await readFile(runtimePath, 'utf8');

const apiNeedle = "async function digirupeeApi(req, res, path) {\n";
if (!source.includes(apiNeedle)) throw new Error('digiRupee API hook was not found');

const claimRoute = `  if (req.method === 'GET' && path === '/referral-install/claim') {\n    const now = Date.now();\n    const key = digiSessionIpHash(req);\n    db.digirupee.pendingReferralInstalls = (Array.isArray(db.digirupee.pendingReferralInstalls) ? db.digirupee.pendingReferralInstalls : [])\n      .filter(item => Number(item.expiresAt || 0) > now);\n    const pending = db.digirupee.pendingReferralInstalls\n      .filter(item => item.key === key)\n      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))[0] || null;\n    if (pending) {\n      pending.lastClaimAt = now;\n      await persist();\n    }\n    return send(res, 200, { referralCode: pending?.referralCode || null, expiresAt: pending?.expiresAt || null });\n  }\n\n`;
source = source.replace(apiNeedle, apiNeedle + claimRoute);

const downloadNeedle = "    if (isDigiRupeeHost && ['/download/digirupee.apk', '/download/emoney.apk'].includes(pathname)) {\n";
if (!source.includes(downloadNeedle)) throw new Error('digiRupee APK download route was not found');

const downloadPrelude = `    const pendingReferralCode = String(url.searchParams.get('ref') || '').trim().toUpperCase();\n    if (pendingReferralCode) {\n      const referrer = db.digirupee.users.find(item => String(item.referralCode || '').toUpperCase() === pendingReferralCode);\n      if (referrer) {\n        const now = Date.now();\n        const key = digiSessionIpHash(req);\n        db.digirupee.pendingReferralInstalls = (Array.isArray(db.digirupee.pendingReferralInstalls) ? db.digirupee.pendingReferralInstalls : [])\n          .filter(item => Number(item.expiresAt || 0) > now && item.key !== key);\n        db.digirupee.pendingReferralInstalls.push({\n          key,\n          referralCode: referrer.referralCode,\n          createdAt: now,\n          expiresAt: now + 6 * 60 * 60 * 1000\n        });\n        await persist();\n      }\n    }\n`;
source = source.replace(downloadNeedle, downloadNeedle + downloadPrelude);

await writeFile(runtimePath, source, 'utf8');
console.log('Enabled digiRupee deferred referral handoff');
