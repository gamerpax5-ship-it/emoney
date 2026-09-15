import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { watch as fsWatch, watchFile as fsWatchFile } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const dataFile = join(root, 'runtime-data.json');
const uploadDir = join(root, 'uploads');
const supabaseUrl = String(process.env.SUPABASE_URL || process.env.LOKTRON_SUPABASE_URL || '').replace(/\/$/, '');
const supabaseKey = String(process.env.SUPABASE_SECRET_KEY || process.env.LOKTRON_SUPABASE_KEY || '');
const persistenceSecret = String(process.env.LOKTRON_PERSISTENCE_SECRET || '');
const persistenceEnabled = !!(supabaseUrl && supabaseKey && persistenceSecret);

const baseHeaders = {
  apikey: supabaseKey,
  Authorization: `Bearer ${supabaseKey}`,
  'x-loktron-secret': persistenceSecret,
  'Content-Type': 'application/json'
};

async function rest(path, options = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: { ...baseHeaders, ...(options.headers || {}) }
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Supabase persistence ${response.status}: ${text.slice(0, 300)}`);
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function restoreState() {
  if (!persistenceEnabled) return false;
  const rows = await rest('loktron_state?key=eq.main&select=payload');
  const payload = Array.isArray(rows) && rows[0]?.payload;
  if (!payload || typeof payload !== 'object') return false;
  await writeFile(dataFile, JSON.stringify(payload, null, 2), 'utf8');
  console.log('Restored LOKTRON state from Supabase');
  return true;
}

async function persistState() {
  if (!persistenceEnabled) return;
  let payload;
  try { payload = JSON.parse(await readFile(dataFile, 'utf8')); }
  catch { return; }
  await rest('loktron_state?on_conflict=key', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{ key: 'main', payload, updated_at: new Date().toISOString() }])
  });
}

function mimeFor(name) {
  const ext = extname(name).toLowerCase();
  return ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
}

async function restoreFiles() {
  if (!persistenceEnabled) return;
  await mkdir(uploadDir, { recursive: true });
  const rows = await rest('loktron_files?select=name,mime,content_b64');
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!/^[A-Za-z0-9._-]{1,180}$/.test(String(row.name || ''))) continue;
    if (!row.content_b64) continue;
    await writeFile(join(uploadDir, row.name), Buffer.from(row.content_b64, 'base64'));
  }
  if (Array.isArray(rows) && rows.length) console.log(`Restored ${rows.length} payment proof file(s) from Supabase`);
}

async function persistFile(name) {
  if (!persistenceEnabled || !/^[A-Za-z0-9._-]{1,180}$/.test(String(name || ''))) return;
  let raw;
  try { raw = await readFile(join(uploadDir, name)); }
  catch { return; }
  await rest('loktron_files?on_conflict=name', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{
      name,
      mime: mimeFor(name),
      content_b64: raw.toString('base64'),
      updated_at: new Date().toISOString()
    }])
  });
}

async function persistAllFiles() {
  if (!persistenceEnabled) return;
  let files = [];
  try { files = await readdir(uploadDir); } catch { return; }
  for (const name of files) await persistFile(name);
}

let stateTimer;
const fileTimers = new Map();
function queueStateSync() {
  clearTimeout(stateTimer);
  stateTimer = setTimeout(() => persistState().catch(e => console.error(e.message)), 250);
}
function queueFileSync(name) {
  if (!name) return;
  clearTimeout(fileTimers.get(name));
  const timer = setTimeout(() => {
    fileTimers.delete(name);
    persistFile(name).catch(e => console.error(e.message));
  }, 350);
  fileTimers.set(name, timer);
}

await mkdir(uploadDir, { recursive: true });
if (persistenceEnabled) {
  try {
    await restoreState();
    await restoreFiles();
  } catch (error) {
    console.error('Remote restore failed:', error.message);
  }
} else {
  console.warn('Supabase persistence is not configured; runtime data is ephemeral.');
}

await import('../scripts/enable-permanent-rewards.mjs');
await import('./server-runtime.mjs');

if (persistenceEnabled) {
  if (String(process.env.AUDIT_REPAIR_ON_BOOT || '').toLowerCase() === 'true') {
    try {
      await persistState();
    } catch (error) {
      console.error('Initial persistence sync failed:', error.message);
    }
  }
  fsWatchFile(dataFile, { interval: 500 }, queueStateSync);
  try {
    fsWatch(uploadDir, (event, filename) => queueFileSync(String(filename || '')));
  } catch (error) {
    console.error('Upload watcher unavailable:', error.message);
  }
  console.log('Supabase persistence watcher active');
}

let shuttingDown = false;
async function flushAndExit(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal}: flushing LOKTRON persistence`);
  try {
    await persistState();
    await persistAllFiles();
  } catch (error) {
    console.error('Final persistence flush failed:', error.message);
  }
  process.exit(0);
}
process.on('SIGTERM', () => flushAndExit('SIGTERM'));
process.on('SIGINT', () => flushAndExit('SIGINT'));
