import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const canonicalJs = join(root, 'ui/digirupee-device-fixes.js');
const hostedJs = join(root, 'website/digirupee-device-fixes.js');
const canonicalProfileJs = join(root, 'ui/digirupee-profile-polish.js');
const hostedProfileJs = join(root, 'website/digirupee-profile-polish.js');
const canonicalRewardHeroJs = join(root, 'ui/digirupee-reward-hero-fix.js');
const hostedRewardHeroJs = join(root, 'website/digirupee-reward-hero-fix.js');
const enhancementsPath = join(root, 'website/digirupee-enhancements.js');
const htmlPath = join(root, 'website/digirupee-app.html');
const runtimePath = join(root, 'website/server-runtime.mjs');

await copyFile(canonicalJs, hostedJs);
await copyFile(canonicalProfileJs, hostedProfileJs);
await copyFile(canonicalRewardHeroJs, hostedRewardHeroJs);

/* Keep native notification delivery idempotent across WebView/app restarts.
   This changes only the client-side native popup guard; server notification data,
   unread state and the in-app notification list remain untouched. */
let enhancements = await readFile(enhancementsPath, 'utf8');
const oldNotificationGuard = `  const seenNotifications = new Set();\n  function surfaceItems(items) {\n    if (!window.DigiAndroid?.notify || !Array.isArray(items)) return;\n    items.filter(item => !item.readAt && item.id && !seenNotifications.has(item.id)).slice(0,3).forEach(item => {\n      seenNotifications.add(item.id);\n      try { window.DigiAndroid.notify(String(item.title || 'digiRupee'), String(item.message || '')); } catch {}\n    });\n  }`;
const persistentNotificationGuard = `  const SEEN_NATIVE_NOTIFICATIONS_KEY = 'digirupee-native-notification-seen-v1';\n  function loadSeenNativeNotifications() {\n    try {\n      const stored = JSON.parse(localStorage.getItem(SEEN_NATIVE_NOTIFICATIONS_KEY) || '[]');\n      return new Set(Array.isArray(stored) ? stored.map(String).filter(Boolean).slice(-200) : []);\n    } catch { return new Set(); }\n  }\n  const seenNotifications = loadSeenNativeNotifications();\n  function persistSeenNativeNotifications() {\n    try {\n      const values = [...seenNotifications].slice(-200);\n      localStorage.setItem(SEEN_NATIVE_NOTIFICATIONS_KEY, JSON.stringify(values));\n      if (seenNotifications.size !== values.length) {\n        seenNotifications.clear();\n        values.forEach(value => seenNotifications.add(value));\n      }\n    } catch {}\n  }\n  function surfaceItems(items) {\n    if (!window.DigiAndroid?.notify || !Array.isArray(items)) return;\n    items.filter(item => !item.readAt && item.id && !seenNotifications.has(String(item.id))).slice(0,3).forEach(item => {\n      try {\n        window.DigiAndroid.notify(String(item.title || 'digiRupee'), String(item.message || ''));\n        seenNotifications.add(String(item.id));\n        persistSeenNativeNotifications();\n      } catch {}\n    });\n  }`;
if (enhancements.includes(oldNotificationGuard)) {
  enhancements = enhancements.replace(oldNotificationGuard, persistentNotificationGuard);
  await writeFile(enhancementsPath, enhancements, 'utf8');
} else if (!enhancements.includes('SEEN_NATIVE_NOTIFICATIONS_KEY')) {
  throw new Error('digiRupee notification dedupe hook was not found');
}

let html = await readFile(htmlPath, 'utf8');
const scriptTag = '<script src="/digirupee-device-fixes.js?v=20260919c" defer></script>';
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

const rewardHeroScriptTag = '<script src="/digirupee-reward-hero-fix.js?v=20260919a" defer></script>';
if (/\/digirupee-reward-hero-fix\.js(?:\?v=[^"']+)?/.test(html)) {
  html = html.replace(/<script src="\/digirupee-reward-hero-fix\.js(?:\?v=[^"']+)?" defer><\/script>/, rewardHeroScriptTag);
} else {
  html = html.replace(/<\/body>/i, `${rewardHeroScriptTag}</body>`);
}

const enhancementsScriptTag = '<script src="/digirupee-enhancements.js?v=20260919c" defer></script>';
if (/\/digirupee-enhancements\.js(?:\?v=[^"']+)?/.test(html)) {
  html = html.replace(/<script src="\/digirupee-enhancements\.js(?:\?v=[^"']+)?" defer><\/script>/, enhancementsScriptTag);
} else {
  throw new Error('digiRupee enhancements script tag was not found');
}
await writeFile(htmlPath, html, 'utf8');

let runtime = await readFile(runtimePath, 'utf8');
for (const asset of ['/digirupee-device-fixes.js', '/digirupee-profile-polish.js', '/digirupee-reward-hero-fix.js']) {
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
console.log('Enabled digiRupee clean responsive UI, referral handoff, profile polish, rewards hero balance, persistent notification dedupe and live reward tasks');
