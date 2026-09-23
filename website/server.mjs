import http from 'node:http';
import { readFile, stat, mkdir, writeFile, rename } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  randomBytes,
  randomUUID,
  randomInt,
  createHash,
  createHmac,
  createCipheriv,
  createDecipheriv,
  scryptSync,
  timingSafeEqual
} from 'node:crypto';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 3000);
const dataRoot = String(process.env.LOKTRON_DATA_DIR || root);
const dataFile = join(dataRoot, 'runtime-data.json');
const uploadDir = join(dataRoot, 'uploads');
const sessionSecret = String(process.env.SESSION_SECRET || randomBytes(48).toString('hex'));
const sessionMaxAge = 60 * 60 * 24 * 7;
const adminSessionMaxAge = 60 * 60 * 12;
const production = process.env.NODE_ENV === 'production';
const configuredOrigins = [...new Set([
  ...(production ? ['https://loktron.com'] : []),
  ...String(process.env.PUBLIC_ORIGIN || '')
  .split(',')
  .map(v => v.trim().replace(/\/$/, ''))
  .filter(Boolean)
])];
const emoneyPublicOrigin = 'https://emoney-production-3e0a.up.railway.app';
function digiReferralOrigin() {
  return emoneyPublicOrigin;
}
const supabaseUrl = String(process.env.SUPABASE_URL || process.env.LOKTRON_SUPABASE_URL || '').replace(/\/$/, '');
const supabaseSecretKey = String(process.env.SUPABASE_SECRET_KEY || process.env.LOKTRON_SUPABASE_KEY || '');
const persistenceSecret = String(process.env.LOKTRON_PERSISTENCE_SECRET || '');
const tronApiUrl = String(process.env.TRON_API_URL || 'https://api.trongrid.io').replace(/\/$/, '');
const tronApiKey = String(process.env.TRONGRID_API_KEY || '');
const tronUsdtContract = String(process.env.TRON_USDT_CONTRACT || 'TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj');
const tronVerifyMode = String(process.env.TRON_VERIFY_MODE || (production ? 'required' : 'manual')).toLowerCase();
const digiTwoFactorEncryptionKey = String(process.env.DIGIRUPEE_2FA_ENCRYPTION_KEY || '');
const tronNetwork = String(process.env.TRON_NETWORK || 'mainnet').trim().toLowerCase();
const envNumber = (name, fallback) => Number.isFinite(Number(process.env[name])) ? Number(process.env[name]) : fallback;
const tronRequiredConfirmations = Math.max(1, Math.min(10_000, envNumber('TRON_REQUIRED_CONFIRMATIONS', 19)));
const tronPollIntervalMs = Math.max(1_000, Math.min(300_000, envNumber('TRON_POLL_INTERVAL_MS', 15_000)));
const tronProviderTimeoutMs = Math.max(2_000, Math.min(30_000, envNumber('TRON_PROVIDER_TIMEOUT_MS', 10_000)));
const tronLateDepositGraceMs = Math.max(60_000, Math.min(7 * 24 * 60 * 60 * 1000, envNumber('TRON_LATE_DEPOSIT_GRACE_MS', 24 * 60 * 60 * 1000)));
const tronAddressReuseCooldownMs = Math.max(tronLateDepositGraceMs, Math.min(30 * 24 * 60 * 60 * 1000, envNumber('TRON_ADDRESS_REUSE_COOLDOWN_MS', 48 * 60 * 60 * 1000)));
// Clean expiries (no tx ever detected) should not strand a small receiving-address pool for 48 hours.
// Five minutes is the production default; tx-bearing/review cases still keep the long safety cooldown.
const tronExpiredAddressReuseMs = Math.max(1_000, Math.min(60 * 60 * 1000, envNumber('TRON_EXPIRED_ADDRESS_REUSE_MS', 5 * 60 * 1000)));
const tronMockScenario = String(process.env.TRON_MOCK_SCENARIO || 'no-transaction').trim().toLowerCase();
const tronMockConfirmationSequence = String(process.env.TRON_MOCK_CONFIRMATION_SEQUENCE || '').split(',').map(value => value.trim()).filter(Boolean).map(value => Number(value)).filter(value => Number.isInteger(value) && value >= 0);
const tronMockConfirmations = Math.max(0, envNumber('TRON_MOCK_CONFIRMATIONS', tronRequiredConfirmations));
const alertWebhookUrl = String(process.env.ALERT_WEBHOOK_URL || '').trim();

if (production && tronVerifyMode === 'mock') {
  throw new Error('TRON_VERIFY_MODE=mock is not permitted in production');
}

if (!process.env.SESSION_SECRET) {
  console.warn('SESSION_SECRET is not configured; sessions will reset when this process restarts.');
}

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8'
};

const indexFile = join(root, 'index.html');
async function ensureIndexFile() {
  try {
    if ((await stat(indexFile)).isFile()) return;
  } catch {}
  await import('./assemble-src.mjs');
}

function legacyHash(v) {
  return createHash('sha256').update(String(v)).digest('hex');
}

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  stored = String(stored || '');
  if (stored.startsWith('scrypt$')) {
    const [, salt, expectedHex] = stored.split('$');
    if (!salt || !expectedHex) return false;
    const actual = scryptSync(String(password), salt, 64);
    const expected = Buffer.from(expectedHex, 'hex');
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }
  return stored === legacyHash(password);
}

const defaultData = {
  config: {
    rate: 112.40,
    network: 'TRC20',
    minInr: 1000,
    maxInr: 1000000,
    paymentMode: 'IMPS / NEFT / RTGS',
    support: {
      label: 'Online',
      telegram: '',
      note: 'Payment, wallet and UTR support is available from the dashboard.'
    },
    currencies: [
      { code: 'INR', name: 'Indian Rupee', symbol: '₹', status: 'live', note: 'Indian fiat rail is active.' },
      { code: 'USD', name: 'US Dollar', symbol: '$', status: 'live', note: 'US Dollar fiat rail is active.' },
      { code: 'BDT', name: 'Bangladeshi Taka', symbol: '৳', status: 'coming-soon', note: 'Bangladesh fiat rail is prepared for rollout.' },
      { code: 'PKR', name: 'Pakistani Rupee', symbol: '₨', status: 'coming-soon', note: 'Pakistan fiat rail is prepared for rollout.' },
      { code: 'EUR', name: 'Euro', symbol: '€', status: 'coming-soon', note: 'Euro payment rail is prepared for rollout.' },
      { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', status: 'coming-soon', note: 'Chinese Yuan fiat rail is prepared for rollout.' },
      { code: 'GBP', name: 'British Pound', symbol: '£', status: 'coming-soon', note: 'UK fiat rail is prepared for rollout.' },
      { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ', status: 'coming-soon', note: 'UAE fiat rail is prepared for rollout.' }
    ],
    bank: {
      bank: 'HDFC Bank',
      accountName: 'LOKTRON SERVICES',
      accountNumber: 'XXXX XXXX 4582',
      ifsc: 'HDFC0001234',
      transferTypes: 'IMPS / NEFT / RTGS'
    }
  },
  users: [],
  orders: [],
  bankLedger: [],
  tickets: [],
  auditLog: [],
  adminSessions: [],
  notifications: [],
  legacyRevokedSessions: [],
  // digiRupee/WTRON has its own state namespace. It intentionally starts
  // without demo users, payout methods, orders, rewards, or notifications.
  digirupee: {
    config: {
      rates: { upi: 111.24, bank: 108 },
      limits: { upiMinUsdt: 1000, bankMinUsdt: 5000, globalMaxUsdt: 50000 },
      quoteValiditySeconds: 600,
      channels: { upi: true, bank: true },
      updatedAt: Date.now(),
      referrals: { enabled: true, inviterCommissionPercent: 0.5, inviterRewardUsdt: 10, referredRewardUsdt: 0, minimumCompletedUsdt: 0 },
      rewardPage: {
        showMascot: true,
        showCoins: true,
        heroKicker: 'BONUS ZONE',
        heroTitle: 'Play More.\nEarn More.',
        heroSubtitle: 'Daily rewards, referrals and campaign tasks—powered by your real account activity.',
        liveNewsEnabled: true,
        liveNewsText: '',
        zones: { newuser: true, invite: true, tasks: true, events: true }
      }
    },
    users: [],
    payoutMethods: [],
    quotes: [],
    orders: [],
    tronAddresses: [],
    addressAssignments: [],
    rewards: [],
    rewardLedger: [],
    campaigns: [],
    taskClaims: [],
    wheelConfig: { enabled: false, dailyClaimLimit: 1, segments: [], updatedAt: Date.now() },
    wheelClaims: [],
    referrals: [],
    pendingReferralInstalls: [],
    supportTickets: [],
    notifications: [],
    authChallenges: [],
    auditLog: [],
    sessions: []
  }
};

let db = await loadDb();

function ensureLoktronFiatCurrencies() {
  const current = Array.isArray(db.config?.currencies) ? db.config.currencies : [];
  const base = structuredClone(defaultData.config.currencies);
  const baseCodes = new Set(base.map(item => item.code));
  const extras = current
    .filter(item => {
      const code = String(item?.code || '').trim().toUpperCase();
      return code && code !== 'USDT' && !baseCodes.has(code);
    })
    .slice(0, Math.max(0, 12 - base.length));
  const next = [...base, ...extras];
  let changed = JSON.stringify(current) !== JSON.stringify(next);
  db.config.currencies = next;
  for (const user of db.users) {
    if (String(user.currency || '').toUpperCase() === 'USDT') {
      user.currency = 'INR';
      changed = true;
    }
  }
  return changed;
}

const adminUsers = parseAdminUsers();
const adminConfigured = adminUsers.length > 0;

if (production && !adminConfigured) {
  console.error('Admin login is disabled until ADMIN_EMAIL and ADMIN_PASSWORD or ADMIN_PASSWORD_HASH are configured.');
}

async function loadDb() {
  try {
    const parsed = JSON.parse(await readFile(dataFile, 'utf8'));
    return {
      ...structuredClone(defaultData),
      ...parsed,
      config: {
        ...structuredClone(defaultData.config),
        ...(parsed.config || {}),
        bank: { ...structuredClone(defaultData.config.bank), ...((parsed.config || {}).bank || {}) },
        support: { ...structuredClone(defaultData.config.support), ...((parsed.config || {}).support || {}) },
        currencies: Array.isArray((parsed.config || {}).currencies) && (parsed.config || {}).currencies.length
          ? (parsed.config || {}).currencies
          : structuredClone(defaultData.config.currencies)
      },
      users: Array.isArray(parsed.users) ? parsed.users : [],
      orders: Array.isArray(parsed.orders) ? parsed.orders : [],
      bankLedger: Array.isArray(parsed.bankLedger) ? parsed.bankLedger : [],
      tickets: Array.isArray(parsed.tickets) ? parsed.tickets : [],
      notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
      legacyRevokedSessions: Array.isArray(parsed.legacyRevokedSessions) ? parsed.legacyRevokedSessions : [],
      auditLog: Array.isArray(parsed.auditLog) ? parsed.auditLog : [],
      adminSessions: Array.isArray(parsed.adminSessions) ? parsed.adminSessions : [],
      digirupee: {
        ...structuredClone(defaultData.digirupee),
        ...(parsed.digirupee || {}),
        config: {
          ...structuredClone(defaultData.digirupee.config),
          ...((parsed.digirupee || {}).config || {}),
          rates: {
            ...structuredClone(defaultData.digirupee.config.rates),
            ...(((parsed.digirupee || {}).config || {}).rates || {})
          },
          limits: {
            ...structuredClone(defaultData.digirupee.config.limits),
            ...(((parsed.digirupee || {}).config || {}).limits || {})
          },
          channels: {
            ...structuredClone(defaultData.digirupee.config.channels),
            ...(((parsed.digirupee || {}).config || {}).channels || {})
          },
          referrals: {
            ...structuredClone(defaultData.digirupee.config.referrals),
            ...(((parsed.digirupee || {}).config || {}).referrals || {})
          },
          rewardPage: {
            ...structuredClone(defaultData.digirupee.config.rewardPage),
            ...(((parsed.digirupee || {}).config || {}).rewardPage || {}),
            zones: {
              ...structuredClone(defaultData.digirupee.config.rewardPage.zones),
              ...((((parsed.digirupee || {}).config || {}).rewardPage || {}).zones || {})
            }
          }
        },
        users: Array.isArray((parsed.digirupee || {}).users) ? (parsed.digirupee || {}).users : [],
        payoutMethods: Array.isArray((parsed.digirupee || {}).payoutMethods) ? (parsed.digirupee || {}).payoutMethods : [],
        quotes: Array.isArray((parsed.digirupee || {}).quotes) ? (parsed.digirupee || {}).quotes : [],
        orders: Array.isArray((parsed.digirupee || {}).orders) ? (parsed.digirupee || {}).orders : [],
        tronAddresses: Array.isArray((parsed.digirupee || {}).tronAddresses) ? (parsed.digirupee || {}).tronAddresses : [],
        addressAssignments: Array.isArray((parsed.digirupee || {}).addressAssignments) ? (parsed.digirupee || {}).addressAssignments : [],
        rewards: Array.isArray((parsed.digirupee || {}).rewards) ? (parsed.digirupee || {}).rewards : [],
        rewardLedger: Array.isArray((parsed.digirupee || {}).rewardLedger) ? (parsed.digirupee || {}).rewardLedger : [],
        campaigns: Array.isArray((parsed.digirupee || {}).campaigns) ? (parsed.digirupee || {}).campaigns : [],
        taskClaims: Array.isArray((parsed.digirupee || {}).taskClaims) ? (parsed.digirupee || {}).taskClaims : [],
        wheelConfig: {
          ...structuredClone(defaultData.digirupee.wheelConfig),
          ...((parsed.digirupee || {}).wheelConfig || {}),
          segments: Array.isArray((parsed.digirupee || {}).wheelConfig?.segments) ? (parsed.digirupee || {}).wheelConfig.segments : []
        },
        wheelClaims: Array.isArray((parsed.digirupee || {}).wheelClaims) ? (parsed.digirupee || {}).wheelClaims : [],
        referrals: Array.isArray((parsed.digirupee || {}).referrals) ? (parsed.digirupee || {}).referrals : [],
        pendingReferralInstalls: Array.isArray((parsed.digirupee || {}).pendingReferralInstalls) ? (parsed.digirupee || {}).pendingReferralInstalls : [],
        supportTickets: Array.isArray((parsed.digirupee || {}).supportTickets) ? (parsed.digirupee || {}).supportTickets : [],
        notifications: Array.isArray((parsed.digirupee || {}).notifications) ? (parsed.digirupee || {}).notifications : [],
        authChallenges: Array.isArray((parsed.digirupee || {}).authChallenges) ? (parsed.digirupee || {}).authChallenges : [],
        auditLog: Array.isArray((parsed.digirupee || {}).auditLog) ? (parsed.digirupee || {}).auditLog : [],
        sessions: Array.isArray((parsed.digirupee || {}).sessions) ? (parsed.digirupee || {}).sessions : []
      }
    };
  } catch {
    return structuredClone(defaultData);
  }
}

let persistQueue = Promise.resolve();
function persist() {
  persistQueue = persistQueue.then(async () => {
    await mkdir(dataRoot, { recursive: true });
    const temporary = `${dataFile}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(db, null, 2), { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, dataFile);
  }).catch(error => {
    console.error('persist failed', error.message);
    throw error;
  });
  return persistQueue;
}

function send(res, status, data, extra = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'SAMEORIGIN',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    ...(production ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' } : {}),
    ...extra
  });
  res.end(JSON.stringify(data));
}

async function body(req, limit = 4 * 1024 * 1024) {
  const chunks = [];
  let n = 0;
  for await (const chunk of req) {
    n += chunk.length;
    if (n > limit) throw Object.assign(new Error('Payload too large'), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('Invalid JSON'), { status: 400 });
  }
}

function bearer(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

function safeEqualText(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}

function readCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

function makeSession(uid) {
  const payload = Buffer.from(JSON.stringify({
    uid,
    exp: Date.now() + sessionMaxAge * 1000
  })).toString('base64url');
  const sig = createHmac('sha256', sessionSecret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function makeAdminSession(admin) {
  const now = Date.now();
  const id = 'ads_' + randomUUID().replace(/-/g, '').slice(0, 16);
  const payload = Buffer.from(JSON.stringify({
    email: admin.email,
    role: admin.role,
    jti: id,
    exp: now + adminSessionMaxAge * 1000
  })).toString('base64url');
  const sig = createHmac('sha256', sessionSecret).update(`admin:${payload}`).digest('base64url');
  const token = `${payload}.${sig}`;
  db.adminSessions = Array.isArray(db.adminSessions) ? db.adminSessions : [];
  db.adminSessions = db.adminSessions.filter(item => !item.revokedAt && Number(item.expiresAt) > now);
  db.adminSessions.push({
    id,
    tokenHash: createHash('sha256').update(token).digest('hex'),
    email: admin.email,
    role: admin.role,
    createdAt: now,
    expiresAt: now + adminSessionMaxAge * 1000,
    revokedAt: null
  });
  return token;
}

function verifyAdminSession(token) {
  try {
    const [payload, sig] = String(token || '').split('.');
    if (!payload || !sig) return '';
    const expected = createHmac('sha256', sessionSecret).update(`admin:${payload}`).digest();
    const actual = Buffer.from(sig, 'base64url');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return '';
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.email || !data.jti || Number(data.exp) < Date.now()) return '';
    const admin = findAdmin(data.email);
    if (!admin || admin.role !== data.role) return '';
    const tokenHash = createHash('sha256').update(String(token)).digest('hex');
    const session = (db.adminSessions || []).find(item =>
      item.id === data.jti &&
      item.tokenHash === tokenHash &&
      !item.revokedAt &&
      Number(item.expiresAt) > Date.now()
    );
    if (!session) return '';
    return admin;
  } catch {
    return null;
  }
}

function revokeAdminSession(token) {
  const tokenHash = createHash('sha256').update(String(token || '')).digest('hex');
  const session = (db.adminSessions || []).find(item => item.tokenHash === tokenHash && !item.revokedAt);
  if (session) session.revokedAt = Date.now();
  return session;
}

function verifySession(token) {
  try {
    const [payload, sig] = String(token || '').split('.');
    if (!payload || !sig) return '';
    const expected = createHmac('sha256', sessionSecret).update(payload).digest();
    const actual = Buffer.from(sig, 'base64url');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return '';
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.uid || Number(data.exp) < Date.now()) return '';
    const tokenHash = createHash('sha256').update(String(token)).digest('hex');
    if ((db.legacyRevokedSessions || []).some(item => item.tokenHash === tokenHash && Number(item.expiresAt) > Date.now())) return '';
    return String(data.uid);
  } catch {
    return '';
  }
}

function revokeLegacySession(token) {
  if (!token) return false;
  const now = Date.now();
  const tokenHash = createHash('sha256').update(String(token)).digest('hex');
  db.legacyRevokedSessions = (db.legacyRevokedSessions || [])
    .filter(item => Number(item.expiresAt) > now && item.tokenHash !== tokenHash);
  db.legacyRevokedSessions.push({ tokenHash, expiresAt: now + sessionMaxAge * 1000, revokedAt: now });
  return true;
}

function sessionToken(req) {
  return readCookies(req).loktron_session || bearer(req);
}

function sessionCookie(req, token, maxAge = sessionMaxAge) {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  const secure = production || forwardedProto === 'https' ? '; Secure' : '';
  return `loktron_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function clearSessionCookie(req) {
  return sessionCookie(req, '', 0);
}

const digiSessionCookieName = 'digirupee_session';
function digiSessionToken(req) {
  return readCookies(req)[digiSessionCookieName] || bearer(req);
}

function digiSessionHash(token) {
  return createHash('sha256').update(String(token || '')).digest('hex');
}

function makeDigiSession(uid) {
  const payload = Buffer.from(JSON.stringify({
    scope: 'digirupee',
    uid,
    exp: Date.now() + sessionMaxAge * 1000
  })).toString('base64url');
  const sig = createHmac('sha256', sessionSecret).update(`digirupee:${payload}`).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyDigiSession(token) {
  try {
    const [payload, sig] = String(token || '').split('.');
    if (!payload || !sig) return '';
    const expected = createHmac('sha256', sessionSecret).update(`digirupee:${payload}`).digest();
    const actual = Buffer.from(sig, 'base64url');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return '';
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (data.scope !== 'digirupee' || !data.uid || Number(data.exp) < Date.now()) return '';
    const tokenHash = digiSessionHash(token);
    const session = db.digirupee.sessions.find(item => item.tokenHash === tokenHash);
    if (!session || session.revokedAt || Number(session.expiresAt) < Date.now()) return '';
    return String(data.uid);
  } catch {
    return '';
  }
}

function digiSessionCookie(req, token, maxAge = sessionMaxAge) {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  const secure = production || forwardedProto === 'https' ? '; Secure' : '';
  return `${digiSessionCookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

const adminSessionCookieName = 'loktron_admin_session';
function adminSessionToken(req) {
  return readCookies(req)[adminSessionCookieName] || bearer(req);
}

function adminSessionCookie(req, token, maxAge = adminSessionMaxAge) {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  const secure = production || forwardedProto === 'https' ? '; Secure' : '';
  return `${adminSessionCookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

function clearAdminSessionCookie(req) {
  return adminSessionCookie(req, '', 0);
}

function clearDigiSessionCookie(req) {
  return digiSessionCookie(req, '', 0);
}

function digiSessionIpHash(req) {
  const raw = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  return createHash('sha256').update(`${sessionSecret}|${raw}`).digest('hex').slice(0, 24);
}

const digiReferralCodePattern = /^DGR[A-F0-9]{10}$/;
function normalizeDigiReferralCode(value) {
  const code = String(value || '').trim().toUpperCase();
  return digiReferralCodePattern.test(code) ? code : '';
}

async function recordDigiPendingReferralInstall(req, value) {
  const referralCode = normalizeDigiReferralCode(value);
  if (!referralCode) return false;
  const referrer = db.digirupee.users.find(item => String(item.referralCode || '').toUpperCase() === referralCode);
  if (!referrer) return false;
  const now = Date.now();
  const key = digiSessionIpHash(req);
  db.digirupee.pendingReferralInstalls = (Array.isArray(db.digirupee.pendingReferralInstalls) ? db.digirupee.pendingReferralInstalls : [])
    .filter(item => Number(item.expiresAt || 0) > now && item.key !== key && !item.claimedAt);
  db.digirupee.pendingReferralInstalls.push({ key, referralCode: referrer.referralCode, createdAt: now, expiresAt: now + 6 * 60 * 60 * 1000, claimedAt: null });
  await persist();
  return true;
}

function digiDeviceLabel(userAgent) {
  const ua = String(userAgent || '');
  if (/android/i.test(ua) && /wv|webview/i.test(ua)) return 'Android WebView';
  if (/android/i.test(ua)) return 'Android';
  if (/iphone|ipad/i.test(ua)) return /safari/i.test(ua) ? 'Safari · iPhone' : 'iPhone/iPad';
  if (/edg/i.test(ua)) return 'Edge · Windows';
  if (/chrome/i.test(ua)) return 'Chrome · Windows';
  if (/firefox/i.test(ua)) return 'Firefox · Desktop';
  if (/safari/i.test(ua)) return 'Safari · Desktop';
  return 'Unknown device';
}

function registerDigiSession(uid, token, req = null) {
  const now = Date.now();
  db.digirupee.sessions = db.digirupee.sessions.filter(item => Number(item.expiresAt) > now && !item.revokedAt);
  const session = {
    id: `dgs_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
    tokenHash: digiSessionHash(token),
    uid,
    userId: uid,
    createdAt: now,
    expiresAt: now + sessionMaxAge * 1000,
    revokedAt: null,
    lastSeenAt: now,
    ipHash: req ? digiSessionIpHash(req) : null,
    userAgent: req ? String(req.headers['user-agent'] || '').slice(0, 300) : '',
    deviceLabel: req ? digiDeviceLabel(req.headers['user-agent']) : 'Unknown device'
  };
  db.digirupee.sessions.push(session);
  return session;
}

function ensureDigiSessionFields() {
  let changed = false;
  for (const session of db.digirupee.sessions) {
    if (!session.id) { session.id = `dgs_${randomUUID().replace(/-/g, '').slice(0, 12)}`; changed = true; }
    if (!session.userId && session.uid) { session.userId = session.uid; changed = true; }
    if (!session.createdAt) { session.createdAt = Date.now(); changed = true; }
    if (!session.lastSeenAt) { session.lastSeenAt = session.createdAt; changed = true; }
    if (!session.revokedAt) session.revokedAt = null;
    if (!session.deviceLabel) { session.deviceLabel = digiDeviceLabel(session.userAgent); changed = true; }
  }
  return changed;
}

function revokeDigiSession(token) {
  const tokenHash = digiSessionHash(token);
  const session = db.digirupee.sessions.find(item => item.tokenHash === tokenHash);
  if (session) session.revokedAt = Date.now();
  return session;
}

function digiSessionRecord(token) {
  return db.digirupee.sessions.find(item => item.tokenHash === digiSessionHash(token) && !item.revokedAt && Number(item.expiresAt) > Date.now()) || null;
}

function revokeOtherDigiSessions(userId, currentSessionId = null) {
  const now = Date.now(); let count = 0;
  for (const session of db.digirupee.sessions) {
    if ((session.userId || session.uid) === userId && session.id !== currentSessionId && !session.revokedAt && Number(session.expiresAt) > now) { session.revokedAt = now; count += 1; }
  }
  return count;
}

function normalizeDigiMobile(value) {
  const raw = String(value || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return `+${digits}`;
  return '';
}

const digiTicketCategories = new Set(['ORDER', 'DEPOSIT', 'PAYOUT', 'ACCOUNT', 'OTHER']);
const digiTicketStatuses = new Set(['Open', 'In Progress', 'Resolved', 'Closed']);
const digiCriticalNotificationTypes = new Set(['order', 'deposit', 'payout', 'support', 'security', 'referral']);

function createDigiNotification({ userId, type, title, message, entityType = null, entityId = null, sourceKey = null }) {
  const user = db.digirupee.users.find(item => item.id === userId);
  if (!user) return null;
  if (sourceKey && db.digirupee.notifications.some(item => item.sourceKey === sourceKey)) return db.digirupee.notifications.find(item => item.sourceKey === sourceKey);
  if (!digiCriticalNotificationTypes.has(type) && user.profile?.notificationPreference === false) return null;
  const notification = { id: `dn_${randomUUID().replace(/-/g, '').slice(0, 12)}`, userId, type: String(type).slice(0, 30), title: String(title || '').trim().slice(0, 120), message: String(message || '').trim().slice(0, 500), entityType: entityType ? String(entityType).slice(0, 60) : null, entityId: entityId ? String(entityId).slice(0, 100) : null, readAt: null, createdAt: Date.now(), sourceKey };
  db.digirupee.notifications.push(notification);
  return notification;
}

function publicDigiNotification(notification) {
  return { id: notification.id, type: notification.type, title: notification.title, message: notification.message, entityType: notification.entityType, entityId: notification.entityId, readAt: notification.readAt || null, createdAt: notification.createdAt };
}

function publicDigiTicket(ticket, admin = false) {
  const user = db.digirupee.users.find(item => item.id === ticket.userId);
  return { id: ticket.id, userId: ticket.userId, user: admin && user ? { id: user.id, name: user.profile?.fullName || '', email: user.email } : undefined, category: ticket.category, subject: ticket.subject, message: ticket.message, orderId: ticket.orderId || null, priority: ticket.priority, status: ticket.status, createdAt: ticket.createdAt, updatedAt: ticket.updatedAt, closedAt: ticket.closedAt || null, messages: (ticket.messages || []).map(item => ({ id: item.id, senderType: item.senderType, senderId: item.senderType === 'admin' ? 'admin' : item.senderId, text: item.text, createdAt: item.createdAt })) };
}

function ensureDigiSecurityFields() {
  let changed = false;
  for (const user of db.digirupee.users) {
    if (!user.security || typeof user.security !== 'object') { user.security = { twoFactor: { enabled: false, secretCiphertext: null, pendingSecretCiphertext: null, backupCodeHashes: [], enabledAt: null }, lastLoginAt: null }; changed = true; }
    if (!user.security.twoFactor || typeof user.security.twoFactor !== 'object') { user.security.twoFactor = { enabled: false, secretCiphertext: null, pendingSecretCiphertext: null, backupCodeHashes: [], enabledAt: null }; changed = true; }
    const twoFactor = user.security.twoFactor;
    for (const key of ['enabled', 'secretCiphertext', 'pendingSecretCiphertext', 'backupCodeHashes', 'enabledAt']) if (twoFactor[key] === undefined) { twoFactor[key] = key === 'enabled' ? false : key === 'backupCodeHashes' ? [] : null; changed = true; }
    if (!Array.isArray(twoFactor.backupCodeHashes)) { twoFactor.backupCodeHashes = []; changed = true; }
    if (user.security.lastLoginAt === undefined) { user.security.lastLoginAt = null; changed = true; }
  }
  return changed;
}

function digiTwoFactorKey() {
  if (!digiTwoFactorEncryptionKey) throw Object.assign(new Error('digiRupee 2FA encryption is not configured'), { status: 503 });
  return createHash('sha256').update(digiTwoFactorEncryptionKey).digest();
}

function encryptDigiSecret(secret) {
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', digiTwoFactorKey(), iv); const data = Buffer.concat([cipher.update(String(secret), 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${data.toString('base64url')}`;
}

function decryptDigiSecret(value) {
  try { const [version, iv, tag, data] = String(value || '').split('.'); if (version !== 'v1' || !iv || !tag || !data) return ''; const decipher = createDecipheriv('aes-256-gcm', digiTwoFactorKey(), Buffer.from(iv, 'base64url')); decipher.setAuthTag(Buffer.from(tag, 'base64url')); return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8'); } catch { return ''; }
}

function base32Decode(value) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = ''; const clean = String(value || '').replace(/=+$/g, '').toUpperCase();
  for (const char of clean) { const index = alphabet.indexOf(char); if (index < 0) return null; bits += index.toString(2).padStart(5, '0'); }
  const bytes = []; for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(bytes);
}

function base32Encode(buffer) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = ''; for (const byte of buffer) bits += byte.toString(2).padStart(8, '0'); let output = ''; for (let i = 0; i < bits.length; i += 5) output += alphabet[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)]; return output;
}

function totpCode(secret, timestamp = Date.now()) {
  const key = base32Decode(secret); if (!key) return '';
  const counter = Math.floor(timestamp / 30_000); const buffer = Buffer.alloc(8); buffer.writeBigUInt64BE(BigInt(counter)); const digest = createHmac('sha1', key).update(buffer).digest(); const offset = digest.at(-1) & 15; const value = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000; return String(value).padStart(6, '0');
}

function validTotp(secret, code) {
  const normalized = String(code || '').trim(); if (!/^\d{6}$/.test(normalized)) return false; return [-1, 0, 1].some(offset => safeEqualText(totpCode(secret, Date.now() + offset * 30_000), normalized));
}

function hashRecoveryCode(code) { return hashPassword(String(code || '').toUpperCase()); }

function verifyDigiSecondFactor(user, code, { consumeRecovery = true } = {}) {
  const twoFactor = user.security?.twoFactor; const secret = decryptDigiSecret(twoFactor?.secretCiphertext); if (secret && validTotp(secret, code)) return { valid: true, kind: 'totp' };
  const normalized = String(code || '').trim().toUpperCase();
  const recovery = (twoFactor?.backupCodeHashes || []).find(item => !item.usedAt && verifyPassword(normalized, item.hash));
  if (recovery) { if (consumeRecovery) recovery.usedAt = Date.now(); return { valid: true, kind: 'recovery' }; }
  return { valid: false };
}

function digiSecuritySummary(user) {
  const sessions = db.digirupee.sessions.filter(item => (item.userId || item.uid) === user.id && !item.revokedAt && Number(item.expiresAt) > Date.now());
  return { twoFactorEnabled: !!user.security?.twoFactor?.enabled, activeSessionCount: sessions.length, lastLoginAt: user.security?.lastLoginAt || null };
}

function publicDigiSession(session, currentTokenHash) {
  return { id: session.id || 'legacy-session', current: session.tokenHash === currentTokenHash, device: session.deviceLabel || digiDeviceLabel(session.userAgent), createdAt: session.createdAt, lastSeenAt: session.lastSeenAt || session.createdAt, expiresAt: session.expiresAt };
}

function createDigiAuthChallenge(userId) {
  const raw = randomBytes(24).toString('base64url'); const now = Date.now(); db.digirupee.authChallenges = db.digirupee.authChallenges.filter(item => Number(item.expiresAt) > now && !item.usedAt); db.digirupee.authChallenges.push({ id: `dgc_${randomUUID().replace(/-/g, '').slice(0, 12)}`, tokenHash: createHash('sha256').update(raw).digest('hex'), userId, createdAt: now, expiresAt: now + 5 * 60 * 1000, attempts: 0, usedAt: null }); return raw;
}

function consumeDigiAuthChallenge(raw) {
  const hash = createHash('sha256').update(String(raw || '')).digest('hex'); const challenge = db.digirupee.authChallenges.find(item => item.tokenHash === hash && !item.usedAt && Number(item.expiresAt) > Date.now()); if (!challenge || challenge.attempts >= 5) return null; return challenge;
}

function recoveryCodes() { return Array.from({ length: 8 }, () => randomBytes(5).toString('hex').toUpperCase()); }

function publicDigiUser(user) {
  return {
    id: user.id,
    email: user.email,
    mobile: user.mobile,
    fullName: user.profile.fullName,
    joinedAt: user.createdAt,
    accountStatus: user.status,
    language: user.profile.language,
    notificationPreference: user.profile.notificationPreference,
    referralCode: user.referralCode || null
  };
}

function digirupeeAuth(req) {
  const token = digiSessionToken(req);
  const uid = verifyDigiSession(token);
  if (!uid) throw Object.assign(new Error('Please login again'), { status: 401 });
  const user = db.digirupee.users.find(item => item.id === uid);
  if (!user) throw Object.assign(new Error('User not found'), { status: 401 });
  if (user.status !== 'active') throw Object.assign(new Error('Account is not active'), { status: 403 });
  const session = digiSessionRecord(token);
  if (session && Date.now() - Number(session.lastSeenAt || 0) >= 5 * 60 * 1000) { session.lastSeenAt = Date.now(); void persist().catch(() => {}); }
  return { token, user };
}

function publicDigiConfig() {
  const config = db.digirupee.config;
  return {
    rates: { upi: Number(config.rates.upi), bank: Number(config.rates.bank) },
    limits: {
      upiMinUsdt: Number(config.limits.upiMinUsdt),
      bankMinUsdt: Number(config.limits.bankMinUsdt),
      globalMaxUsdt: Number(config.limits.globalMaxUsdt)
    },
    quoteValiditySeconds: Number(config.quoteValiditySeconds),
    channels: { upi: !!config.channels.upi, bank: !!config.channels.bank },
    updatedAt: config.updatedAt
  };
}

const digiFinalStatuses = new Set(['Completed', 'Expired', 'Failed', 'Rejected']);
const digiActiveStatuses = new Set(['Awaiting Deposit', 'Detected', 'Confirming', 'USDT Confirmed', 'INR Processing', 'Late Review']);
const digiBankDistributionStatuses = new Set(['Detected', 'Confirming', 'USDT Confirmed', 'INR Processing', 'Late Review']);
const digiAddressCooldownMs = tronAddressReuseCooldownMs;

function digiOrderIsActive(order) {
  return digiActiveStatuses.has(String(order?.status || '')) && !digiFinalStatuses.has(String(order?.status || ''));
}

function digiOrderNeedsExclusiveAddress(order) {
  return ['Awaiting Deposit', 'Detected', 'Confirming', 'Late Review'].includes(String(order?.status || ''));
}

function parseInrPaise(value) {
  const raw = String(value ?? '').trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) return null;
  const [whole, fraction = ''] = raw.split('.');
  const paise = Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
  return Number.isSafeInteger(paise) ? paise : null;
}

function formatInrPaise(paise) {
  return Number((Number(paise) / 100).toFixed(2));
}

function parseUsdtMicros(value) {
  const raw = String(value ?? '').trim();
  if (!/^\d+(?:\.\d{1,6})?$/.test(raw)) return null;
  const [whole, fraction = ''] = raw.split('.');
  const micros = Number(whole) * 1_000_000 + Number((fraction + '000000').slice(0, 6));
  return Number.isSafeInteger(micros) ? micros : null;
}

function formatUsdtMicros(micros) {
  return Number((Number(micros) / 1_000_000).toFixed(6));
}

function rateToPaise(rate) {
  const paise = parseInrPaise(rate);
  return paise && paise > 0 ? paise : null;
}

function indiaDayKey(timestamp = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.filter(item => item.type !== 'literal').map(item => [item.type, item.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function nextIndiaMidnight(timestamp = Date.now()) {
  const [year, month, day] = indiaDayKey(timestamp).split('-').map(Number);
  return Date.UTC(year, month - 1, day + 1, 0, 0, 0, 0) - (5 * 60 + 30) * 60 * 1000;
}

function maskDigiValue(value, keepStart = 2, keepEnd = 2) {
  const text = String(value || '');
  if (text.length <= keepStart + keepEnd) return '*'.repeat(text.length);
  return `${text.slice(0, keepStart)}${'*'.repeat(Math.max(2, text.length - keepStart - keepEnd))}${text.slice(-keepEnd)}`;
}

function payoutMethodUsesActiveOrder(methodId) {
  return db.digirupee.orders.some(order => digiOrderIsActive(order) && (
    order.payoutMethodId === methodId || order.allocations?.some(item => item.payoutMethodId === methodId)
  ));
}

function dailyMethodUsagePaise(methodId, timestamp = Date.now()) {
  const today = indiaDayKey(timestamp);
  return db.digirupee.orders.reduce((total, order) => {
    if (indiaDayKey(order.createdAt) !== today || ['Expired', 'Failed', 'Rejected'].includes(order.status)) return total;
    if (order.payoutMethodId === methodId) return total + Number(order.inrPaise || 0);
    return total + (order.allocations || [])
      .filter(item => item.payoutMethodId === methodId)
      .reduce((sum, item) => sum + Number(item.inrPaise || 0), 0);
  }, 0);
}

function payoutMethodRemainingPaise(method, timestamp = Date.now()) {
  const dailyLimit = parseInrPaise(method.dailyLimitInr) || 0;
  return Math.max(0, dailyLimit - dailyMethodUsagePaise(method.id, timestamp));
}

function payoutMethodPerTradeMaxPaise(method) {
  const configuredMax = parseInrPaise(method?.maxInr) || 0;
  if (String(method?.type || '').toUpperCase() !== 'UPI') return configuredMax;
  const dailyLimit = parseInrPaise(method?.dailyLimitInr) || 0;
  return Math.max(configuredMax, dailyLimit);
}

function buildPayoutMethod(raw, existing = null) {
  const merged = { ...(existing || {}), ...(raw || {}) };
  const type = String(merged.type || '').trim().toUpperCase();
  if (!['UPI', 'BANK'].includes(type)) return { error: 'Payout method type must be UPI or BANK' };
  const label = String(merged.label || '').trim();
  const holderName = String(merged.holderName || '').trim();
  const mobile = normalizeDigiMobile(merged.mobile);
  if (label.length < 1 || label.length > 40) return { error: 'Label must be 1 to 40 characters' };
  if (holderName.length < 2 || holderName.length > 100) return { error: 'Enter a valid holder name' };
  if (!mobile) return { error: 'Enter a valid mobile number' };

  const minInr = parseInrPaise(merged.minInr);
  const maxInr = parseInrPaise(merged.maxInr);
  const dailyLimitInr = parseInrPaise(merged.dailyLimitInr);
  if (!minInr || !maxInr || !dailyLimitInr || minInr <= 0 || maxInr < minInr || dailyLimitInr < maxInr) {
    return { error: 'Limits must be positive, max must be at least min, and daily limit must cover max' };
  }

  const method = {
    id: existing?.id || 'dpm_' + randomUUID().replace(/-/g, '').slice(0, 12),
    userId: existing?.userId || '',
    type,
    label,
    minInr: formatInrPaise(minInr),
    maxInr: formatInrPaise(type === 'UPI' ? dailyLimitInr : maxInr),
    dailyLimitInr: formatInrPaise(dailyLimitInr),
    enabled: merged.enabled === undefined ? true : merged.enabled === true,
    createdAt: existing?.createdAt || Date.now(),
    updatedAt: Date.now()
  };
  if (type === 'UPI') {
    const upiId = String(merged.upiId || '').trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{1,255}@[a-z0-9][a-z0-9.-]{1,63}$/i.test(upiId)) return { error: 'Enter a valid UPI ID' };
    method.upiId = upiId;
    method.holderName = holderName;
    method.mobile = mobile;
  } else {
    const accountNumber = String(merged.accountNumber || '').replace(/[\s-]/g, '');
    const ifsc = String(merged.ifsc || '').trim().toUpperCase();
    const bankName = String(merged.bankName || '').trim();
    if (!/^\d{6,24}$/.test(accountNumber)) return { error: 'Enter a valid bank account number' };
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) return { error: 'Enter a valid IFSC code' };
    if (bankName.length < 2 || bankName.length > 100) return { error: 'Enter a valid bank name' };
    method.bankName = bankName;
    method.accountNumber = accountNumber;
    method.ifsc = ifsc;
    method.holderName = holderName;
    method.mobile = mobile;
  }
  return { method };
}

function publicDigiPayoutMethod(method) {
  const result = { ...method };
  if (String(method?.type || '').toUpperCase() === 'UPI') {
    result.maxInr = formatInrPaise(payoutMethodPerTradeMaxPaise(method));
  }
  return result;
}

function decodeBase58(value) {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let number = 0n;
  for (const character of String(value || '')) {
    const index = alphabet.indexOf(character);
    if (index < 0) return null;
    number = number * 58n + BigInt(index);
  }
  const bytes = [];
  while (number > 0n) {
    bytes.unshift(Number(number & 255n));
    number >>= 8n;
  }
  for (const character of String(value || '')) {
    if (character !== '1') break;
    bytes.unshift(0);
  }
  return Buffer.from(bytes);
}

function isValidTronAddress(value) {
  const address = String(value || '').trim();
  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)) return false;
  const decoded = decodeBase58(address);
  if (!decoded || decoded.length !== 25 || decoded[0] !== 0x41) return false;
  const payload = decoded.subarray(0, 21);
  const checksum = decoded.subarray(21);
  const expected = createHash('sha256').update(createHash('sha256').update(payload).digest()).digest().subarray(0, 4);
  return safeEqualText(checksum.toString('hex'), expected.toString('hex'));
}

function publicDigiAddress(address) {
  return { ...address, safeReuseAt: address.reservedOrderId ? null : (address.reservedUntil || null) };
}

function releaseDigiAddress(order, timestamp = Date.now(), { confirmed = false } = {}) {
  const address = db.digirupee.tronAddresses.find(item => item.id === order.depositAddressId);
  if (!address || address.reservedOrderId !== order.id) return false;
  const exactConfirmed = confirmed || (
    !!order.txId &&
    order.chainStatus === 'valid_exact' &&
    Number(order.receivedUsdtMicros) === Number(order.usdtMicros) &&
    Number(order.confirmations || 0) >= tronRequiredConfirmations
  );
  const cleanExpired = order.status === 'Expired' && !order.txId &&
    (order.receivedUsdtMicros === null || order.receivedUsdtMicros === undefined);
  address.reservedOrderId = null;
  const safeReuseAt = exactConfirmed
    ? timestamp
    : cleanExpired
      ? timestamp + tronExpiredAddressReuseMs
      : timestamp + digiAddressCooldownMs;
  address.reservedUntil = safeReuseAt;
  address.updatedAt = timestamp;
  const assignment = db.digirupee.addressAssignments.find(item => item.orderId === order.id && item.addressId === address.id);
  if (assignment) {
    assignment.releasedAt = timestamp;
    assignment.safeReuseAt = safeReuseAt;
    assignment.status = order.status;
  }
  if (exactConfirmed) {
    appendDigiAudit({
      actorType: 'system',
      actorId: 'address-pool',
      action: 'tron-address.released_after_confirmation',
      entityType: 'sell-order',
      entityId: order.id,
      details: { addressId: address.id }
    });
  }
  return true;
}

function expireDigiOrders(timestamp = Date.now()) {
  let changed = false;
  for (const quote of db.digirupee.quotes) {
    if (quote.status === 'issued' && Number(quote.expiresAt) <= timestamp) {
      quote.status = 'expired';
      changed = true;
    }
  }
  for (const order of db.digirupee.orders) {
    if (digiFinalStatuses.has(order.status)) {
      if (releaseDigiAddress(order, timestamp)) changed = true;
      continue;
    }
    if (order.status !== 'Awaiting Deposit' || Number(order.quoteExpiresAt) > timestamp) continue;
    order.status = 'Expired';
    order.updatedAt = timestamp;
    order.timeline = Array.isArray(order.timeline) ? order.timeline : [];
    order.timeline.push({ status: 'Expired', at: timestamp });
    releaseDigiAddress(order, timestamp);
    changed = true;
  }
  return changed;
}

function activeDigiOrderForUser(userId, payoutType = null) {
  const normalizedType = payoutType ? String(payoutType).trim().toUpperCase() : null;
  return db.digirupee.orders
    .filter(order => order.userId === userId && digiOrderIsActive(order) && (!normalizedType || String(order.payoutType).toUpperCase() === normalizedType))
    .sort((a, b) => Number(b.createdAt) - Number(a.createdAt))[0] || null;
}

function findOwnedPayoutMethod(userId, id) {
  return db.digirupee.payoutMethods.find(method => method.id === id && method.userId === userId) || null;
}

function methodSummary(method) {
  if (!method) return null;
  return method.type === 'UPI'
    ? { id: method.id, type: method.type, label: method.label, upiId: method.upiId }
    : { id: method.id, type: method.type, label: method.label, bankName: method.bankName, accountNumber: maskDigiValue(method.accountNumber, 2, 4), ifsc: method.ifsc };
}

function allocationResponse(allocation) {
  return { payoutMethodId: allocation.payoutMethodId, inrAmount: formatInrPaise(allocation.inrPaise) };
}

function publicDigiPayout(payout, { admin = false } = {}) {
  if (!payout) return null;
  return {
    status: payout.status,
    totalInrPaise: Number(payout.totalInrPaise || 0),
    paidInrPaise: Number(payout.paidInrPaise || 0),
    references: (payout.allocations || []).map(item => ({
      payoutMethodId: item.payoutMethodId,
      inrAmount: formatInrPaise(item.inrPaise),
      mode: item.mode,
      reference: item.reference,
      completedAt: item.completedAt
    })),
    startedAt: payout.startedAt || null,
    completedAt: payout.completedAt || null,
    ...(admin ? { note: payout.note || '', adminId: payout.adminId || null } : {})
  };
}

function publicDigiReview(review, { admin = false } = {}) {
  if (!review) return null;
  return {
    reason: review.reason,
    detectedAt: review.detectedAt,
    adminDecision: review.adminDecision || null,
    ...(admin ? { adminNote: review.adminNote || '', txId: review.txId || null } : {})
  };
}

function publicDigiOrder(order, { admin = false } = {}) {
  const result = {
    id: order.id,
    ...(admin ? { userId: order.userId } : {}),
    quoteId: order.quoteId,
    payoutType: order.payoutType,
    payoutMethodId: order.payoutMethodId || null,
    allocations: (order.allocations || []).map(allocationResponse),
    flexibleBankAllocation: !!order.flexibleBankAllocation,
    allocatedInrAmount: formatInrPaise((order.allocations || []).reduce((sum, item) => sum + Number(item.inrPaise || 0), 0)),
    unallocatedInrAmount: formatInrPaise(Math.max(0, Number(order.inrPaise || 0) - (order.allocations || []).reduce((sum, item) => sum + Number(item.inrPaise || 0), 0))),
    unpaidInrAmount: formatInrPaise(Math.max(0, Number(order.inrPaise || 0) - Number(order.payout?.paidInrPaise || 0))),
    usdtAmount: formatUsdtMicros(order.usdtMicros),
    lockedRate: formatInrPaise(order.lockedRatePaise),
    inrAmount: formatInrPaise(order.inrPaise),
    depositAddressId: order.depositAddressId,
    depositAddress: order.depositAddress,
    status: order.status,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    quoteExpiresAt: order.quoteExpiresAt,
    timeline: Array.isArray(order.timeline) ? order.timeline : [],
    txId: order.txId || null,
    txDetectedAt: order.txDetectedAt || null,
    txBlockNumber: order.txBlockNumber || null,
    txTimestamp: order.txTimestamp || null,
    receivedUsdt: order.receivedUsdtMicros === null || order.receivedUsdtMicros === undefined ? null : formatUsdtMicros(order.receivedUsdtMicros),
    receivedUsdtDifference: order.receivedUsdtDifferenceMicros === null || order.receivedUsdtDifferenceMicros === undefined ? null : formatUsdtMicros(order.receivedUsdtDifferenceMicros),
    confirmations: Number(order.confirmations || 0),
    requiredConfirmations: tronRequiredConfirmations,
    lastChainCheckAt: order.lastChainCheckAt || null,
    chainStatus: order.chainStatus || 'unseen',
    verificationSource: order.verificationSource || null,
    payout: publicDigiPayout(order.payout, { admin }),
    review: publicDigiReview(order.review, { admin }),
    payoutMethods: ((order.payoutMethodIds || []).map(id => db.digirupee.payoutMethods.find(method => method.id === id)).filter(Boolean).length
      ? (order.payoutMethodIds || []).map(id => db.digirupee.payoutMethods.find(method => method.id === id)).filter(Boolean)
      : (order.payoutMethodSnapshots || [])).map(method => methodSummary(method))
  };
  if (admin) {
    result.payoutMethods = (order.payoutMethodIds || []).map(id => db.digirupee.payoutMethods.find(method => method.id === id)).filter(Boolean).map(adminDigiPayoutMethod);
    if (!result.payoutMethods.length && Array.isArray(order.payoutMethodSnapshots)) result.payoutMethods = order.payoutMethodSnapshots.map(adminDigiPayoutMethod);
    result.chainError = order.chainError || null;
    result.user = publicDigiUser(db.digirupee.users.find(user => user.id === order.userId) || { id: order.userId, profile: {}, email: '', mobile: '', createdAt: null, status: 'unknown' });
  }
  return result;
}

function publicDigiQuote(quote) {
  return {
    quoteId: quote.id,
    payoutType: quote.payoutType,
    usdtAmount: formatUsdtMicros(quote.usdtMicros),
    rate: formatInrPaise(quote.ratePaise),
    inrAmount: formatInrPaise(quote.inrPaise),
    expiresAt: quote.expiresAt,
    quoteValiditySeconds: Math.max(0, Math.ceil((quote.expiresAt - quote.createdAt) / 1000)),
    payoutSummary: quote.payoutSummary,
    allocations: (quote.allocations || []).map(allocationResponse)
  };
}

function normalizeDigiAllocations(raw) {
  if (!Array.isArray(raw) || !raw.length) return null;
  const seen = new Set();
  const allocations = [];
  for (const item of raw) {
    const payoutMethodId = String(item?.payoutMethodId || '').trim();
    const inrPaise = Number.isSafeInteger(Number(item?.inrPaise)) ? Number(item.inrPaise) : parseInrPaise(item?.inrAmount ?? item?.amount);
    if (!payoutMethodId || !inrPaise || seen.has(payoutMethodId)) return null;
    seen.add(payoutMethodId);
    allocations.push({ payoutMethodId, inrPaise });
  }
  return allocations;
}

function autoAllocateDigiBank(userId, totalPaise, candidateIds = []) {
  const requested = new Set(candidateIds.map(item => String(item).trim()).filter(Boolean));
  const methods = db.digirupee.payoutMethods
    .filter(method => method.userId === userId && method.type === 'BANK' && method.enabled && (!requested.size || requested.has(method.id)))
    .map(method => ({
      method,
      min: parseInrPaise(method.minInr) || 0,
      maxAvailable: Math.min(parseInrPaise(method.maxInr) || 0, payoutMethodRemainingPaise(method))
    }))
    .filter(item => item.maxAvailable >= item.min && item.maxAvailable > 0);

  if (!methods.length) return null;

  const single = methods
    .filter(item => totalPaise >= item.min && totalPaise <= item.maxAvailable)
    .sort((a, b) => a.maxAvailable - b.maxAvailable)[0];
  if (single) return [{ payoutMethodId: single.method.id, inrPaise: totalPaise }];

  const sorted = [...methods].sort((a, b) => b.maxAvailable - a.maxAvailable);
  let chosen = null;

  if (sorted.length <= 16) {
    const visit = (index, picked, minSum, maxSum) => {
      if (chosen || minSum > totalPaise) return;
      if (picked.length && minSum <= totalPaise && maxSum >= totalPaise) {
        chosen = [...picked];
        return;
      }
      if (index >= sorted.length) return;
      const remainingCapacity = sorted.slice(index).reduce((sum, item) => sum + item.maxAvailable, 0);
      if (maxSum + remainingCapacity < totalPaise) return;
      picked.push(sorted[index]);
      visit(index + 1, picked, minSum + sorted[index].min, maxSum + sorted[index].maxAvailable);
      picked.pop();
      visit(index + 1, picked, minSum, maxSum);
    };
    for (let targetCount = 2; targetCount <= sorted.length && !chosen; targetCount++) {
      const visitCount = (index, picked, minSum, maxSum) => {
        if (chosen || minSum > totalPaise || picked.length > targetCount) return;
        if (picked.length === targetCount) {
          if (minSum <= totalPaise && maxSum >= totalPaise) chosen = [...picked];
          return;
        }
        if (index >= sorted.length || picked.length + (sorted.length - index) < targetCount) return;
        picked.push(sorted[index]);
        visitCount(index + 1, picked, minSum + sorted[index].min, maxSum + sorted[index].maxAvailable);
        picked.pop();
        visitCount(index + 1, picked, minSum, maxSum);
      };
      visitCount(0, [], 0, 0);
    }
  } else {
    for (let count = 2; count <= sorted.length; count++) {
      const subset = sorted.slice(0, count);
      const minSum = subset.reduce((sum, item) => sum + item.min, 0);
      const maxSum = subset.reduce((sum, item) => sum + item.maxAvailable, 0);
      if (minSum <= totalPaise && maxSum >= totalPaise) { chosen = subset; break; }
    }
  }

  if (!chosen) return null;
  const allocations = chosen.map(item => ({
    payoutMethodId: item.method.id,
    inrPaise: item.min,
    maxAvailable: item.maxAvailable
  }));
  let remaining = totalPaise - allocations.reduce((sum, item) => sum + item.inrPaise, 0);
  for (const allocation of allocations) {
    const extra = Math.min(remaining, allocation.maxAvailable - allocation.inrPaise);
    allocation.inrPaise += extra;
    remaining -= extra;
    if (!remaining) break;
  }
  return remaining === 0
    ? allocations.map(({ payoutMethodId, inrPaise }) => ({ payoutMethodId, inrPaise }))
    : null;
}

function autoSelectDigiUpi(userId, totalPaise, candidateIds = []) {
  const requested = new Set(candidateIds.map(item => String(item).trim()).filter(Boolean));
  return db.digirupee.payoutMethods
    .filter(method => {
      if (method.userId !== userId || method.type !== 'UPI' || !method.enabled) return false;
      if (requested.size && !requested.has(method.id)) return false;
      const min = parseInrPaise(method.minInr) || 0;
      const max = payoutMethodPerTradeMaxPaise(method);
      return totalPaise >= min && totalPaise <= max && totalPaise <= payoutMethodRemainingPaise(method);
    })
    .sort((a, b) => {
      const remaining = payoutMethodRemainingPaise(b) - payoutMethodRemainingPaise(a);
      if (remaining) return remaining;
      return Number(a.lastUsedAt || a.updatedAt || 0) - Number(b.lastUsedAt || b.updatedAt || 0);
    })[0] || null;
}

function validateDigiPayoutSelection({ userId, payoutType, totalPaise, payoutMethodId, allocations, candidateIds = [], autoSplit = true }) {
  const normalizedType = String(payoutType || '').trim().toUpperCase();
  if (!['UPI', 'BANK'].includes(normalizedType)) return { error: 'Payout type must be UPI or BANK' };

  if (normalizedType === 'UPI') {
    const requestedId = String(payoutMethodId || '').trim();
    const requested = new Set((candidateIds || []).map(item => String(item).trim()).filter(Boolean));
    const candidates = db.digirupee.payoutMethods.filter(method =>
      method.userId === userId &&
      method.type === 'UPI' &&
      (!requested.size || requested.has(method.id))
    );
    const method = requestedId
      ? findOwnedPayoutMethod(userId, requestedId)
      : autoSelectDigiUpi(userId, totalPaise, candidateIds);

    if (requestedId && (!method || method.type !== 'UPI')) return { error: 'Selected UPI payout method was not found' };
    if (method && !method.enabled) return { error: 'Selected UPI method is disabled' };
    if (!method) {
      const enabled = candidates.filter(item => item.enabled);
      if (!enabled.length) return { error: 'Enable at least one UPI ID before creating a UPI deposit' };
      const usableMaximum = Math.max(...enabled.map(item =>
        Math.min(payoutMethodPerTradeMaxPaise(item), payoutMethodRemainingPaise(item))
      ));
      const configuredMinimum = Math.min(...enabled.map(item => parseInrPaise(item.minInr) || Number.MAX_SAFE_INTEGER));
      if (totalPaise < configuredMinimum) {
        return { error: `Order INR amount is below the enabled UPI minimum of ₹${formatInrPaise(configuredMinimum)}` };
      }
      if (totalPaise > usableMaximum) {
        return { error: `Order INR amount exceeds available UPI capacity of ₹${formatInrPaise(usableMaximum)}` };
      }
      return { error: 'UPI daily payout capacity is unavailable' };
    }

    const min = parseInrPaise(method.minInr) || 0;
    const max = payoutMethodPerTradeMaxPaise(method);
    if (totalPaise < min) return { error: `Order INR amount is below the UPI minimum of ₹${formatInrPaise(min)}` };
    if (totalPaise > max) return { error: `Order INR amount exceeds the UPI limit of ₹${formatInrPaise(max)}` };
    if (totalPaise > payoutMethodRemainingPaise(method)) return { error: 'UPI daily payout capacity is unavailable' };
    return {
      payoutType: normalizedType,
      payoutMethodId: method.id,
      payoutMethodIds: [method.id],
      allocations: [],
      payoutSummary: { method: methodSummary(method), inrAmount: formatInrPaise(totalPaise) },
      flexibleBankAllocation: false
    };
  }

  const hasSubmittedAllocations = Array.isArray(allocations) && allocations.length > 0;
  if (!hasSubmittedAllocations) {
    const requested = new Set((candidateIds || []).map(item => String(item).trim()).filter(Boolean));
    const methods = db.digirupee.payoutMethods.filter(method =>
      method.userId === userId &&
      method.type === 'BANK' &&
      method.enabled &&
      (!requested.size || requested.has(method.id))
    );
    if (!methods.length) return { error: 'Enable at least one bank account before creating a Bank deposit' };
    return {
      payoutType: normalizedType,
      payoutMethodId: null,
      payoutMethodIds: methods.map(method => method.id),
      allocations: [],
      payoutSummary: { methods: methods.map(methodSummary), allocations: [], inrAmount: formatInrPaise(totalPaise) },
      flexibleBankAllocation: true
    };
  }

  let normalizedAllocations = normalizeDigiAllocations(allocations);
  if (!normalizedAllocations && autoSplit) normalizedAllocations = autoAllocateDigiBank(userId, totalPaise, candidateIds);
  if (!normalizedAllocations) return { error: 'Provide valid bank allocations' };
  if (normalizedAllocations.reduce((sum, item) => sum + item.inrPaise, 0) !== totalPaise) return { error: 'Bank allocation total must equal the server-computed INR amount' };

  const methods = [];
  const methodIds = [];
  for (const allocation of normalizedAllocations) {
    const method = findOwnedPayoutMethod(userId, allocation.payoutMethodId);
    if (!method || method.type !== 'BANK') return { error: 'Every allocation must use your own bank account' };
    if (!method.enabled) return { error: 'Every allocated bank account must be enabled' };
    const min = parseInrPaise(method.minInr) || 0;
    const max = parseInrPaise(method.maxInr) || 0;
    if (allocation.inrPaise < min || allocation.inrPaise > max) return { error: `Allocation for ${method.label} is outside its limits` };
    if (allocation.inrPaise > payoutMethodRemainingPaise(method)) return { error: `Daily capacity for ${method.label} is unavailable` };
    methods.push(method);
    methodIds.push(method.id);
  }
  return {
    payoutType: normalizedType,
    payoutMethodId: null,
    payoutMethodIds: methodIds,
    allocations: normalizedAllocations,
    payoutSummary: { methods: methods.map(methodSummary), allocations: normalizedAllocations.map(allocationResponse), inrAmount: formatInrPaise(totalPaise) },
    flexibleBankAllocation: false
  };
}

function digiRequestFingerprint(quoteId, allocations) {
  return createHash('sha256').update(JSON.stringify(canonical({ quoteId, allocations: allocations || [] }))).digest('hex');
}

function availableDigiAddress(timestamp = Date.now()) {
  return db.digirupee.tronAddresses
    .filter(address => address.enabled && !address.reservedOrderId && Number(address.reservedUntil || 0) <= timestamp && !db.digirupee.addressAssignments.some(assignment => assignment.addressId === address.id && (() => {
      const assignedOrder = db.digirupee.orders.find(order => order.id === assignment.orderId);
      return assignedOrder && digiOrderNeedsExclusiveAddress(assignedOrder);
    })()))
    .sort((a, b) => Number(a.lastUsedAt || 0) - Number(b.lastUsedAt || 0))[0] || null;
}

function sameDigiAllocations(left = [], right = []) {
  if (left.length !== right.length) return false;
  return left.every((item, index) => item.payoutMethodId === right[index].payoutMethodId && Number(item.inrPaise) === Number(right[index].inrPaise));
}

function assignAvailableDigiAddress(order, timestamp = Date.now()) {
  if (!order || order.depositAddressId || order.depositAddress) return false;
  if (order.status !== 'Awaiting Deposit' || !digiOrderIsActive(order)) return false;
  const address = availableDigiAddress(timestamp);
  if (!address) return false;
  order.depositAddressId = address.id;
  order.depositAddress = address.address;
  order.updatedAt = timestamp;
  address.reservedOrderId = order.id;
  address.reservedUntil = Number(order.quoteExpiresAt || timestamp);
  address.lastUsedAt = timestamp;
  address.totalOrders = Number(address.totalOrders || 0) + 1;
  address.totalUsdtAssigned = Number((Number(address.totalUsdtAssigned || 0) + Number(formatUsdtMicros(order.usdtMicros) || 0)).toFixed(6));
  if (!db.digirupee.addressAssignments.some(item => item.orderId === order.id)) {
    db.digirupee.addressAssignments.push({
      addressId: address.id,
      address: address.address,
      orderId: order.id,
      userId: order.userId,
      assignedAt: timestamp,
      quoteExpiresAt: order.quoteExpiresAt,
      releasedAt: null,
      safeReuseAt: null,
      txId: null,
      status: order.status
    });
  }
  appendDigiAudit({ actorType: 'system', actorId: 'address-pool', action: 'tron-address.repaired', entityType: 'sell-order', entityId: order.id, details: { addressId: address.id } });
  createDigiNotification({ userId: order.userId, type: 'order', title: 'TRON deposit address assigned', message: `A receiving address is now available for ${order.id}.`, entityType: 'sell-order', entityId: order.id, sourceKey: `order:${order.id}:address-repaired` });
  return true;
}

function backfillDigiMissingAddresses(userId = null) {
  let changed = false;
  const orders = db.digirupee.orders
    .filter(order => (!userId || order.userId === userId) && order.status === 'Awaiting Deposit' && !order.depositAddress)
    .sort((a,b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
  for (const order of orders) {
    if (assignAvailableDigiAddress(order)) changed = true;
  }
  return changed;
}

function ensureDigiAddressAssignments() {
  let changed = false;
  for (const order of db.digirupee.orders) {
    if (!order.depositAddressId || !order.depositAddress) continue;
    const final = digiFinalStatuses.has(order.status);
    const cleanExpired = order.status === 'Expired' && !order.txId &&
      (order.receivedUsdtMicros === null || order.receivedUsdtMicros === undefined);
    const finalAt = Number(order.updatedAt || order.quoteExpiresAt || Date.now());
    const safeReuseAt = final
      ? finalAt + (cleanExpired ? tronExpiredAddressReuseMs : digiAddressCooldownMs)
      : null;
    const existing = db.digirupee.addressAssignments.find(item => item.orderId === order.id);
    const address = db.digirupee.tronAddresses.find(item => item.id === order.depositAddressId);

    // Boot-time migration: old clean test/expired orders may still carry the former
    // 48-hour reuse window. Shorten only no-tx/no-receipt expiries; never shorten
    // a deposit that has chain evidence or is under review.
    if (existing) {
      if (cleanExpired) {
        if (!existing.releasedAt) { existing.releasedAt = finalAt; changed = true; }
        if (!existing.safeReuseAt || Number(existing.safeReuseAt) > safeReuseAt) {
          existing.safeReuseAt = safeReuseAt;
          changed = true;
        }
        if (address?.reservedOrderId === order.id) {
          address.reservedOrderId = null;
          changed = true;
        }
        if (address && !address.reservedOrderId && (!address.reservedUntil || Number(address.reservedUntil) > safeReuseAt)) {
          address.reservedUntil = safeReuseAt;
          address.updatedAt = Date.now();
          changed = true;
        }
      }
      continue;
    }

    db.digirupee.addressAssignments.push({
      addressId: order.depositAddressId,
      address: order.depositAddress,
      orderId: order.id,
      userId: order.userId,
      assignedAt: order.createdAt,
      quoteExpiresAt: order.quoteExpiresAt,
      releasedAt: final ? finalAt : null,
      safeReuseAt,
      txId: order.txId || null,
      status: order.status
    });
    if (cleanExpired && address && !address.reservedOrderId && (!address.reservedUntil || Number(address.reservedUntil) > safeReuseAt)) {
      address.reservedUntil = safeReuseAt;
      address.updatedAt = Date.now();
    }
    changed = true;
  }
  return changed;
}

function assignmentForTransfer(addressId, timestamp, receivedUsdtMicros = null, candidateTxId = '') {
  const at = Number(timestamp);
  if (!Number.isFinite(at) || at <= 0) return null;
  const txId = normalizeDigiTxId(candidateTxId);
  const matches = db.digirupee.addressAssignments
    .filter(item => item.addressId === addressId && Number(item.assignedAt) <= at && at <= Number(item.quoteExpiresAt) + tronLateDepositGraceMs)
    .map(assignment => ({ assignment, order: db.digirupee.orders.find(order => order.id === assignment.orderId) }))
    .filter(item => item.order && (!item.order.txId || normalizeDigiTxId(item.order.txId) === txId))
    .sort((a, b) => Number(b.assignment.assignedAt) - Number(a.assignment.assignedAt));
  if (!matches.length) return null;

  // Reused addresses can have overlapping late-deposit windows. Completed tx-bound
  // assignments are excluded above. Prefer a unique exact-amount assignment; if
  // two unclaimed historical orders are indistinguishable, do not auto-credit either.
  const received = Number(receivedUsdtMicros);
  if (Number.isSafeInteger(received) && received >= 0) {
    const exact = matches.filter(item => Number(item.order.usdtMicros) === received);
    if (exact.length === 1) return exact[0].assignment;
    if (exact.length > 1) {
      const onTimeExact = exact.filter(item => at <= Number(item.assignment.quoteExpiresAt));
      return onTimeExact.length === 1 ? onTimeExact[0].assignment : null;
    }
  }

  const onTime = matches.filter(item => at <= Number(item.assignment.quoteExpiresAt));
  if (onTime.length === 1) return onTime[0].assignment;
  return matches.length === 1 ? matches[0].assignment : null;
}

function normalizeDigiTxId(value) {
  const txId = String(value || '').trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(txId) ? txId : '';
}

function tokenUnitsToMicros(value, decimals = 6) {
  try {
    const units = BigInt(String(value));
    const scale = Number(decimals);
    if (!Number.isInteger(scale) || scale < 0 || scale > 18 || units < 0n) return null;
    if (scale === 6) return units <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(units) : null;
    if (scale > 6) {
      const divisor = 10n ** BigInt(scale - 6);
      if (units % divisor !== 0n) return null;
      const micros = units / divisor;
      return micros <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(micros) : null;
    }
    const micros = units * (10n ** BigInt(6 - scale));
    return micros <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(micros) : null;
  } catch {
    return null;
  }
}

function mockDigiTransfer(order, requestedTxId = '') {
  const scenario = tronMockScenario.replace(/_/g, '-');
  if (['no-transaction', 'none', 'empty'].includes(scenario)) return null;
  if (['provider-error', 'error', 'outage'].includes(scenario)) throw Object.assign(new Error('Configured mock provider failure'), { status: 503, provider: true });
  const txId = normalizeDigiTxId(requestedTxId) || normalizeDigiTxId(process.env.TRON_MOCK_TX_ID) || createHash('sha256').update(`digirupee:${order.id}`).digest('hex');
  const sequenceValue = tronMockConfirmationSequence.length
    ? (order.txId ? (tronMockConfirmationSequence.find(value => value > Number(order.confirmations || 0)) ?? tronMockConfirmationSequence.at(-1)) : tronMockConfirmationSequence[0])
    : tronMockConfirmations;
  const expected = Number(order.usdtMicros || 0);
  const configuredDelta = Number(process.env.TRON_MOCK_DELTA_USDT_MICROS || 0);
  const receivedUsdtMicros = scenario === 'underpayment' || scenario === 'under-paid'
    ? Math.max(1, expected - (configuredDelta || Math.max(1, Math.floor(expected / 10))))
    : scenario === 'overpayment' || scenario === 'over-paid'
      ? expected + (configuredDelta || Math.max(1, Math.floor(expected / 10)))
      : expected;
  const timestamp = scenario === 'late' || scenario === 'late-deposit'
    ? Math.max(Date.now(), Number(order.quoteExpiresAt || Date.now()) + 1)
    : Date.now() - 1_000;
  return {
    txId,
    contract: ['wrong-token', 'wrong-contract'].includes(scenario) ? 'TMockWrongToken111111111111111111111' : tronUsdtContract,
    to: ['wrong-address', 'wrong-destination'].includes(scenario) ? 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb' : order.depositAddress,
    receivedUsdtMicros,
    timestamp,
    blockNumber: 10_000 + Number(sequenceValue),
    confirmations: Math.max(0, Number(sequenceValue) || 0),
    succeeded: !['failed-transaction', 'failed'].includes(scenario),
    network: tronNetwork,
    source: 'mock'
  };
}

async function fetchTronJson(path, query = {}) {
  const url = new URL(path.replace(/^\//, ''), `${tronApiUrl}/`);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), tronProviderTimeoutMs);
  try {
    const response = await fetch(url, { headers: tronApiKey ? { 'TRON-PRO-API-KEY': tronApiKey } : {}, signal: controller.signal });
    if (!response.ok) throw Object.assign(new Error(`TRON provider returned HTTP ${response.status}`), { status: response.status, provider: true });
    const payload = await response.json().catch(() => null);
    if (!payload || typeof payload !== 'object') throw Object.assign(new Error('TRON provider returned malformed data'), { status: 502, provider: true });
    return payload;
  } catch (error) {
    if (error.name === 'AbortError') throw Object.assign(new Error('TRON provider request timed out'), { status: 504, provider: true });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function providerTransfer(raw, fallbackTxId = '') {
  const result = raw?.result || {};
  const tokenInfo = raw?.token_info || raw?.tokenInfo || {};
  const eventResult = raw?.result && typeof raw.result === 'object' ? raw.result : {};
  const txId = normalizeDigiTxId(raw?.transaction_id || raw?.transactionId || raw?.txID || raw?.txid || fallbackTxId);
  const contract = raw?.contract_address || raw?.contractAddress || tokenInfo.address || raw?.address || '';
  const to = raw?.to || eventResult.to || eventResult['1'] || '';
  const rawValue = raw?.value ?? eventResult.value ?? eventResult['2'];
  const decimals = Number(tokenInfo.decimals ?? raw?.decimals ?? 6);
  const timestamp = Number(raw?.block_timestamp || raw?.blockTimestamp || raw?.timestamp || 0);
  return {
    txId,
    contract,
    to,
    receivedUsdtMicros: tokenUnitsToMicros(rawValue, decimals),
    timestamp: timestamp > 0 && timestamp < 1_000_000_000_000 ? timestamp * 1_000 : timestamp,
    blockNumber: Number(raw?.block_number || raw?.blockNumber || raw?.block || 0),
    decimals,
    succeeded: true,
    network: tronNetwork,
    source: 'trongrid'
  };
}

async function loadDigiTransfers(order, requestedTxId = '') {
  if (tronVerifyMode === 'mock') {
    const candidate = mockDigiTransfer(order, requestedTxId);
    return candidate ? [candidate] : [];
  }
  if (requestedTxId) {
    const payload = await fetchTronJson(`/v1/transactions/${encodeURIComponent(requestedTxId)}/events`, { only_confirmed: 'false', limit: 200 });
    const events = Array.isArray(payload.data) ? payload.data : [];
    return events.filter(event => String(event.event_name || '').toLowerCase() === 'transfer').map(event => providerTransfer(event, requestedTxId)).filter(item => item.txId);
  }
  const payload = await fetchTronJson(`/v1/accounts/${encodeURIComponent(order.depositAddress)}/transactions/trc20`, { only_confirmed: 'false', limit: 200, order_by: 'block_timestamp,desc' });
  return (Array.isArray(payload.data) ? payload.data : []).map(item => providerTransfer(item)).filter(item => item.txId);
}

async function hydrateDigiTransfer(candidate) {
  if (candidate.source === 'mock') return candidate;
  const payload = await fetchTronJson(`/v1/transactions/${encodeURIComponent(candidate.txId)}`);
  const tx = Array.isArray(payload.data) ? payload.data[0] : (payload.data || payload);
  if (!tx || typeof tx !== 'object') throw Object.assign(new Error('TRON transaction was not found'), { status: 404, provider: true });
  const ret = tx.ret?.[0]?.contractRet || tx.receipt?.result || tx.result?.result;
  candidate.succeeded = String(ret || '').toUpperCase() === 'SUCCESS';
  candidate.blockNumber = Number(candidate.blockNumber || tx.blockNumber || tx.block_number || 0);
  candidate.timestamp = Number(candidate.timestamp || tx.block_timestamp || tx.blockTimestamp || tx.raw_data?.timestamp || 0);
  if (typeof tx.confirmations === 'number') candidate.confirmations = tx.confirmations;
  if (tx.confirmed === true) candidate.confirmations = tronRequiredConfirmations;
  if (!Number.isInteger(candidate.confirmations)) {
    if (!candidate.blockNumber) return candidate;
    const head = await fetchTronJson('/wallet/getnowblock');
    const headNumber = Number(head.block_header?.raw_data?.number || head.blockNumber || 0);
    if (headNumber) candidate.confirmations = Math.max(0, headNumber - candidate.blockNumber + 1);
  }
  return candidate;
}

function addDigiTimeline(order, label, timestamp = Date.now()) {
  order.timeline = Array.isArray(order.timeline) ? order.timeline : [];
  if (order.timeline.some(item => item.status === label)) return false;
  order.timeline.push({ status: label, at: timestamp });
  return true;
}

function setDigiOrderStatus(order, status, timelineLabel = status, timestamp = Date.now()) {
  let changed = false;
  if (order.status !== status) {
    order.status = status;
    changed = true;
  }
  if (addDigiTimeline(order, timelineLabel, timestamp)) changed = true;
  if (changed) order.updatedAt = timestamp;
  if (changed && order.userId && status !== 'Awaiting Deposit') {
    const notificationType = ['Detected', 'Confirming', 'USDT Confirmed', 'Late Review'].includes(status) ? 'deposit' : status === 'INR Processing' || status === 'Completed' ? 'payout' : 'order';
    const titles = { Detected: 'USDT deposit detected', Confirming: 'USDT deposit confirming', 'USDT Confirmed': 'USDT deposit confirmed', 'INR Processing': 'INR payout processing', Completed: 'Order completed', 'Late Review': 'Deposit requires review', Expired: 'Sell order expired', Rejected: 'Sell order rejected', Failed: 'Sell order failed' };
    createDigiNotification({ userId: order.userId, type: notificationType, title: titles[status] || `Order ${status}`, message: `${order.id} is now ${status}.`, entityType: 'sell-order', entityId: order.id, sourceKey: `order:${order.id}:status:${status}` });
  }
  return changed;
}

function digiTransactionUsedByAnotherOrder(txId, orderId) {
  return db.digirupee.orders.find(order => order.id !== orderId && (
    order.txId === txId || order.review?.txId === txId
  )) || null;
}

function syncDigiAssignmentTransaction(order, txId) {
  const assignment = db.digirupee.addressAssignments.find(item => item.orderId === order.id && item.addressId === order.depositAddressId);
  if (assignment) {
    if (!assignment.txId) assignment.txId = txId;
    assignment.status = order.status;
  }
}

function ensureDigiPayoutRecord(order) {
  if (order.payout) return false;
  order.payout = {
    status: 'processing',
    totalInrPaise: Number(order.inrPaise),
    paidInrPaise: 0,
    allocations: [],
    startedAt: null,
    completedAt: null,
    note: '',
    adminId: null
  };
  return true;
}

function setDigiChainReview(order, candidate, reason, chainStatus, { attachTx = false, auditAction = 'tx.review_required' } = {}) {
  const now = Date.now();
  let changed = false;
  if (attachTx && !order.txId) {
    order.txId = candidate.txId;
    syncDigiAssignmentTransaction(order, candidate.txId);
    changed = true;
  }
  if (order.txDetectedAt === null || order.txDetectedAt === undefined) { order.txDetectedAt = now; changed = true; }
  if (candidate.blockNumber && order.txBlockNumber !== candidate.blockNumber) { order.txBlockNumber = candidate.blockNumber; changed = true; }
  if (candidate.timestamp && order.txTimestamp !== candidate.timestamp) { order.txTimestamp = candidate.timestamp; changed = true; }
  if (candidate.receivedUsdtMicros !== null && candidate.receivedUsdtMicros !== undefined && order.receivedUsdtMicros !== candidate.receivedUsdtMicros) { order.receivedUsdtMicros = candidate.receivedUsdtMicros; changed = true; }
  if (candidate.receivedUsdtMicros !== null && candidate.receivedUsdtMicros !== undefined && order.receivedUsdtDifferenceMicros !== candidate.receivedUsdtMicros - Number(order.usdtMicros)) { order.receivedUsdtDifferenceMicros = candidate.receivedUsdtMicros - Number(order.usdtMicros); changed = true; }
  if (order.confirmations !== Math.max(0, Number(candidate.confirmations || 0))) { order.confirmations = Math.max(0, Number(candidate.confirmations || 0)); changed = true; }
  if (order.chainStatus !== chainStatus) { order.chainStatus = chainStatus; changed = true; }
  if (order.verificationSource !== candidate.source) { order.verificationSource = candidate.source; changed = true; }
  if (order.lastChainCheckAt !== now) { order.lastChainCheckAt = now; changed = true; }
  if (order.chainError !== null) { order.chainError = null; changed = true; }
  const reviewTxId = attachTx ? (order.txId || candidate.txId) : candidate.txId;
  if (!order.review || order.review.reason !== reason || order.review.txId !== reviewTxId) {
    order.review = { reason, detectedAt: now, adminDecision: null, adminNote: '', txId: reviewTxId || null };
    changed = true;
    appendDigiAudit({ actorType: 'system', actorId: 'tron-monitor', action: auditAction, entityType: 'sell-order', entityId: order.id, details: { reason, txId: reviewTxId || null, expectedUsdt: formatUsdtMicros(order.usdtMicros), receivedUsdt: candidate.receivedUsdtMicros === null || candidate.receivedUsdtMicros === undefined ? null : formatUsdtMicros(candidate.receivedUsdtMicros) } });
  }
  if (setDigiOrderStatus(order, 'Late Review', 'Late Review', now)) changed = true;
  const assignment = db.digirupee.addressAssignments.find(item => item.orderId === order.id);
  if (assignment) assignment.status = order.status;
  return changed;
}

function applyDigiTransfer(order, candidate) {
  const expectedContract = normalizeTronAddress(tronUsdtContract);
  const expectedAddress = normalizeTronAddress(order.depositAddress);
  const candidateContract = normalizeTronAddress(candidate.contract);
  const candidateAddress = normalizeTronAddress(candidate.to);
  const destinationMatches = !!candidateAddress && candidateAddress === expectedAddress;
  const contractMatches = !!candidateContract && candidateContract === expectedContract && Number(candidate.decimals === undefined ? 6 : candidate.decimals) === 6;
  if (!candidate.txId) return false;
  const duplicate = digiTransactionUsedByAnotherOrder(candidate.txId, order.id);
  if (duplicate) return setDigiChainReview(order, candidate, `Transaction is already assigned to order ${duplicate.id}`, 'duplicate_transaction', { attachTx: false, auditAction: 'tx.review_required' });
  if (candidate.network !== tronNetwork) return setDigiChainReview(order, candidate, 'Transaction network does not match the configured TRON network', 'invalid_network', { attachTx: false });
  if (!candidate.timestamp || candidate.timestamp > Date.now() + 5 * 60 * 1000 || !candidate.blockNumber || candidate.blockNumber <= 0) return setDigiChainReview(order, candidate, 'Transaction block or timestamp is invalid', 'invalid_chain_data', { attachTx: false });
  if (!candidate.succeeded) return setDigiChainReview(order, candidate, 'Transaction did not succeed on chain', 'failed_transaction', { attachTx: destinationMatches });
  if (!destinationMatches) return setDigiChainReview(order, candidate, 'Transaction destination does not match the assigned deposit address', 'wrong_destination', { attachTx: false });
  if (!contractMatches) return setDigiChainReview(order, candidate, 'Transaction is not an official USDT TRC20 transfer', 'wrong_token', { attachTx: true });
  if (candidate.receivedUsdtMicros === null || candidate.receivedUsdtMicros === undefined) return setDigiChainReview(order, candidate, 'Transaction token amount is invalid', 'invalid_amount', { attachTx: true });
  const expected = Number(order.usdtMicros);
  if (candidate.receivedUsdtMicros !== expected) {
    const kind = candidate.receivedUsdtMicros < expected ? 'Underpayment' : 'Overpayment';
    return setDigiChainReview(order, candidate, `${kind}: expected ${formatUsdtMicros(expected)} USDT, received ${formatUsdtMicros(candidate.receivedUsdtMicros)} USDT`, kind === 'Underpayment' ? 'underpayment' : 'overpayment', { attachTx: true });
  }

  const now = Date.now();
  let changed = false;
  const newTransaction = order.txId !== candidate.txId;
  if (newTransaction) { order.txId = candidate.txId; changed = true; }
  syncDigiAssignmentTransaction(order, candidate.txId);
  if (order.txDetectedAt === null || order.txDetectedAt === undefined) { order.txDetectedAt = now; changed = true; }
  if (order.txBlockNumber !== candidate.blockNumber) { order.txBlockNumber = candidate.blockNumber; changed = true; }
  if (order.txTimestamp !== candidate.timestamp) { order.txTimestamp = candidate.timestamp; changed = true; }
  if (order.receivedUsdtMicros !== candidate.receivedUsdtMicros) { order.receivedUsdtMicros = candidate.receivedUsdtMicros; changed = true; }
  if (order.receivedUsdtDifferenceMicros !== candidate.receivedUsdtMicros - expected) { order.receivedUsdtDifferenceMicros = candidate.receivedUsdtMicros - expected; changed = true; }
  if (order.confirmations !== Math.max(0, Number(candidate.confirmations || 0))) { order.confirmations = Math.max(0, Number(candidate.confirmations || 0)); changed = true; }
  if (order.lastChainCheckAt !== now) { order.lastChainCheckAt = now; changed = true; }
  if (order.chainStatus !== 'valid_exact') { order.chainStatus = 'valid_exact'; changed = true; }
  if (order.verificationSource !== candidate.source) { order.verificationSource = candidate.source; changed = true; }
  if (order.chainError !== null) { order.chainError = null; changed = true; }
  const late = order.status === 'Expired' || candidate.timestamp > Number(order.quoteExpiresAt);
  if (late) {
    if (!order.review || order.review.reason !== 'Late deposit received after quote expiry' || order.review.txId !== candidate.txId) {
      order.review = { reason: 'Late deposit received after quote expiry', detectedAt: now, adminDecision: null, adminNote: '', txId: candidate.txId };
      appendDigiAudit({ actorType: 'system', actorId: 'tron-monitor', action: 'tx.late_detected', entityType: 'sell-order', entityId: order.id, details: { txId: candidate.txId, expectedUsdt: formatUsdtMicros(expected), receivedUsdt: formatUsdtMicros(candidate.receivedUsdtMicros) } });
      changed = true;
    }
    if (setDigiOrderStatus(order, 'Late Review', 'Late Review', now)) changed = true;
    const assignment = db.digirupee.addressAssignments.find(item => item.orderId === order.id);
    if (assignment) assignment.status = order.status;
    return changed;
  }
  if (newTransaction) appendDigiAudit({ actorType: 'system', actorId: 'tron-monitor', action: 'tx.detected', entityType: 'sell-order', entityId: order.id, details: { txId: candidate.txId, expectedUsdt: formatUsdtMicros(expected), receivedUsdt: formatUsdtMicros(candidate.receivedUsdtMicros) } });
  if (addDigiTimeline(order, 'USDT Detected', now)) changed = true;
  if (order.status === 'Awaiting Deposit' && setDigiOrderStatus(order, 'Detected', 'USDT Detected', now)) changed = true;
  if (order.status !== 'USDT Confirmed' && order.status !== 'INR Processing' && addDigiTimeline(order, 'Confirming', now)) changed = true;
  if (order.confirmations >= tronRequiredConfirmations) {
    if (order.status !== 'USDT Confirmed' && setDigiOrderStatus(order, 'USDT Confirmed', 'USDT Confirmed', now)) {
      appendDigiAudit({ actorType: 'system', actorId: 'tron-monitor', action: 'tx.confirmed', entityType: 'sell-order', entityId: order.id, details: { txId: order.txId, confirmations: order.confirmations, requiredConfirmations: tronRequiredConfirmations } });
      changed = true;
    }
    if (setDigiOrderStatus(order, 'INR Processing', 'INR Processing', now)) changed = true;
    if (ensureDigiPayoutRecord(order)) changed = true;
    if (releaseDigiAddress(order, now, { confirmed: true })) changed = true;
  } else if (order.status !== 'INR Processing' && setDigiOrderStatus(order, 'Confirming', 'Confirming', now)) {
    if (!order.review) appendDigiAudit({ actorType: 'system', actorId: 'tron-monitor', action: 'tx.confirming', entityType: 'sell-order', entityId: order.id, details: { txId: order.txId, confirmations: order.confirmations, requiredConfirmations: tronRequiredConfirmations } });
    changed = true;
  }
  const assignment = db.digirupee.addressAssignments.find(item => item.orderId === order.id);
  if (assignment) assignment.status = order.status;
  return changed;
}

function monitorableDigiOrders(timestamp = Date.now()) {
  const result = db.digirupee.orders.filter(order => digiOrderNeedsExclusiveAddress(order));
  for (const order of db.digirupee.orders) {
    if (order.status !== 'Expired') continue;
    const assignment = db.digirupee.addressAssignments.find(item => item.orderId === order.id);
    if (assignment && Number(assignment.safeReuseAt || 0) > timestamp) result.push(order);
  }
  return [...new Map(result.map(order => [order.id, order])).values()];
}

function markDigiProviderResult(order, chainStatus, chainError = null) {
  const now = Date.now();
  let changed = false;
  if (order.lastChainCheckAt !== now) { order.lastChainCheckAt = now; changed = true; }
  if (order.chainStatus !== chainStatus) { order.chainStatus = chainStatus; changed = true; }
  const safeError = chainError ? String(chainError).slice(0, 220) : null;
  if (order.chainError !== safeError) { order.chainError = safeError; changed = true; }
  if (chainStatus === 'provider_error') digiMonitorState.lastProviderErrorAt = now;
  return changed;
}

async function pollDigiOrder(order) {
  try {
    const candidates = await loadDigiTransfers(order, order.txId || '');
    digiMonitorState.lastSuccessfulProviderCheckAt = Date.now();
    let changed = false;
    let matched = false;
    for (const rawCandidate of candidates) {
      const candidate = await hydrateDigiTransfer(rawCandidate);
      const assignment = assignmentForTransfer(order.depositAddressId, candidate.timestamp, candidate.receivedUsdtMicros, candidate.txId);
      if (!assignment) continue;
      matched = true;
      const historicalOrder = db.digirupee.orders.find(item => item.id === assignment.orderId);
      if (historicalOrder && historicalOrder.id !== order.id) {
        if (digiOrderIsActive(historicalOrder) || historicalOrder.status === 'Expired') changed = applyDigiTransfer(historicalOrder, candidate) || changed;
        continue;
      }
      changed = applyDigiTransfer(order, candidate) || changed;
    }
    if (!matched && !order.txId) changed = markDigiProviderResult(order, 'not_found', null) || changed;
    else if (!matched) changed = markDigiProviderResult(order, order.chainStatus || 'unattributed', null) || changed;
    return changed;
  } catch (error) {
    return markDigiProviderResult(order, 'provider_error', error.message || 'TRON provider unavailable');
  }
}

function expectedDigiPayoutAllocations(order) {
  if (order.payoutType === 'UPI') {
    return [{ payoutMethodId: order.payoutMethodId, inrPaise: Number(order.inrPaise) }];
  }
  return (order.allocations || []).map(item => ({ payoutMethodId: item.payoutMethodId, inrPaise: Number(item.inrPaise) }));
}

function normalizeDigiPayoutEntries(raw) {
  const source = Array.isArray(raw?.allocations) && raw.allocations.length
    ? raw.allocations
    : [{
      payoutMethodId: raw?.payoutMethodId,
      inrAmount: raw?.inrAmount ?? raw?.amount,
      mode: raw?.mode,
      reference: raw?.reference ?? raw?.utr
    }];
  if (!source.length) return { error: 'At least one payout allocation is required' };
  const seen = new Set();
  const entries = [];
  for (const item of source) {
    const payoutMethodId = String(item?.payoutMethodId || '').trim();
    const inrPaise = parseInrPaise(item?.inrPaise ?? item?.inrAmount ?? item?.amount);
    const mode = String(item?.mode || '').trim().toUpperCase();
    const reference = String(item?.reference ?? item?.utr ?? '').trim();
    if (!payoutMethodId || seen.has(payoutMethodId)) return { error: 'Each payout method may appear only once' };
    if (!Number.isSafeInteger(inrPaise) || inrPaise <= 0) return { error: 'Payout amount must be a positive INR amount' };
    if (!['UPI', 'IMPS', 'NEFT', 'RTGS', 'BANK'].includes(mode)) return { error: 'Unsupported payout mode' };
    if (!/^[A-Za-z0-9][A-Za-z0-9/_-]{5,79}$/.test(reference)) return { error: 'Enter a valid payout reference or UTR' };
    seen.add(payoutMethodId);
    entries.push({ payoutMethodId, inrPaise, mode, reference });
  }
  return { entries };
}

function payoutReferenceUsedByAnotherOrder(reference, orderId) {
  const needle = String(reference || '').trim().toLowerCase();
  return db.digirupee.orders.find(order => order.id !== orderId && (order.payout?.allocations || []).some(item => String(item.reference || '').trim().toLowerCase() === needle)) || null;
}

function recordFlexibleDigiBankPayout(order, admin, raw) {
  const parsed = normalizeDigiPayoutEntries(raw);
  if (parsed.error) return { status: 400, error: parsed.error };

  if (order.status === 'Completed' && order.payout) {
    const existing = order.payout.allocations || [];
    const replay = parsed.entries.every(entry => existing.some(item =>
      item.payoutMethodId === entry.payoutMethodId &&
      Number(item.inrPaise) === Number(entry.inrPaise) &&
      String(item.mode) === String(entry.mode) &&
      String(item.reference).toLowerCase() === String(entry.reference).toLowerCase()
    ));
    return replay ? { ok: true, idempotent: true } : { status: 409, error: 'This order payout is already completed' };
  }

  if (!['USDT Confirmed', 'INR Processing'].includes(order.status)) return { status: 409, error: 'This order is not ready for INR payout' };
  if (!order.txId || order.chainStatus !== 'valid_exact' || Number(order.receivedUsdtMicros) !== Number(order.usdtMicros) || Number(order.confirmations || 0) < tronRequiredConfirmations) {
    return { status: 409, error: 'A server-verified exact USDT deposit with required confirmations is required' };
  }

  const plannedByMethod = new Map((order.allocations || []).map(item => [item.payoutMethodId, Number(item.inrPaise || 0)]));
  if (!plannedByMethod.size) return { status: 409, error: 'The user has not allocated any Bank payout amount yet' };

  const payout = order.payout || (order.payout = {
    status: 'processing', totalInrPaise: Number(order.inrPaise), paidInrPaise: 0, allocations: [], startedAt: null, completedAt: null, note: '', adminId: null
  });
  const paidByMethod = new Map();
  for (const item of payout.allocations || []) {
    paidByMethod.set(item.payoutMethodId, (paidByMethod.get(item.payoutMethodId) || 0) + Number(item.inrPaise || 0));
  }

  const additions = [];
  const requestReferences = new Set();
  for (const entry of parsed.entries) {
    const refKey = String(entry.reference).toLowerCase();
    if (requestReferences.has(refKey)) return { status: 400, error: 'Each payout entry must use a unique reference' };
    requestReferences.add(refKey);

    const planned = Number(plannedByMethod.get(entry.payoutMethodId) || 0);
    if (!planned) return { status: 400, error: 'Payout destination is not in the user bank distribution plan' };
    const alreadyPaid = Number(paidByMethod.get(entry.payoutMethodId) || 0);
    const outstandingForMethod = Math.max(0, planned - alreadyPaid);
    if (Number(entry.inrPaise) > outstandingForMethod) return { status: 400, error: 'Payout amount exceeds the outstanding amount allocated to this bank' };

    const sameReference = (payout.allocations || []).find(item => String(item.reference || '').toLowerCase() === refKey);
    if (sameReference) {
      if (sameReference.payoutMethodId === entry.payoutMethodId && Number(sameReference.inrPaise) === Number(entry.inrPaise) && String(sameReference.mode) === String(entry.mode)) continue;
      return { status: 409, error: 'Payout reference is already used on this order' };
    }
    const duplicateReference = payoutReferenceUsedByAnotherOrder(entry.reference, order.id);
    if (duplicateReference) return { status: 409, error: `Payout reference is already used on order ${duplicateReference.id}` };

    additions.push({ ...entry, completedAt: Date.now(), adminId: admin.email });
    paidByMethod.set(entry.payoutMethodId, alreadyPaid + Number(entry.inrPaise));
  }

  if (!additions.length) return { ok: true, idempotent: true };
  const nextPaid = Number(payout.paidInrPaise || 0) + additions.reduce((sum, item) => sum + Number(item.inrPaise || 0), 0);
  if (nextPaid > Number(order.inrPaise)) return { status: 400, error: 'Payout total cannot exceed the order INR obligation' };

  if (!payout.startedAt) {
    payout.startedAt = Date.now();
    appendDigiAudit({ actorType: 'admin', actorId: admin.email, action: 'payout.started', entityType: 'sell-order', entityId: order.id, details: { amount: formatInrPaise(order.inrPaise) } });
  }
  payout.allocations = [...(payout.allocations || []), ...additions];
  payout.paidInrPaise = payout.allocations.reduce((sum, item) => sum + Number(item.inrPaise || 0), 0);
  payout.note = String(raw?.note || payout.note || '').trim().slice(0, 300);
  payout.status = payout.paidInrPaise === Number(payout.totalInrPaise) ? 'completed' : 'processing';
  payout.adminId = admin.email;
  order.updatedAt = Date.now();
  for (const entry of additions) appendDigiAudit({ actorType: 'admin', actorId: admin.email, action: 'payout.recorded', entityType: 'sell-order', entityId: order.id, details: { payoutMethodId: entry.payoutMethodId, amount: formatInrPaise(entry.inrPaise), mode: entry.mode, reference: entry.reference } });

  if (payout.status === 'completed') {
    payout.completedAt = Date.now();
    setDigiOrderStatus(order, 'Completed', 'Completed', payout.completedAt);
    releaseDigiAddress(order, payout.completedAt);
    appendDigiAudit({ actorType: 'admin', actorId: admin.email, action: 'payout.completed', entityType: 'sell-order', entityId: order.id, details: { amount: formatInrPaise(payout.totalInrPaise), references: additions.map(item => item.reference) } });
    createDigiNotification({ userId: order.userId, type: 'payout', title: 'INR payout completed', message: `INR payout for ${order.id} has been recorded.`, entityType: 'sell-order', entityId: order.id, sourceKey: `payout:${order.id}:completed` });
    processDigiReferralQualification(order);
    processDigiReferralTradeCommission(order);
  } else {
    setDigiOrderStatus(order, 'INR Processing', 'INR Processing', Date.now());
    createDigiNotification({ userId: order.userId, type: 'payout', title: 'Partial INR payout recorded', message: `${formatInrPaise(payout.paidInrPaise)} of ${formatInrPaise(payout.totalInrPaise)} has been recorded for ${order.id}.`, entityType: 'sell-order', entityId: order.id, sourceKey: `payout:${order.id}:partial:${payout.paidInrPaise}` });
  }
  return { ok: true, idempotent: false };
}

function recordDigiPayout(order, admin, raw) {
  if (order.payoutType === 'BANK' && order.flexibleBankAllocation) return recordFlexibleDigiBankPayout(order, admin, raw);
  const payoutInput = order.payoutType === 'UPI' && !raw?.allocations && !raw?.payoutMethodId
    ? { ...raw, payoutMethodId: order.payoutMethodId }
    : raw;
  if (order.status === 'Completed' && order.payout) {
    const replay = normalizeDigiPayoutEntries(payoutInput);
    const existing = order.payout.allocations || [];
    if (!replay.error && replay.entries.length === existing.length && replay.entries.every(entry => existing.some(item => item.payoutMethodId === entry.payoutMethodId && item.inrPaise === entry.inrPaise && item.mode === entry.mode && String(item.reference).toLowerCase() === entry.reference.toLowerCase()))) return { ok: true, idempotent: true };
  }
  if (!['USDT Confirmed', 'INR Processing'].includes(order.status)) return { status: 409, error: 'This order is not ready for INR payout' };
  if (!order.txId || order.chainStatus !== 'valid_exact' || Number(order.receivedUsdtMicros) !== Number(order.usdtMicros) || Number(order.confirmations || 0) < tronRequiredConfirmations) {
    return { status: 409, error: 'A server-verified exact USDT deposit with required confirmations is required' };
  }
  const parsed = normalizeDigiPayoutEntries(payoutInput);
  if (parsed.error) return { status: 400, error: parsed.error };
  const requestReferences = new Set();
  for (const entry of parsed.entries) {
    const referenceKey = entry.reference.toLowerCase();
    if (requestReferences.has(referenceKey)) return { status: 400, error: 'Each payout allocation must have a unique reference' };
    requestReferences.add(referenceKey);
  }
  const expected = expectedDigiPayoutAllocations(order);
  const expectedByMethod = new Map(expected.map(item => [item.payoutMethodId, item.inrPaise]));
  if (parsed.entries.some(item => !expectedByMethod.has(item.payoutMethodId) || expectedByMethod.get(item.payoutMethodId) !== item.inrPaise)) {
    return { status: 400, error: 'Payout allocations must exactly match the order obligation' };
  }
  const methodIds = new Set(expected.map(item => item.payoutMethodId));
  if (parsed.entries.length > expected.length || parsed.entries.some(item => !methodIds.has(item.payoutMethodId))) return { status: 400, error: 'Payout allocation does not belong to this order' };
  const payout = order.payout || (order.payout = {
    status: 'processing', totalInrPaise: Number(order.inrPaise), paidInrPaise: 0, allocations: [], startedAt: null, completedAt: null, note: '', adminId: null
  });
  const existingByMethod = new Map((payout.allocations || []).map(item => [item.payoutMethodId, item]));
  const additions = [];
  for (const entry of parsed.entries) {
    const existing = existingByMethod.get(entry.payoutMethodId);
    if (existing) {
      if (existing.inrPaise === entry.inrPaise && existing.mode === entry.mode && existing.reference.toLowerCase() === entry.reference.toLowerCase()) continue;
      return { status: 409, error: 'This payout allocation was already recorded with different details' };
    }
    if ((payout.allocations || []).some(item => String(item.reference || '').toLowerCase() === entry.reference.toLowerCase())) return { status: 409, error: 'Payout reference is already used on this order' };
    const duplicateReference = payoutReferenceUsedByAnotherOrder(entry.reference, order.id);
    if (duplicateReference) return { status: 409, error: `Payout reference is already used on order ${duplicateReference.id}` };
    additions.push({ ...entry, completedAt: Date.now(), adminId: admin.email });
  }
  if (!additions.length) return { ok: true, idempotent: true };
  if (order.status === 'USDT Confirmed') setDigiOrderStatus(order, 'INR Processing', 'INR Processing');
  if (!payout.startedAt) {
    payout.startedAt = Date.now();
    payout.adminId = admin.email;
    appendDigiAudit({ actorType: 'admin', actorId: admin.email, action: 'payout.started', entityType: 'sell-order', entityId: order.id, details: { amount: formatInrPaise(order.inrPaise) } });
  }
  payout.allocations = [...(payout.allocations || []), ...additions];
  payout.paidInrPaise = payout.allocations.reduce((sum, item) => sum + Number(item.inrPaise || 0), 0);
  payout.note = String(raw?.note || payout.note || '').trim().slice(0, 300);
  payout.status = payout.paidInrPaise === Number(payout.totalInrPaise) ? 'completed' : 'processing';
  payout.adminId = admin.email;
  order.updatedAt = Date.now();
  for (const entry of additions) appendDigiAudit({ actorType: 'admin', actorId: admin.email, action: 'payout.recorded', entityType: 'sell-order', entityId: order.id, details: { payoutMethodId: entry.payoutMethodId, amount: formatInrPaise(entry.inrPaise), mode: entry.mode, reference: entry.reference } });
  if (payout.status === 'completed') {
    payout.completedAt = Date.now();
    setDigiOrderStatus(order, 'Completed', 'Completed', payout.completedAt);
    releaseDigiAddress(order, payout.completedAt);
    appendDigiAudit({ actorType: 'admin', actorId: admin.email, action: 'payout.completed', entityType: 'sell-order', entityId: order.id, details: { amount: formatInrPaise(payout.totalInrPaise), references: additions.map(item => item.reference) } });
    createDigiNotification({ userId: order.userId, type: 'payout', title: 'INR payout completed', message: `INR payout for ${order.id} has been recorded.`, entityType: 'sell-order', entityId: order.id, sourceKey: `payout:${order.id}:completed` });
    processDigiReferralQualification(order);
    processDigiReferralTradeCommission(order);
  }
  return { ok: true, idempotent: false };
}

function decideDigiReview(order, admin, raw) {
  if (order.status !== 'Late Review') return { status: 409, error: 'This order is not awaiting review' };
  const decision = String(raw?.decision || '').trim().toUpperCase();
  const note = String(raw?.note || raw?.reason || '').trim().slice(0, 500);
  if (!['APPROVE', 'REJECT'].includes(decision)) return { status: 400, error: 'decision must be APPROVE or REJECT' };
  if (decision === 'REJECT' && note.length < 3) return { status: 400, error: 'A rejection reason is required' };
  if (decision === 'APPROVE' && (!order.txId || order.chainStatus !== 'valid_exact' || Number(order.receivedUsdtMicros) !== Number(order.usdtMicros) || Number(order.confirmations || 0) < tronRequiredConfirmations)) {
    return { status: 409, error: 'Only an independently verified exact deposit with required confirmations can be approved' };
  }
  const now = Date.now();
  order.review = { ...(order.review || {}), adminDecision: decision === 'APPROVE' ? 'approved' : 'rejected', adminNote: note, decidedAt: now, txId: order.review?.txId || order.txId || null };
  if (decision === 'REJECT') {
    setDigiOrderStatus(order, 'Rejected', 'Rejected', now);
    releaseDigiAddress(order, now);
    appendDigiAudit({ actorType: 'admin', actorId: admin.email, action: 'tx.review_rejected', entityType: 'sell-order', entityId: order.id, details: { reason: note, txId: order.txId || order.review.txId || null } });
    return { ok: true };
  }
  setDigiOrderStatus(order, 'USDT Confirmed', 'USDT Confirmed', now);
  appendDigiAudit({ actorType: 'admin', actorId: admin.email, action: 'tx.review_approved', entityType: 'sell-order', entityId: order.id, details: { txId: order.txId, confirmations: order.confirmations } });
  setDigiOrderStatus(order, 'INR Processing', 'INR Processing', now);
  ensureDigiPayoutRecord(order);
  releaseDigiAddress(order, now, { confirmed: true });
  return { ok: true };
}

let digiMonitorTimer = null;
let digiMonitorRunning = false;
const digiMonitorState = {
  lastCycleAt: null,
  lastSuccessfulProviderCheckAt: null,
  lastProviderErrorAt: null,
  lastError: null
};
async function runDigiMonitor() {
  if (digiMonitorRunning) return;
  digiMonitorRunning = true;
  try {
    digiMonitorState.lastError = null;
    let changed = expireDigiOrders();
    for (const order of monitorableDigiOrders()) changed = await pollDigiOrder(order) || changed;
    if (changed) await persist();
  } catch (error) {
    digiMonitorState.lastError = String(error.message || 'Monitor cycle failed').slice(0, 220);
    console.warn('digiRupee monitor cycle failed:', error.message);
  } finally {
    digiMonitorState.lastCycleAt = Date.now();
    digiMonitorRunning = false;
    if (tronVerifyMode === 'required' || tronVerifyMode === 'mock') {
      digiMonitorTimer = setTimeout(() => {
        digiMonitorTimer = null;
        runDigiMonitor();
      }, tronPollIntervalMs);
    }
  }
}

function startDigiMonitor() {
  if (tronVerifyMode !== 'required' && tronVerifyMode !== 'mock') return;
  if (digiMonitorTimer) return;
  digiMonitorTimer = setTimeout(() => {
    digiMonitorTimer = null;
    runDigiMonitor();
  }, 1_000);
}

function auth(req) {
  const token = sessionToken(req);
  const uid = verifySession(token);
  if (!uid) throw Object.assign(new Error('Please login again'), { status: 401 });
  const user = db.users.find(u => u.id === uid);
  if (!user) throw Object.assign(new Error('User not found'), { status: 401 });
  return { token, user };
}

function adminAuth(req) {
  const token = adminSessionToken(req);
  const admin = verifyAdminSession(token);
  if (!admin) {
    throw Object.assign(new Error('Admin authentication required'), { status: 401 });
  }
  return admin;
}

function requireAdminRole(admin, roles) {
  if (!roles.includes(admin.role)) {
    throw Object.assign(new Error('Admin role is not allowed for this action'), { status: 403 });
  }
}

function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    mobile: u.mobile || '',
    currency: u.currency || 'INR',
    wallet: u.wallet || '',
    createdAt: u.createdAt
  };
}

function userData(u) {
  return {
    user: publicUser(u),
    orders: db.orders.filter(o => o.userId === u.id).map(publicOrder).sort((a, b) => b.date - a.date),
    tickets: db.tickets.filter(t => t.userId === u.id).sort((a, b) => b.createdAt - a.createdAt),
    notifications: db.notifications.filter(n => n.userId === u.id).slice(0, 30)
  };
}

function publicOrder(order) {
  const { proofFile, idempotencyKey, paymentVerification, settlement, rejection, ...safe } = order;
  if (paymentVerification) {
    safe.paymentVerification = {
      bankReference: paymentVerification.bankReference,
      note: paymentVerification.note,
      verifiedAt: paymentVerification.verifiedAt
    };
  }
  if (settlement) safe.settlement = {
    txId: settlement.txId,
    network: settlement.network,
    recordedAt: settlement.recordedAt,
    verification: settlement.verification ? {
      mode: settlement.verification.mode,
      verifiedAt: settlement.verification.verifiedAt,
      blockNumber: settlement.verification.blockNumber || null
    } : null
  };
  if (rejection) safe.rejection = { reason: rejection.reason, rejectedAt: rejection.rejectedAt };
  return safe;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
}

function appendAudit({ actorType, actorId, action, entityType, entityId, details = {} }) {
  const previous = db.auditLog.at(-1)?.hash || 'GENESIS';
  const entry = {
    id: 'aud_' + randomUUID(),
    at: Date.now(),
    actorType,
    actorId,
    action,
    entityType,
    entityId,
    details: canonical(details),
    previous
  };
  entry.hash = createHash('sha256').update(previous + '|' + JSON.stringify(entry)).digest('hex');
  db.auditLog.push(entry);
  return entry;
}

function appendDigiAudit({ actorType, actorId, action, entityType, entityId, details = {} }) {
  const previous = db.digirupee.auditLog.at(-1)?.hash || 'GENESIS';
  const entry = {
    id: 'dga_' + randomUUID(),
    at: Date.now(),
    actorType,
    actorId,
    action,
    entityType,
    entityId,
    details: canonical(details),
    previous
  };
  entry.hash = createHash('sha256').update(previous + '|' + JSON.stringify(entry)).digest('hex');
  db.digirupee.auditLog.push(entry);
  return entry;
}

function auditHealthy() {
  let previous = 'GENESIS';
  for (const existing of db.auditLog) {
    const { hash, ...entry } = existing;
    if (entry.previous !== previous) return false;
    const expected = createHash('sha256').update(previous + '|' + JSON.stringify(entry)).digest('hex');
    if (!safeEqualText(hash, expected)) return false;
    previous = hash;
  }
  return true;
}

function rebuildAuditChain(reason) {
  let previous = 'GENESIS';
  for (const existing of db.auditLog) {
    const legacyHash = existing.hash || '';
    delete existing.hash;
    existing.previous = previous;
    if (legacyHash && !existing.legacyHash) existing.legacyHash = legacyHash;
    existing.hash = createHash('sha256').update(previous + '|' + JSON.stringify(existing)).digest('hex');
    previous = existing.hash;
  }
  appendAudit({ actorType: 'system', actorId: 'server', action: 'audit.repaired', entityType: 'audit-log', entityId: 'runtime', details: { reason } });
}

function parseAdminUsers() {
  const raw = String(process.env.ADMIN_USERS || '').trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error('ADMIN_USERS must be an array');
      return parsed.map((item, index) => ({
        email: String(item.email || '').trim().toLowerCase(),
        password: String(item.password || ''),
        passwordHash: String(item.passwordHash || ''),
        role: ['owner', 'ops', 'support'].includes(String(item.role || 'ops')) ? String(item.role || 'ops') : 'ops',
        mfaCode: String(item.mfaCode || '')
      })).filter(item => safeEmail(item.email) && (item.password || item.passwordHash));
    } catch (error) {
      console.error('ADMIN_USERS is invalid JSON:', error.message);
      return [];
    }
  }
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || '');
  const passwordHash = String(process.env.ADMIN_PASSWORD_HASH || '');
  if (!safeEmail(email) || (!password && !passwordHash)) return [];
  return [{
    email,
    password,
    passwordHash,
    role: ['owner', 'ops', 'support'].includes(String(process.env.ADMIN_ROLE || 'owner')) ? String(process.env.ADMIN_ROLE || 'owner') : 'owner',
    mfaCode: String(process.env.ADMIN_MFA_CODE || '')
  }];
}

function findAdmin(email) {
  return adminUsers.find(item => safeEqualText(item.email, String(email || '').trim().toLowerCase()));
}

function verifyAdminPassword(admin, password) {
  if (admin.passwordHash) return verifyPassword(password, admin.passwordHash);
  return safeEqualText(password, admin.password);
}

function verifyAdminMfa(admin, code) {
  if (!admin.mfaCode) return true;
  return safeEqualText(String(code || '').trim(), admin.mfaCode);
}

function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
}

const rateBuckets = new Map();
function limitRequest(req, key, max, windowMs) {
  const now = Date.now();
  const bucketKey = `${clientIp(req)}:${key}`;
  const current = rateBuckets.get(bucketKey);
  if (!current || current.resetAt <= now) {
    rateBuckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
    return;
  }
  current.count += 1;
  if (current.count > max) {
    const error = Object.assign(new Error('Too many requests. Please try again later.'), { status: 429 });
    error.retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    throw error;
  }
}

function assertSameOrigin(req) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method || '')) return;
  if (String(req.headers['sec-fetch-site'] || '').toLowerCase() === 'cross-site') {
    throw Object.assign(new Error('Cross-site request rejected'), { status: 403 });
  }
  const origin = String(req.headers.origin || '').replace(/\/$/, '');
  if (!origin) return;
  const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
  const hostOrigin = `${proto}://${req.headers.host}`;
  if (origin !== hostOrigin && !configuredOrigins.includes(origin)) {
    throw Object.assign(new Error('Origin not allowed'), { status: 403 });
  }
}

function validProof(raw, type) {
  if (type === 'image/png') return raw.length >= 8 && raw.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
  if (type === 'image/jpeg' || type === 'image/jpg') return raw.length >= 4 && raw[0] === 0xff && raw[1] === 0xd8 && raw.at(-2) === 0xff && raw.at(-1) === 0xd9;
  if (type === 'image/webp') return raw.length >= 12 && raw.toString('ascii', 0, 4) === 'RIFF' && raw.toString('ascii', 8, 12) === 'WEBP';
  return false;
}

function base58Encode(buffer) {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let value = BigInt('0x' + buffer.toString('hex'));
  let encoded = '';
  while (value > 0n) {
    encoded = alphabet[Number(value % 58n)] + encoded;
    value /= 58n;
  }
  for (const byte of buffer) {
    if (byte !== 0) break;
    encoded = '1' + encoded;
  }
  return encoded || '1';
}

function normalizeTronAddress(value) {
  const address = String(value || '').trim();
  if (/^T[1-9A-HJ-NP-Za-km-z]{25,40}$/.test(address)) return address;
  let hex = address.replace(/^0x/i, '').toLowerCase();
  if (/^[a-f0-9]{40}$/.test(hex)) hex = '41' + hex;
  if (!/^41[a-f0-9]{40}$/.test(hex)) return '';
  const payload = Buffer.from(hex, 'hex');
  const first = createHash('sha256').update(payload).digest();
  const checksum = createHash('sha256').update(first).digest().subarray(0, 4);
  return base58Encode(Buffer.concat([payload, checksum]));
}

async function verifyUsdtTransfer(order, txId) {
  if (tronVerifyMode !== 'required') {
    return { mode: 'manual', verifiedAt: Date.now() };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  let response;
  try {
    response = await fetch(`${tronApiUrl}/v1/transactions/${encodeURIComponent(txId)}/events?only_confirmed=true&limit=200`, {
      headers: tronApiKey ? { 'TRON-PRO-API-KEY': tronApiKey } : {},
      signal: controller.signal
    });
  } catch (error) {
    throw Object.assign(new Error(error.name === 'AbortError' ? 'TRON verification timed out' : 'TRON verification is unavailable'), { status: 502 });
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) throw Object.assign(new Error('TRON verification provider rejected the request'), { status: 502 });
  const payload = await response.json().catch(() => ({}));
  const events = Array.isArray(payload.data) ? payload.data : [];
  const expectedUnits = BigInt(Math.round(Number(order.usdt) * 1_000_000));
  const expectedWallet = normalizeTronAddress(order.wallet);
  const expectedContract = normalizeTronAddress(tronUsdtContract);
  const event = events.find(item => {
    if (String(item.event_name || '').toLowerCase() !== 'transfer') return false;
    if (normalizeTronAddress(item.contract_address) !== expectedContract) return false;
    const result = item.result || {};
    const recipient = normalizeTronAddress(result.to ?? result[1]);
    const rawValue = String(result.value ?? result[2] ?? '');
    try { return recipient === expectedWallet && BigInt(rawValue) === expectedUnits; } catch { return false; }
  });
  if (!event) {
    throw Object.assign(new Error('Confirmed USDT transfer matching this wallet and exact amount was not found'), { status: 422 });
  }
  return {
    mode: 'on-chain',
    verifiedAt: Date.now(),
    blockNumber: Number(event.block_number || 0) || null,
    blockTimestamp: Number(event.block_timestamp || 0) || null,
    contract: tronUsdtContract
  };
}

function safeEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function validPassword(v) {
  return typeof v === 'string' && v.length >= 8 && v.length <= 128;
}

function proofExt(type) {
  return type === 'image/png' ? '.png' : type === 'image/webp' ? '.webp' : '.jpg';
}

function normalizeReference(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function publicBankEntry(entry) {
  const { normalizedReference, ...safe } = entry;
  return safe;
}

function parseBankEntry(raw) {
  const reference = String(raw.reference || raw.utr || raw.ref || '').trim().slice(0, 80);
  const amount = Number(raw.amount || raw.inr || raw.paid);
  if (normalizeReference(reference).length < 6 || !Number.isFinite(amount) || amount <= 0) return null;
  return {
    reference,
    normalizedReference: normalizeReference(reference),
    amount: Number(amount.toFixed(2)),
    date: String(raw.date || new Date().toISOString()).slice(0, 40),
    source: String(raw.source || 'manual-import').slice(0, 60),
    note: String(raw.note || '').slice(0, 220)
  };
}

async function autoMatchBankLedger(admin) {
  const matched = [];
  for (const entry of db.bankLedger) {
    if (entry.status === 'matched') continue;
    const order = db.orders.find(item =>
      item.status === 'Under Review' &&
      normalizeReference(item.utr) === entry.normalizedReference &&
      Math.abs(Number(item.paid || item.inr) - Number(entry.amount)) <= 1
    );
    if (!order) continue;
    order.status = 'Payment Verified';
    order.paymentVerification = {
      bankReference: entry.reference,
      note: `Auto-matched from bank ledger import ${entry.id}`,
      verifiedAt: Date.now(),
      verifiedBy: admin.email,
      ledgerEntryId: entry.id
    };
    order.updatedAt = Date.now();
    entry.status = 'matched';
    entry.matchedOrderId = order.id;
    entry.matchedAt = Date.now();
    db.notifications.unshift({
      id: randomUUID(),
      userId: order.userId,
      title: 'Payment verified',
      text: `${order.id} payment matched in bank ledger and is queued for USDT delivery.`,
      time: 'Just now'
    });
    appendAudit({ actorType: 'admin', actorId: admin.email, action: 'order.payment_auto_verified', entityType: 'order', entityId: order.id, details: { ledgerEntryId: entry.id, bankReference: entry.reference, amount: entry.amount } });
    await emitAlert('order.payment_auto_verified', { orderId: order.id, ledgerEntryId: entry.id, amount: entry.amount, utr: order.utr });
    matched.push(order.id);
  }
  return matched;
}

async function emitAlert(event, payload) {
  if (!alertWebhookUrl) return;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      await fetch(alertWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event, at: new Date().toISOString(), payload }),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    console.warn('Alert webhook failed:', error.message);
  }
}

function backupSnapshot() {
  return {
    exportedAt: new Date().toISOString(),
    schema: 'loktron-runtime-v2',
    config: db.config,
    users: db.users,
    orders: db.orders,
    bankLedger: db.bankLedger,
    tickets: db.tickets,
    notifications: db.notifications,
    auditLog: db.auditLog
  };
}

if (!auditHealthy() && String(process.env.AUDIT_REPAIR_ON_BOOT || '').toLowerCase() === 'true') {
  rebuildAuditChain('AUDIT_REPAIR_ON_BOOT');
  await persist();
  console.warn('Audit chain was rebuilt because AUDIT_REPAIR_ON_BOOT=true');
}

function headers(type) {
  return {
    'Content-Type': type,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'SAMEORIGIN',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    ...(production ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' } : {}),
    'Cache-Control': type.startsWith('image/') ? 'public, max-age=86400' : 'no-cache',
    'Content-Security-Policy': "default-src 'self' data: blob:; base-uri 'self'; object-src 'none'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; form-action 'self'; frame-ancestors 'self'"
  };
}

function publicDigiProfile(user) {
  return {
    fullName: user.profile.fullName,
    email: user.email,
    mobile: user.mobile,
    userId: user.id,
    joinedAt: user.createdAt,
    accountStatus: user.status,
    language: user.profile.language,
    notificationPreference: user.profile.notificationPreference
  };
}

function digiUserResponse(user) {
  return { user: publicDigiUser(user), profile: publicDigiProfile(user) };
}

function adminDigiPayoutMethod(method) {
  if (!method) return null;
  return {
    id: method.id,
    userId: method.userId,
    type: method.type,
    label: method.label,
    ...(method.type === 'UPI'
      ? { upiId: method.upiId, holderName: method.holderName, mobile: method.mobile }
      : { bankName: method.bankName, accountNumber: maskDigiValue(method.accountNumber, 0, 4), ifsc: method.ifsc, holderName: method.holderName, mobile: method.mobile }),
    minInr: method.minInr,
    maxInr: method.maxInr,
    dailyLimitInr: method.dailyLimitInr,
    enabled: !!method.enabled,
    createdAt: method.createdAt,
    updatedAt: method.updatedAt
  };
}

function digiUserActivityAt(userId) {
  const sessionAt = db.digirupee.sessions.filter(session => session.uid === userId).reduce((latest, session) => Math.max(latest, Number(session.createdAt || 0)), 0);
  const orderAt = db.digirupee.orders.filter(order => order.userId === userId).reduce((latest, order) => Math.max(latest, Number(order.updatedAt || order.createdAt || 0)), 0);
  return Math.max(sessionAt, orderAt);
}

function digiUserAdminSummary(user) {
  const orders = db.digirupee.orders.filter(order => order.userId === user.id);
  const completed = orders.filter(order => order.status === 'Completed');
  const paidInrPaise = completed.reduce((sum, order) => sum + Number(order.payout?.paidInrPaise || 0), 0);
  const activeOrders = orders.filter(digiOrderIsActive);
  return {
    id: user.id,
    name: user.profile?.fullName || '',
    email: user.email,
    mobile: user.mobile,
    accountStatus: user.status,
    joinedAt: user.createdAt,
    lastActiveAt: digiUserActivityAt(user.id) || null,
    completedOrders: completed.length,
    activeOrders: activeOrders.length,
    usdtVolume: formatUsdtMicros(completed.reduce((sum, order) => sum + Number(order.usdtMicros || 0), 0)),
    inrSettled: formatInrPaise(paidInrPaise),
    payoutMethodCount: db.digirupee.payoutMethods.filter(method => method.userId === user.id).length,
    rewardBalance: formatUsdtMicros(rewardBalanceMicros(user.id))
  };
}

function digiOverviewMetrics() {
  const orders = db.digirupee.orders;
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const activeUsers = db.digirupee.users.filter(user => user.status === 'active' && digiUserActivityAt(user.id) >= thirtyDaysAgo).length;
  const settledOrders = orders.filter(order => order.status === 'Completed');
  const pendingPayouts = orders.filter(order => ['USDT Confirmed', 'INR Processing'].includes(order.status));
  return {
    totalUsers: db.digirupee.users.length,
    activeUsers,
    totalOrders: orders.length,
    byStatus: Object.fromEntries([...new Set([...digiActiveStatuses, ...digiFinalStatuses])].map(status => [status, orders.filter(order => order.status === status).length])),
    totalUsdtVolume: formatUsdtMicros(settledOrders.reduce((sum, order) => sum + Number(order.usdtMicros || 0), 0)),
    totalInrSettled: formatInrPaise(settledOrders.reduce((sum, order) => sum + Number(order.payout?.paidInrPaise || 0), 0)),
    pendingPayouts: pendingPayouts.length,
    pendingReviews: orders.filter(order => order.status === 'Late Review').length,
    enabledTronAddresses: db.digirupee.tronAddresses.filter(address => address.enabled).length,
    rewards: digiRewardMetrics(),
    updatedAt: Date.now()
  };
}

function digiAdminUserDetail(user) {
  const summary = digiUserAdminSummary(user);
  return {
    ...summary,
    security: digiSecuritySummary(user),
    profile: publicDigiProfile(user),
    payoutMethods: db.digirupee.payoutMethods.filter(method => method.userId === user.id).map(adminDigiPayoutMethod),
    recentOrders: db.digirupee.orders.filter(order => order.userId === user.id).sort((a, b) => Number(b.createdAt) - Number(a.createdAt)).slice(0, 20).map(order => publicDigiOrder(order, { admin: true }))
  };
}

function digiAddressHistory(addressId) {
  return db.digirupee.addressAssignments.filter(item => item.addressId === addressId).sort((a, b) => Number(b.assignedAt) - Number(a.assignedAt)).map(item => {
    const user = db.digirupee.users.find(candidate => candidate.id === item.userId);
    return {
      orderId: item.orderId,
      user: user ? { id: user.id, name: user.profile?.fullName || '', email: user.email } : { id: item.userId, name: '', email: '' },
      assignedAt: item.assignedAt,
      quoteExpiresAt: item.quoteExpiresAt,
      releasedAt: item.releasedAt || null,
      safeReuseAt: item.safeReuseAt || null,
      txId: item.txId || null,
      status: item.status
    };
  });
}

function validDigiAmount(value, minimum = 0.01, maximum = 1_000_000) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= minimum && amount <= maximum ? Number(amount.toFixed(6)) : null;
}

const defaultDigiWheelRewards = [1, 3, 5, 6, 8, 10, 12, 15];
const defaultDigiWheelWeights = [20, 18, 16, 14, 12, 10, 6, 4];
function defaultDigiWheelSegments() {
  return defaultDigiWheelRewards.map((reward, index) => ({
    id: `sector_${index + 1}`,
    label: `${reward} USDT`,
    rewardAmountMicros: reward * 1_000_000,
    probabilityWeight: defaultDigiWheelWeights[index],
    enabled: true
  }));
}

function ensureDigiWheelDefaults() {
  const config = db.digirupee?.wheelConfig;
  if (!config) return false;
  const segments = Array.isArray(config.segments) ? config.segments : [];
  const legacyPlaceholder = segments.length === 8 && segments.every((segment, index) =>
    String(segment.id || '') === `sector_${index + 1}` &&
    Number(segment.rewardAmountMicros || 0) === 0 &&
    Number(segment.probabilityWeight || 0) === 1
  );
  if (segments.length && !legacyPlaceholder) return false;
  config.segments = defaultDigiWheelSegments();
  config.updatedAt = Date.now();
  return true;
}

function ensureDigiReferralCodes() {
  let changed = false;
  const used = new Set();
  for (const user of db.digirupee.users) {
    const existing = String(user.referralCode || '').trim().toUpperCase();
    if (existing && /^DGR[A-F0-9]{10}$/.test(existing) && !used.has(existing)) { user.referralCode = existing; used.add(existing); continue; }
    let code = '';
    do code = `DGR${randomBytes(5).toString('hex').toUpperCase()}`; while (used.has(code));
    user.referralCode = code;
    used.add(code);
    changed = true;
  }
  return changed;
}

function rewardBalanceMicros(userId) {
  return db.digirupee.rewardLedger.filter(entry => entry.userId === userId && entry.status === 'posted').reduce((sum, entry) => {
    const amount = Number(entry.amountMicros || 0);
    return sum + (entry.direction === 'debit' ? -amount : amount);
  }, 0);
}

function rewardLedgerPublic(entry) {
  return {
    id: entry.id,
    type: entry.type,
    amount: formatUsdtMicros(entry.amountMicros),
    direction: entry.direction,
    sourceType: entry.sourceType,
    sourceId: entry.sourceId,
    description: entry.description,
    createdAt: entry.createdAt,
    status: entry.status
  };
}

function rewardLedgerAdmin(entry) {
  const user = db.digirupee.users.find(item => item.id === entry.userId);
  return { ...rewardLedgerPublic(entry), user: user ? { id: user.id, name: user.profile?.fullName || '', email: user.email } : { id: entry.userId } };
}

function digiRewardMetrics() {
  const posted = db.digirupee.rewardLedger.filter(entry => entry.status === 'posted');
  const credits = posted.filter(entry => entry.direction === 'credit').reduce((sum, entry) => sum + Number(entry.amountMicros || 0), 0);
  return {
    totalRewardLiability: formatUsdtMicros(db.digirupee.users.reduce((sum, user) => sum + rewardBalanceMicros(user.id), 0)),
    totalRewardsIssued: formatUsdtMicros(credits),
    ledgerEntries: db.digirupee.rewardLedger.length,
    pendingTaskClaims: db.digirupee.taskClaims.filter(claim => claim.status === 'pending_review').length,
    wheelSpinsToday: db.digirupee.wheelClaims.filter(claim => claim.dayKey === indiaDayKey()).length
  };
}

function issueDigiReward({ userId, amountMicros, type, sourceType, sourceId, description, idempotencyKey = null }) {
  const amount = Number(amountMicros);
  if (!Number.isSafeInteger(amount) || amount < 0) return { error: 'Reward amount is invalid' };
  const existing = db.digirupee.rewardLedger.find(entry => entry.userId === userId && entry.sourceType === sourceType && entry.sourceId === sourceId && entry.status === 'posted');
  if (existing) return { entry: existing, idempotent: true };
  if (idempotencyKey) {
    const byKey = db.digirupee.rewardLedger.find(entry => entry.idempotencyKey === idempotencyKey);
    if (byKey) return { entry: byKey, idempotent: true };
  }
  const now = Date.now();
  const entry = { id: `drl_${randomUUID().replace(/-/g, '').slice(0, 12)}`, userId, type, amountMicros: amount, direction: 'credit', sourceType, sourceId, description: String(description || '').slice(0, 300), createdAt: now, status: 'posted', idempotencyKey };
  db.digirupee.rewardLedger.push(entry);
  db.digirupee.rewards.push({ id: `drw_${randomUUID().replace(/-/g, '').slice(0, 12)}`, userId, ledgerId: entry.id, sourceType, sourceId, amountMicros: amount, direction: 'credit', status: 'posted', createdAt: now });
  appendDigiAudit({ actorType: 'system', actorId: 'digirupee', action: 'reward.issued', entityType: 'reward', entityId: entry.id, details: { userId, sourceType, sourceId, amount: formatUsdtMicros(amount) } });
  createDigiNotification({ userId, type: sourceType === 'referral' ? 'referral' : sourceType === 'campaign' || sourceType === 'task' ? 'campaign' : 'reward', title: 'Reward credited', message: `${formatUsdtMicros(amount)} USDT reward credited.`, entityType: 'reward', entityId: entry.id, sourceKey: `reward:${entry.id}` });
  return { entry, idempotent: false };
}

function parseDigiDate(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  const time = typeof value === 'number' ? value : Date.parse(String(value));
  return Number.isFinite(time) && time > 0 ? time : null;
}

const digiCampaignTypes = new Set(['TRADE', 'MANUAL_TASK', 'LOGIN', 'PROMOTIONAL']);
const digiClaimTypes = new Set(['AUTO', 'MANUAL']);

function campaignIsCurrent(campaign, timestamp = Date.now()) {
  return !!campaign.enabled && Number(campaign.startsAt || 0) <= timestamp && (!campaign.endsAt || Number(campaign.endsAt) >= timestamp);
}

function taskIsCurrent(task, timestamp = Date.now()) {
  return !!task.enabled && Number(task.startsAt || 0) <= timestamp && (!task.endsAt || Number(task.endsAt) >= timestamp);
}

function campaignVisibleToUser(campaign, timestamp = Date.now()) {
  return !!campaign.enabled && (!campaign.endsAt || Number(campaign.endsAt) >= timestamp);
}

function taskVisibleToUser(task, timestamp = Date.now()) {
  return !!task.enabled && (!task.endsAt || Number(task.endsAt) >= timestamp);
}

function completedDigiOrders(userId) {
  return db.digirupee.orders.filter(order => order.userId === userId && order.status === 'Completed');
}

function evaluateDigiTask(task, userId) {
  const orders = completedDigiOrders(userId);
  const req = task.requirements && typeof task.requirements === 'object' ? task.requirements : {};
  if (task.claimType !== 'AUTO') return { eligible: false, progress: null, reason: 'This task requires admin review' };
  if (task.campaignType !== 'TRADE' && !Object.keys(req).length) return { eligible: false, progress: null, reason: 'This task has no server-verifiable requirement' };
  if (req.firstCompletedOrder || (!Object.keys(req).length && task.campaignType === 'TRADE')) return { eligible: orders.length > 0, progress: Math.min(orders.length, 1), target: 1, reason: orders.length ? '' : 'Complete a sell order' };
  const countTarget = Number(req.completedOrders || req.orderCount || 0);
  if (Number.isInteger(countTarget) && countTarget > 0) return { eligible: orders.length >= countTarget, progress: Math.min(orders.length, countTarget), target: countTarget, reason: `${countTarget} completed order(s) required` };
  if (req.minimumCompletedUsdt !== undefined) {
    const target = parseUsdtMicros(req.minimumCompletedUsdt);
    const current = orders.reduce((sum, order) => sum + Number(order.usdtMicros || 0), 0);
    return { eligible: target !== null && current >= target, progress: formatUsdtMicros(current), target: target === null ? null : formatUsdtMicros(target), reason: 'Complete the required USDT volume' };
  }
  if (req.minimumOrderUsdt !== undefined) {
    const target = parseUsdtMicros(req.minimumOrderUsdt);
    const current = orders.reduce((max, order) => Math.max(max, Number(order.usdtMicros || 0)), 0);
    return { eligible: target !== null && current >= target, progress: formatUsdtMicros(current), target: target === null ? null : formatUsdtMicros(target), reason: 'Complete an order above the required amount' };
  }
  return { eligible: false, progress: null, reason: 'This task requirement is not supported' };
}

function publicDigiTask(task, userId = null) {
  const claim = userId ? db.digirupee.taskClaims.find(item => item.userId === userId && item.taskId === task.id) : null;
  const evaluation = userId ? evaluateDigiTask(task, userId) : null;
  const now = Date.now();
  return {
    id: task.id, campaignId: task.campaignId, title: task.title, description: task.description,
    rewardAmount: formatUsdtMicros(task.rewardAmountMicros), enabled: !!task.enabled, claimType: task.claimType,
    startsAt: task.startsAt, endsAt: task.endsAt, maxClaimsPerUser: task.maxClaimsPerUser,
    active: taskIsCurrent(task, now),
    upcoming: !!task.enabled && Number(task.startsAt || 0) > now,
    eligibility: evaluation ? { ...evaluation, requirements: undefined } : undefined,
    claim: claim ? { id: claim.id, status: claim.status, submittedAt: claim.submittedAt, reviewedAt: claim.reviewedAt || null } : null
  };
}

function publicDigiCampaign(campaign, userId = null) {
  const now = Date.now();
  return {
    id: campaign.id,
    title: campaign.title,
    description: campaign.description,
    type: campaign.type,
    rewardAmount: formatUsdtMicros(campaign.rewardAmountMicros),
    startsAt: campaign.startsAt,
    endsAt: campaign.endsAt,
    enabled: !!campaign.enabled,
    active: campaignIsCurrent(campaign, now),
    upcoming: !!campaign.enabled && Number(campaign.startsAt || 0) > now,
    eligibility: campaign.eligibility || {},
    maxClaims: campaign.maxClaims,
    createdAt: campaign.createdAt,
    updatedAt: campaign.updatedAt,
    tasks: (campaign.tasks || [])
      .filter(task => taskVisibleToUser(task, now) || (userId && db.digirupee.taskClaims.some(claim => claim.userId === userId && claim.taskId === task.id)))
      .map(task => publicDigiTask({ ...task, campaignType: campaign.type }, userId))
  };
}

function adminDigiCampaign(campaign) {
  return { ...publicDigiCampaign(campaign), rewardAmountMicros: campaign.rewardAmountMicros, tasks: (campaign.tasks || []).map(task => ({ ...task, rewardAmount: formatUsdtMicros(task.rewardAmountMicros) })) };
}

function campaignClaimCount(campaignId) {
  return db.digirupee.taskClaims.filter(claim => claim.campaignId === campaignId && ['pending_review', 'approved', 'credited'].includes(claim.status)).length;
}

function referralPolicy() {
  const policy = db.digirupee.config.referrals || {};
  const inviterCommissionPercent = validDigiAmount(policy.inviterCommissionPercent ?? 0.5, 0, 100) ?? 0;
  return {
    enabled: policy.enabled !== false,
    inviterCommissionPercent,
    inviterRewardUsdt: Number(policy.inviterRewardUsdt || 0),
    referredRewardUsdt: Number(policy.referredRewardUsdt || 0),
    minimumCompletedUsdt: Number(policy.minimumCompletedUsdt || 0)
  };
}

function referralCommissionEntry(order, referrerUserId) {
  return db.digirupee.rewardLedger.find(entry => entry.userId === referrerUserId && entry.sourceType === 'referral_commission' && entry.sourceId === order.id && entry.status === 'posted') || null;
}

function completedDigiOrderAt(order) {
  const timeline = Array.isArray(order.timeline) ? order.timeline.find(item => item.status === 'Completed') : null;
  return Number(order.payout?.completedAt || timeline?.at || order.updatedAt || order.createdAt || 0) || null;
}

function referralTradeSummary(order, referrerUserId) {
  const commission = referralCommissionEntry(order, referrerUserId);
  return {
    orderId: order.id,
    createdAt: order.createdAt,
    completedAt: order.status === 'Completed' ? completedDigiOrderAt(order) : null,
    status: order.status,
    payoutType: order.payoutType,
    usdtAmount: formatUsdtMicros(order.usdtMicros),
    inrAmount: formatInrPaise(order.inrPaise),
    commissionUsdt: formatUsdtMicros(commission?.amountMicros || 0)
  };
}

function referralStats(referral) {
  const completed = db.digirupee.orders.filter(order => order.userId === referral.referredUserId && order.status === 'Completed');
  const commissionEntries = completed.map(order => referralCommissionEntry(order, referral.referrerUserId)).filter(Boolean);
  return {
    completedTradeCount: completed.length,
    completedVolumeUsdt: formatUsdtMicros(completed.reduce((sum, order) => sum + Number(order.usdtMicros || 0), 0)),
    commissionEarnedUsdt: formatUsdtMicros(commissionEntries.reduce((sum, entry) => sum + Number(entry.amountMicros || 0), 0)),
    lastCompletedTradeAt: completed.length ? Math.max(...completed.map(completedDigiOrderAt)) : null
  };
}

function referralPublic(referral, { includeInviter = false } = {}) {
  const inviter = db.digirupee.users.find(user => user.id === referral.referrerUserId);
  const referred = db.digirupee.users.find(user => user.id === referral.referredUserId);
  const result = {
    id: referral.id,
    status: referral.status,
    createdAt: referral.createdAt,
    qualifiedAt: referral.qualifiedAt || null,
    referred: referred ? { id: referred.id, name: referred.profile?.fullName || '' } : { id: referral.referredUserId, name: '' },
    stats: referralStats(referral),
    inviterReward: referral.inviterRewardLedgerId ? formatUsdtMicros(db.digirupee.rewardLedger.find(item => item.id === referral.inviterRewardLedgerId)?.amountMicros || 0) : '0',
    referredReward: referral.referredRewardLedgerId ? formatUsdtMicros(db.digirupee.rewardLedger.find(item => item.id === referral.referredRewardLedgerId)?.amountMicros || 0) : '0',
    qualifyingOrderId: referral.qualifyingOrderId || null
  };
  if (includeInviter) result.inviter = inviter ? { id: inviter.id, name: inviter.profile?.fullName || '', email: inviter.email } : { id: referral.referrerUserId, name: '' };
  return result;
}

function processDigiReferralQualification(order) {
  if (!order || order.status !== 'Completed') return false;
  const policy = referralPolicy();
  if (!policy.enabled) return false;
  const referral = db.digirupee.referrals.find(item => item.referredUserId === order.userId);
  if (!referral || referral.status === 'qualified' || referral.status === 'rewarded') return false;
  const minimum = parseUsdtMicros(policy.minimumCompletedUsdt) || 0;
  if (Number(order.usdtMicros || 0) < minimum) return false;
  referral.status = 'qualified';
  referral.qualifiedAt = Date.now();
  referral.qualifyingOrderId = order.id;
  appendDigiAudit({ actorType: 'system', actorId: 'digirupee', action: 'referral.qualified', entityType: 'referral', entityId: referral.id, details: { qualifyingOrderId: order.id } });
  const inviter = db.digirupee.users.find(user => user.id === referral.referrerUserId);
  if (inviter && policy.inviterRewardUsdt > 0) {
    const result = issueDigiReward({ userId: inviter.id, amountMicros: parseUsdtMicros(policy.inviterRewardUsdt), type: 'referral', sourceType: 'referral', sourceId: `${referral.id}:inviter`, description: 'Referral reward for a qualifying completed sell order' });
    if (result.entry) referral.inviterRewardLedgerId = result.entry.id;
  }
  const referred = db.digirupee.users.find(user => user.id === referral.referredUserId);
  if (referred && policy.referredRewardUsdt > 0) {
    const result = issueDigiReward({ userId: referred.id, amountMicros: parseUsdtMicros(policy.referredRewardUsdt), type: 'referral', sourceType: 'referral', sourceId: `${referral.id}:referred`, description: 'Referral reward for your first qualifying completed sell order' });
    if (result.entry) referral.referredRewardLedgerId = result.entry.id;
  }
  referral.status = 'rewarded';
  appendDigiAudit({ actorType: 'system', actorId: 'digirupee', action: 'referral.rewarded', entityType: 'referral', entityId: referral.id, details: { qualifyingOrderId: order.id } });
  return true;
}

function processDigiReferralTradeCommission(order) {
  if (!order || order.status !== 'Completed') return false;
  const policy = referralPolicy();
  if (!policy.enabled) return false;
  const referral = db.digirupee.referrals.find(item => item.referredUserId === order.userId);
  if (!referral) return false;
  const commissionBps = Math.round(Number(policy.inviterCommissionPercent) * 100);
  const basisMicros = Number(order.usdtMicros || 0);
  if (!Number.isSafeInteger(basisMicros) || basisMicros <= 0 || !Number.isInteger(commissionBps) || commissionBps <= 0) return false;
  const commissionMicrosBig = (BigInt(basisMicros) * BigInt(commissionBps)) / 10000n;
  if (commissionMicrosBig <= 0n || commissionMicrosBig > BigInt(Number.MAX_SAFE_INTEGER)) return false;
  const inviter = db.digirupee.users.find(user => user.id === referral.referrerUserId);
  if (!inviter) return false;
  const result = issueDigiReward({
    userId: inviter.id,
    amountMicros: Number(commissionMicrosBig),
    type: 'referral_commission',
    sourceType: 'referral_commission',
    sourceId: order.id,
    description: 'Referral commission from completed trade'
  });
  if (result.entry && !result.idempotent) {
    referral.commissionLedgerIds = Array.isArray(referral.commissionLedgerIds) ? referral.commissionLedgerIds : [];
    if (!referral.commissionLedgerIds.includes(result.entry.id)) referral.commissionLedgerIds.push(result.entry.id);
    createDigiNotification({ userId: inviter.id, type: 'referral', title: 'Referral commission earned', message: `You earned ${formatUsdtMicros(result.entry.amountMicros)} USDT from a completed trade by a referred user.`, entityType: 'referral', entityId: referral.id, sourceKey: `referral-commission:${order.id}` });
    appendDigiAudit({ actorType: 'system', actorId: 'digirupee', action: 'referral.commission_credited', entityType: 'sell-order', entityId: order.id, details: { referralId: referral.id, referrerUserId: inviter.id, commissionUsdt: formatUsdtMicros(result.entry.amountMicros), commissionBps } });
  }
  return !!result.entry;
}

async function digirupeeApi(req, res, path) {
  if (req.method === 'GET' && path === '/referral-install/claim') {
    const now = Date.now();
    const key = digiSessionIpHash(req);
    db.digirupee.pendingReferralInstalls = (Array.isArray(db.digirupee.pendingReferralInstalls) ? db.digirupee.pendingReferralInstalls : [])
      .filter(item => Number(item.expiresAt || 0) > now && !item.claimedAt);
    const pending = db.digirupee.pendingReferralInstalls
      .filter(item => item.key === key)
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))[0] || null;
    if (pending) {
      pending.claimedAt = now;
      await persist();
    }
    return send(res, 200, { referralCode: pending?.referralCode || null, expiresAt: pending?.expiresAt || null });
  }

  if (req.method === 'GET' && path === '/admin/overview') {
    const admin = adminAuth(req);
    const expired = expireDigiOrders();
    if (expired) await persist();
    return send(res, 200, { admin: { email: admin.email, role: admin.role }, metrics: digiOverviewMetrics(), config: publicDigiConfig() });
  }

  if (req.method === 'GET' && path === '/admin/users') {
    const admin = adminAuth(req);
    return send(res, 200, { admin: { email: admin.email, role: admin.role }, users: db.digirupee.users.map(digiUserAdminSummary).sort((a, b) => Number(b.joinedAt) - Number(a.joinedAt)) });
  }

  if (req.method === 'GET' && /^\/admin\/users\/[A-Za-z0-9_-]+$/.test(path)) {
    const admin = adminAuth(req);
    const id = path.split('/').pop();
    const user = db.digirupee.users.find(item => item.id === id);
    if (!user) return send(res, 404, { error: 'User not found' });
    return send(res, 200, { admin: { email: admin.email, role: admin.role }, user: digiAdminUserDetail(user) });
  }

  if (req.method === 'PATCH' && /^\/admin\/users\/[A-Za-z0-9_-]+\/status$/.test(path)) {
    const admin = adminAuth(req);
    requireAdminRole(admin, ['owner', 'ops']);
    const id = path.split('/').at(-2);
    const user = db.digirupee.users.find(item => item.id === id);
    if (!user) return send(res, 404, { error: 'User not found' });
    const b = await body(req);
    const status = String(b.status || '').trim().toLowerCase();
    const reason = String(b.reason || '').trim();
    if (!['active', 'suspended'].includes(status)) return send(res, 400, { error: 'User status must be active or suspended' });
    if (reason.length < 3 || reason.length > 500) return send(res, 400, { error: 'A reason between 3 and 500 characters is required' });
    if (user.status === status) return send(res, 200, { user: digiUserAdminSummary(user), idempotent: true });
    user.status = status;
    const revokedSessions = status === 'suspended' ? revokeOtherDigiSessions(user.id) : 0;
    appendDigiAudit({ actorType: 'admin', actorId: admin.email, action: `user.${status}`, entityType: 'user', entityId: user.id, details: { status, reason, revokedSessions } });
    await persist();
    return send(res, 200, { user: digiUserAdminSummary(user) });
  }

  if (req.method === 'POST' && /^\/admin\/users\/[A-Za-z0-9_-]+\/revoke-sessions$/.test(path)) {
    const admin = adminAuth(req); requireAdminRole(admin, ['owner', 'ops']); const userId = path.split('/').at(-2); const user = db.digirupee.users.find(item => item.id === userId); if (!user) return send(res, 404, { error: 'User not found' }); const b = await body(req); const reason = String(b.reason || '').trim(); if (reason.length < 3 || reason.length > 300) return send(res, 400, { error: 'A reason between 3 and 300 characters is required' }); const count = revokeOtherDigiSessions(user.id); appendDigiAudit({ actorType: 'admin', actorId: admin.email, action: 'security.sessions_revoked', entityType: 'user', entityId: user.id, details: { count, reason } }); await persist(); return send(res, 200, { revoked: count, security: digiSecuritySummary(user) });
  }

  if (req.method === 'GET' && path === '/admin/support') {
    const admin = adminAuth(req); const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`); const status = url.searchParams.get('status'); if (status && !digiTicketStatuses.has(status)) return send(res, 400, { error: 'Unsupported ticket status' });
    return send(res, 200, { admin: { email: admin.email, role: admin.role }, tickets: db.digirupee.supportTickets.filter(ticket => !status || ticket.status === status).sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt)).slice(0, 500).map(ticket => publicDigiTicket(ticket, true)) });
  }

  if (req.method === 'GET' && /^\/admin\/support\/[A-Za-z0-9_-]+$/.test(path)) {
    const admin = adminAuth(req); const ticket = db.digirupee.supportTickets.find(item => item.id === path.split('/').pop()); if (!ticket) return send(res, 404, { error: 'Support ticket not found' }); return send(res, 200, { admin: { email: admin.email, role: admin.role }, ticket: publicDigiTicket(ticket, true) });
  }

  if (req.method === 'POST' && /^\/admin\/support\/[A-Za-z0-9_-]+\/messages$/.test(path)) {
    const admin = adminAuth(req); requireAdminRole(admin, ['owner', 'ops', 'support']); const ticket = db.digirupee.supportTickets.find(item => item.id === path.split('/').at(-2)); if (!ticket) return send(res, 404, { error: 'Support ticket not found' }); if (ticket.status === 'Closed') return send(res, 409, { error: 'Closed tickets cannot receive new messages' }); const b = await body(req); const text = String(b.message || b.text || '').trim(); if (text.length < 2 || text.length > 4000) return send(res, 400, { error: 'Message length is invalid' }); const now = Date.now(); const previousStatus = ticket.status; ticket.messages.push({ id: `dsm_${randomUUID().replace(/-/g, '').slice(0, 12)}`, senderType: 'admin', senderId: admin.email, text, createdAt: now }); ticket.updatedAt = now; if (ticket.status === 'Open') ticket.status = 'In Progress'; createDigiNotification({ userId: ticket.userId, type: 'support', title: 'Support replied', message: `Your support ticket ${ticket.id} received a reply.`, entityType: 'support-ticket', entityId: ticket.id, sourceKey: `support:${ticket.id}:reply:${ticket.messages.at(-1).id}` }); appendDigiAudit({ actorType: 'admin', actorId: admin.email, action: 'support.admin_replied', entityType: 'support-ticket', entityId: ticket.id, details: {} }); if (previousStatus !== ticket.status) appendDigiAudit({ actorType: 'admin', actorId: admin.email, action: 'support.status_changed', entityType: 'support-ticket', entityId: ticket.id, details: { from: previousStatus, status: ticket.status, source: 'admin_reply' } }); await persist(); return send(res, 200, { ticket: publicDigiTicket(ticket, true) });
  }

  if (req.method === 'PATCH' && /^\/admin\/support\/[A-Za-z0-9_-]+\/status$/.test(path)) {
    const admin = adminAuth(req); requireAdminRole(admin, ['owner', 'ops', 'support']); const ticket = db.digirupee.supportTickets.find(item => item.id === path.split('/').at(-2)); if (!ticket) return send(res, 404, { error: 'Support ticket not found' }); const b = await body(req); const status = String(b.status || '').trim(); if (!digiTicketStatuses.has(status)) return send(res, 400, { error: 'Unsupported ticket status' }); if (ticket.status === status) return send(res, 200, { ticket: publicDigiTicket(ticket, true), idempotent: true }); const now = Date.now(); ticket.status = status; ticket.updatedAt = now; ticket.closedAt = status === 'Closed' ? now : null; createDigiNotification({ userId: ticket.userId, type: 'support', title: 'Support ticket updated', message: `${ticket.id} is now ${status}.`, entityType: 'support-ticket', entityId: ticket.id, sourceKey: `support:${ticket.id}:status:${status}` }); appendDigiAudit({ actorType: 'admin', actorId: admin.email, action: 'support.status_changed', entityType: 'support-ticket', entityId: ticket.id, details: { status } }); await persist(); return send(res, 200, { ticket: publicDigiTicket(ticket, true) });
  }

  if (req.method === 'GET' && /^\/admin\/tron-addresses\/[A-Za-z0-9_-]+\/history$/.test(path)) {
    const admin = adminAuth(req);
    const id = path.split('/').at(-2);
    const address = db.digirupee.tronAddresses.find(item => item.id === id);
    if (!address) return send(res, 404, { error: 'TRON address not found' });
    return send(res, 200, { admin: { email: admin.email, role: admin.role }, addressId: id, history: digiAddressHistory(id) });
  }

  if (req.method === 'GET' && path === '/admin/system-status') {
    const admin = adminAuth(req);
    const activeMonitoredOrders = monitorableDigiOrders().length;
    return send(res, 200, {
      admin: { email: admin.email, role: admin.role },
      backend: 'online',
      tron: {
        verifyMode: tronVerifyMode,
        network: tronNetwork,
        requiredConfirmations: tronRequiredConfirmations,
        pollIntervalMs: tronPollIntervalMs,
        lateDepositGraceMs: tronLateDepositGraceMs,
        addressReuseCooldownMs: tronAddressReuseCooldownMs,
        expiredAddressReuseMs: tronExpiredAddressReuseMs,
        apiKeyConfigured: !!tronApiKey
      },
      monitor: {
        status: digiMonitorTimer || digiMonitorRunning ? 'running' : 'stopped',
        lastCycleAt: digiMonitorState.lastCycleAt,
        lastSuccessfulProviderCheckAt: digiMonitorState.lastSuccessfulProviderCheckAt,
        lastProviderErrorAt: digiMonitorState.lastProviderErrorAt,
        lastError: digiMonitorState.lastError,
        activeMonitoredOrders
      },
      pendingPayouts: db.digirupee.orders.filter(order => ['USDT Confirmed', 'INR Processing'].includes(order.status)).length,
      pendingReviews: db.digirupee.orders.filter(order => order.status === 'Late Review').length,
      openSupportTickets: db.digirupee.supportTickets.filter(ticket => ['Open', 'In Progress'].includes(ticket.status)).length,
      activeDigiSessions: db.digirupee.sessions.filter(session => !session.revokedAt && Number(session.expiresAt) > Date.now()).length
    });
  }

  if (req.method === 'GET' && path === '/reward-page') {
    digirupeeAuth(req);
    return send(res, 200, { config: structuredClone(db.digirupee.config.rewardPage) });
  }

  if (req.method === 'GET' && path === '/rewards') {
    const { user } = digirupeeAuth(req);
    const entries = db.digirupee.rewardLedger.filter(entry => entry.userId === user.id).sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
    const earned = entries.filter(entry => entry.status === 'posted' && entry.direction === 'credit').reduce((sum, entry) => sum + Number(entry.amountMicros || 0), 0);
    return send(res, 200, { balance: formatUsdtMicros(rewardBalanceMicros(user.id)), lifetimeEarned: formatUsdtMicros(earned), recent: entries.slice(0, 10).map(rewardLedgerPublic) });
  }

  if (req.method === 'GET' && path === '/rewards/ledger') {
    const { user } = digirupeeAuth(req);
    const entries = db.digirupee.rewardLedger.filter(entry => entry.userId === user.id).sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
    return send(res, 200, { balance: formatUsdtMicros(rewardBalanceMicros(user.id)), ledger: entries.map(rewardLedgerPublic) });
  }

  if (req.method === 'GET' && path === '/campaigns') {
    const { user } = digirupeeAuth(req);
    return send(res, 200, { campaigns: db.digirupee.campaigns.filter(campaign => campaignVisibleToUser(campaign)).map(campaign => publicDigiCampaign(campaign, user.id)) });
  }

  if (req.method === 'GET' && /^\/campaigns\/[A-Za-z0-9_-]+$/.test(path)) {
    const { user } = digirupeeAuth(req);
    const id = path.split('/').pop();
    const campaign = db.digirupee.campaigns.find(item => item.id === id && campaignIsCurrent(item));
    if (!campaign) return send(res, 404, { error: 'Campaign not found' });
    return send(res, 200, { campaign: publicDigiCampaign(campaign, user.id) });
  }

  if (req.method === 'POST' && /^\/campaigns\/[A-Za-z0-9_-]+\/claim$/.test(path)) {
    const { user } = digirupeeAuth(req);
    const campaignId = path.split('/').at(-2);
    const campaign = db.digirupee.campaigns.find(item => item.id === campaignId);
    if (!campaign || !campaignIsCurrent(campaign)) return send(res, 404, { error: 'Campaign is not currently available' });
    const b = await body(req);
    const taskId = String(b.taskId || '').trim();
    const task = (campaign.tasks || []).find(item => item.id === taskId);
    if (!task || !taskIsCurrent(task)) return send(res, 400, { error: 'Task is not currently available' });
    const claimKey = String(req.headers['idempotency-key'] || '').trim();
    const replay = claimKey ? db.digirupee.taskClaims.find(claim => claim.userId === user.id && claim.taskId === task.id && claim.idempotencyKey === claimKey) : null;
    if (replay) return send(res, 200, { claim: { id: replay.id, status: replay.status }, idempotent: true });
    if (campaign.maxClaims && campaignClaimCount(campaign.id) >= Number(campaign.maxClaims)) return send(res, 409, { error: 'Campaign claim limit has been reached' });
    const priorUserClaims = db.digirupee.taskClaims.filter(claim => claim.userId === user.id && claim.taskId === task.id && claim.status !== 'rejected').length;
    if (task.maxClaimsPerUser && priorUserClaims >= Number(task.maxClaimsPerUser)) return send(res, 409, { error: 'You have reached the claim limit for this task' });
    const now = Date.now();
    const claim = { id: `dtc_${randomUUID().replace(/-/g, '').slice(0, 12)}`, campaignId, taskId, userId: user.id, submittedAt: now, note: String(b.note || '').trim().slice(0, 500), status: 'pending_review', reviewedBy: null, reviewedAt: null, adminNote: null, rewardLedgerId: null, idempotencyKey: String(req.headers['idempotency-key'] || '').trim() || null };
    if (task.claimType === 'AUTO') {
      const evaluation = evaluateDigiTask({ ...task, campaignType: campaign.type }, user.id);
      if (!evaluation.eligible) return send(res, 409, { error: evaluation.reason || 'Task requirements are not met', progress: evaluation.progress, target: evaluation.target });
      const reward = issueDigiReward({ userId: user.id, amountMicros: task.rewardAmountMicros, type: 'task', sourceType: 'task', sourceId: claim.id, description: task.title });
      if (reward.error) return send(res, 400, { error: reward.error });
      claim.status = 'credited';
      claim.rewardLedgerId = reward.entry.id;
      appendDigiAudit({ actorType: 'user', actorId: user.id, action: 'task.claimed', entityType: 'task-claim', entityId: claim.id, details: { campaignId, taskId, status: claim.status } });
    } else {
      claim.status = 'pending_review';
      appendDigiAudit({ actorType: 'user', actorId: user.id, action: 'task.claimed', entityType: 'task-claim', entityId: claim.id, details: { campaignId, taskId, status: claim.status } });
    }
    db.digirupee.taskClaims.push(claim);
    await persist();
    return send(res, 201, { claim: { id: claim.id, status: claim.status, submittedAt: claim.submittedAt, reward: claim.rewardLedgerId ? formatUsdtMicros(task.rewardAmountMicros) : '0' } });
  }

  if (req.method === 'GET' && path === '/wheel') {
    const { user } = digirupeeAuth(req);
    const today = indiaDayKey();
    const claimsToday = db.digirupee.wheelClaims.filter(claim => claim.userId === user.id && claim.dayKey === today);
    const canSpin = !!db.digirupee.wheelConfig.enabled && claimsToday.length < Number(db.digirupee.wheelConfig.dailyClaimLimit || 1) && db.digirupee.wheelConfig.segments.some(segment => segment.enabled && Number(segment.probabilityWeight) > 0);
    const previous = claimsToday.at(-1);
    const nextEligibleAt = nextIndiaMidnight();
    return send(res, 200, { enabled: !!db.digirupee.wheelConfig.enabled, segments: db.digirupee.wheelConfig.segments.filter(segment => segment.enabled).map(segment => ({ id: segment.id, label: segment.label, rewardAmount: formatUsdtMicros(segment.rewardAmountMicros) })), canSpin, nextEligibleAt: canSpin ? null : nextEligibleAt, previousResult: previous ? { segmentId: previous.segmentId, label: previous.label, rewardAmount: formatUsdtMicros(previous.rewardAmountMicros), createdAt: previous.createdAt } : null });
  }

  if (req.method === 'POST' && path === '/wheel/spin') {
    const { user } = digirupeeAuth(req);
    const key = String(req.headers['idempotency-key'] || '').trim();
    if (!/^[A-Za-z0-9_-]{16,100}$/.test(key)) return send(res, 400, { error: 'A valid Idempotency-Key header is required' });
    const replay = db.digirupee.wheelClaims.find(claim => claim.userId === user.id && claim.idempotencyKey === key);
    if (replay) return send(res, 200, { result: { segmentId: replay.segmentId, label: replay.label, rewardAmount: formatUsdtMicros(replay.rewardAmountMicros), createdAt: replay.createdAt }, idempotent: true });
    const config = db.digirupee.wheelConfig;
    const today = indiaDayKey();
    if (!config.enabled) return send(res, 409, { error: 'Daily wheel is currently disabled' });
    if (db.digirupee.wheelClaims.filter(claim => claim.userId === user.id && claim.dayKey === today).length >= Number(config.dailyClaimLimit || 1)) return send(res, 409, { error: 'Your daily wheel claim has already been used' });
    const segments = config.segments.filter(segment => segment.enabled && Number(segment.probabilityWeight) > 0);
    const totalWeight = segments.reduce((sum, segment) => sum + Number(segment.probabilityWeight), 0);
    if (!segments.length || !Number.isSafeInteger(totalWeight) || totalWeight <= 0) return send(res, 409, { error: 'Daily wheel has no enabled reward segments' });
    const forcedIndex = !production && Number.isInteger(Number(process.env.DIGIRUPEE_TEST_WHEEL_INDEX)) ? Number(process.env.DIGIRUPEE_TEST_WHEEL_INDEX) : null;
    const draw = forcedIndex === null ? randomInt(totalWeight) : Math.max(0, Math.min(totalWeight - 1, forcedIndex));
    let cursor = 0;
    const segment = segments.find(item => (cursor += Number(item.probabilityWeight)) > draw) || segments.at(-1);
    const now = Date.now();
    const claim = { id: `dwc_${randomUUID().replace(/-/g, '').slice(0, 12)}`, userId: user.id, dayKey: today, segmentId: segment.id, label: segment.label, rewardAmountMicros: segment.rewardAmountMicros, createdAt: now, idempotencyKey: key };
    db.digirupee.wheelClaims.push(claim);
    if (Number(segment.rewardAmountMicros) > 0) issueDigiReward({ userId: user.id, amountMicros: segment.rewardAmountMicros, type: 'wheel', sourceType: 'wheel', sourceId: claim.id, description: `Daily wheel: ${segment.label}` });
    appendDigiAudit({ actorType: 'user', actorId: user.id, action: 'wheel.spinned', entityType: 'wheel-claim', entityId: claim.id, details: { segmentId: segment.id, dayKey: today } });
    appendDigiAudit({ actorType: 'user', actorId: user.id, action: 'wheel.claimed', entityType: 'wheel-claim', entityId: claim.id, details: { rewardAmount: formatUsdtMicros(segment.rewardAmountMicros) } });
    await persist();
    return send(res, 201, { result: { segmentId: segment.id, label: segment.label, rewardAmount: formatUsdtMicros(segment.rewardAmountMicros), createdAt: now } });
  }

  if (req.method === 'GET' && /^\/referrals\/[A-Za-z0-9_-]+\/trades$/.test(path)) {
    const { user } = digirupeeAuth(req);
    const referralId = path.split('/')[2];
    const referral = db.digirupee.referrals.find(item => item.id === referralId && item.referrerUserId === user.id);
    if (!referral) return send(res, 404, { error: 'Referral not found' });
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const requestedLimit = Number(url.searchParams.get('limit') || 50);
    const limit = Number.isInteger(requestedLimit) ? Math.max(1, Math.min(100, requestedLimit)) : 50;
    const trades = db.digirupee.orders
      .filter(order => order.userId === referral.referredUserId)
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
      .slice(0, limit)
      .map(order => referralTradeSummary(order, user.id));
    return send(res, 200, { referralId, trades, limit });
  }

  if (req.method === 'GET' && path === '/referrals') {
    const { user } = digirupeeAuth(req);
    const own = db.digirupee.referrals.filter(referral => referral.referrerUserId === user.id);
    const code = user.referralCode || null;
    const webUrl = code ? `${digiReferralOrigin()}/?ref=${encodeURIComponent(code)}` : null;
    const stats = own.reduce((summary, referral) => {
      const current = referralStats(referral);
      summary.completedTradeCount += current.completedTradeCount;
      summary.completedVolumeUsdtMicros += Number(parseUsdtMicros(current.completedVolumeUsdt) || 0);
      summary.commissionEarnedUsdtMicros += Number(parseUsdtMicros(current.commissionEarnedUsdt) || 0);
      return summary;
    }, { completedTradeCount: 0, completedVolumeUsdtMicros: 0, commissionEarnedUsdtMicros: 0 });
    return send(res, 200, {
      referralCode: code,
      shareText: code ? `Join me on eMoney and start using USDT to INR transfers. Referral code: ${code}
${webUrl}` : null,
      webUrl,
      downloadUrl: webUrl,
      invitedCount: own.length,
      qualifiedCount: own.filter(item => ['qualified', 'rewarded'].includes(item.status)).length,
      completedTradeCount: stats.completedTradeCount,
      completedVolumeUsdt: formatUsdtMicros(stats.completedVolumeUsdtMicros),
      commissionEarnedUsdt: formatUsdtMicros(stats.commissionEarnedUsdtMicros),
      rewardEarned: formatUsdtMicros(own.reduce((sum, referral) => sum + Number(db.digirupee.rewardLedger.find(entry => entry.id === referral.inviterRewardLedgerId)?.amountMicros || 0), 0) + stats.commissionEarnedUsdtMicros),
      referrals: own.map(referral => referralPublic(referral))
    });
  }

  if (req.method === 'GET' && path === '/admin/rewards') {
    const admin = adminAuth(req);
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const entries = db.digirupee.rewardLedger.filter(entry => (!url.searchParams.get('userId') || entry.userId === url.searchParams.get('userId')) && (!url.searchParams.get('type') || entry.type === url.searchParams.get('type'))).sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
    return send(res, 200, { admin: { email: admin.email, role: admin.role }, metrics: digiRewardMetrics(), ledger: entries.slice(0, 500).map(rewardLedgerAdmin) });
  }

  if (req.method === 'GET' && path === '/admin/notifications') {
    const admin = adminAuth(req); const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`); const type = url.searchParams.get('type'); const notifications = db.digirupee.notifications.filter(item => !type || item.type === type).sort((a, b) => Number(b.createdAt) - Number(a.createdAt)).slice(0, 500).map(item => { const user = db.digirupee.users.find(candidate => candidate.id === item.userId); return { ...publicDigiNotification(item), user: user ? { id: user.id, name: user.profile?.fullName || '', email: user.email } : { id: item.userId } }; }); return send(res, 200, { admin: { email: admin.email, role: admin.role }, notifications });
  }

  if (req.method === 'POST' && path === '/admin/notifications/broadcast') {
    const admin = adminAuth(req); requireAdminRole(admin, ['owner', 'ops']); const b = await body(req); const title = String(b.title || '').trim(); const message = String(b.message || '').trim(); const target = String(b.target || '').trim().toLowerCase(); if (title.length < 3 || title.length > 120 || message.length < 3 || message.length > 500 || !['all', 'active'].includes(target)) return send(res, 400, { error: 'Broadcast fields are invalid' }); const users = db.digirupee.users.filter(user => target === 'all' || user.status === 'active'); const broadcastId = `broadcast:${randomUUID()}`; let created = 0; for (const user of users) if (createDigiNotification({ userId: user.id, type: 'system', title, message, entityType: 'broadcast', entityId: broadcastId, sourceKey: `${broadcastId}:${user.id}` })) created += 1; appendDigiAudit({ actorType: 'admin', actorId: admin.email, action: 'notification.broadcast', entityType: 'notification', entityId: broadcastId, details: { target, recipientCount: created } }); await persist(); return send(res, 201, { broadcastId, recipientCount: created });
  }

  if (req.method === 'POST' && /^\/admin\/users\/[A-Za-z0-9_-]+\/rewards\/adjust$/.test(path)) {
    const admin = adminAuth(req);
    requireAdminRole(admin, ['owner', 'ops']);
    const userId = path.split('/').at(-3);
    const user = db.digirupee.users.find(item => item.id === userId);
    if (!user) return send(res, 404, { error: 'User not found' });
    const key = String(req.headers['idempotency-key'] || '').trim();
    if (!/^[A-Za-z0-9_-]{16,100}$/.test(key)) return send(res, 400, { error: 'A valid Idempotency-Key header is required' });
    const b = await body(req);
    const amount = parseUsdtMicros(b.amount);
    const direction = String(b.direction || '').trim().toLowerCase();
    const reason = String(b.reason || '').trim();
    if (!amount || amount <= 0 || amount > 1_000_000_000_000) return send(res, 400, { error: 'Enter a valid reward amount' });
    if (!['credit', 'debit'].includes(direction)) return send(res, 400, { error: 'direction must be credit or debit' });
    if (reason.length < 3 || reason.length > 300) return send(res, 400, { error: 'A reason between 3 and 300 characters is required' });
    const prior = db.digirupee.rewardLedger.find(entry => entry.idempotencyKey === key);
    if (prior) {
      if (prior.userId !== userId || prior.amountMicros !== amount || prior.direction !== direction || prior.description !== reason) return send(res, 409, { error: 'Idempotency key was already used for a different adjustment' });
      return send(res, 200, { reward: rewardLedgerAdmin(prior), balance: formatUsdtMicros(rewardBalanceMicros(userId)), idempotent: true });
    }
    if (direction === 'debit' && rewardBalanceMicros(userId) < amount) return send(res, 409, { error: 'Reward balance cannot become negative' });
    const now = Date.now();
    const entry = { id: `drl_${randomUUID().replace(/-/g, '').slice(0, 12)}`, userId, type: 'admin_adjustment', amountMicros: amount, direction, sourceType: 'admin_adjustment', sourceId: key, description: reason, createdAt: now, status: 'posted', idempotencyKey: key, adminId: admin.email };
    db.digirupee.rewardLedger.push(entry);
    db.digirupee.rewards.push({ id: `drw_${randomUUID().replace(/-/g, '').slice(0, 12)}`, userId, ledgerId: entry.id, sourceType: 'admin_adjustment', sourceId: key, amountMicros: amount, direction, status: 'posted', createdAt: now });
    createDigiNotification({ userId, type: 'reward', title: direction === 'credit' ? 'Reward credited' : 'Reward balance adjusted', message: `${direction === 'credit' ? '+' : '-'}${formatUsdtMicros(amount)} USDT reward adjustment posted.`, entityType: 'reward', entityId: entry.id, sourceKey: `reward:${entry.id}` });
    appendDigiAudit({ actorType: 'admin', actorId: admin.email, action: 'reward.adjusted', entityType: 'reward', entityId: entry.id, details: { userId, amount: formatUsdtMicros(amount), direction, reason } });
    await persist();
    return send(res, 201, { reward: rewardLedgerAdmin(entry), balance: formatUsdtMicros(rewardBalanceMicros(userId)) });
  }

  if (req.method === 'GET' && path === '/admin/campaigns') {
    const admin = adminAuth(req);
    return send(res, 200, { admin: { email: admin.email, role: admin.role }, campaigns: db.digirupee.campaigns.map(adminDigiCampaign).sort((a, b) => Number(b.createdAt) - Number(a.createdAt)) });
  }

  if (req.method === 'POST' && path === '/admin/campaigns') {
    const admin = adminAuth(req);
    requireAdminRole(admin, ['owner', 'ops']);
    const b = await body(req);
    const title = String(b.title || '').trim();
    const description = String(b.description || '').trim();
    const type = String(b.type || '').trim().toUpperCase();
    const rewardAmountMicros = parseUsdtMicros(b.rewardAmount || b.rewardAmountUsdt || '0');
    const startsAt = parseDigiDate(b.startsAt, Date.now());
    const endsAt = parseDigiDate(b.endsAt, null);
    const maxClaims = b.maxClaims === undefined || b.maxClaims === null || b.maxClaims === '' ? null : Number(b.maxClaims);
    if (title.length < 2 || title.length > 120 || description.length > 500 || !digiCampaignTypes.has(type) || rewardAmountMicros === null || rewardAmountMicros < 0 || startsAt === null || (endsAt !== null && endsAt < startsAt) || (maxClaims !== null && (!Number.isInteger(maxClaims) || maxClaims < 0))) return send(res, 400, { error: 'Campaign fields are invalid' });
    const now = Date.now();
    const campaign = { id: `dca_${randomUUID().replace(/-/g, '').slice(0, 12)}`, title, description, type, rewardAmountMicros, startsAt, endsAt, enabled: b.enabled === undefined ? true : b.enabled === true, eligibility: b.eligibility && typeof b.eligibility === 'object' ? b.eligibility : {}, maxClaims, createdAt: now, updatedAt: now, tasks: [] };
    db.digirupee.campaigns.push(campaign);
    appendDigiAudit({ actorType: 'admin', actorId: admin.email, action: 'campaign.created', entityType: 'campaign', entityId: campaign.id, details: { title, type, rewardAmount: formatUsdtMicros(rewardAmountMicros) } });
    await persist();
    return send(res, 201, { campaign: adminDigiCampaign(campaign) });
  }

  if (req.method === 'PATCH' && /^\/admin\/campaigns\/[A-Za-z0-9_-]+$/.test(path)) {
    const admin = adminAuth(req);
    requireAdminRole(admin, ['owner', 'ops']);
    const campaign = db.digirupee.campaigns.find(item => item.id === path.split('/').pop());
    if (!campaign) return send(res, 404, { error: 'Campaign not found' });
    const b = await body(req);
    const next = { ...campaign };
    if (b.title !== undefined) next.title = String(b.title || '').trim();
    if (b.description !== undefined) next.description = String(b.description || '').trim();
    if (b.type !== undefined) next.type = String(b.type || '').trim().toUpperCase();
    if (b.rewardAmount !== undefined || b.rewardAmountUsdt !== undefined) next.rewardAmountMicros = parseUsdtMicros(b.rewardAmount ?? b.rewardAmountUsdt);
    if (b.startsAt !== undefined) next.startsAt = parseDigiDate(b.startsAt);
    if (b.endsAt !== undefined) next.endsAt = parseDigiDate(b.endsAt, null);
    if (b.eligibility !== undefined) next.eligibility = b.eligibility && typeof b.eligibility === 'object' ? b.eligibility : {};
    if (b.maxClaims !== undefined) next.maxClaims = b.maxClaims === null || b.maxClaims === '' ? null : Number(b.maxClaims);
    if (typeof b.enabled === 'boolean') next.enabled = b.enabled;
    if (next.title.length < 2 || next.title.length > 120 || next.description.length > 500 || !digiCampaignTypes.has(next.type) || !Number.isSafeInteger(next.rewardAmountMicros) || next.rewardAmountMicros < 0 || !Number.isFinite(next.startsAt) || (next.endsAt !== null && (!Number.isFinite(next.endsAt) || next.endsAt < next.startsAt)) || (next.maxClaims !== null && (!Number.isInteger(next.maxClaims) || next.maxClaims < 0))) return send(res, 400, { error: 'Campaign fields are invalid' });
    Object.assign(campaign, next, { updatedAt: Date.now() });
    appendDigiAudit({ actorType: 'admin', actorId: admin.email, action: campaign.enabled ? 'campaign.updated' : 'campaign.disabled', entityType: 'campaign', entityId: campaign.id, details: { title: campaign.title } });
    await persist();
    return send(res, 200, { campaign: adminDigiCampaign(campaign) });
  }

  if (req.method === 'PATCH' && /^\/admin\/campaigns\/[A-Za-z0-9_-]+\/status$/.test(path)) {
    const admin = adminAuth(req);
    requireAdminRole(admin, ['owner', 'ops']);
    const campaign = db.digirupee.campaigns.find(item => item.id === path.split('/').at(-2));
    if (!campaign) return send(res, 404, { error: 'Campaign not found' });
    const b = await body(req);
    if (typeof b.enabled !== 'boolean') return send(res, 400, { error: 'enabled must be boolean' });
    campaign.enabled = b.enabled; campaign.updatedAt = Date.now();
    appendDigiAudit({ actorType: 'admin', actorId: admin.email, action: b.enabled ? 'campaign.updated' : 'campaign.disabled', entityType: 'campaign', entityId: campaign.id, details: { enabled: b.enabled } });
    await persist();
    return send(res, 200, { campaign: adminDigiCampaign(campaign) });
  }

  if (req.method === 'DELETE' && /^\/admin\/campaigns\/[A-Za-z0-9_-]+$/.test(path)) {
    const admin = adminAuth(req);
    requireAdminRole(admin, ['owner']);
    const campaign = db.digirupee.campaigns.find(item => item.id === path.split('/').pop());
    if (!campaign) return send(res, 404, { error: 'Campaign not found' });
    if (db.digirupee.taskClaims.some(claim => claim.campaignId === campaign.id)) return send(res, 409, { error: 'Campaign has historical claims; disable it instead' });
    db.digirupee.campaigns = db.digirupee.campaigns.filter(item => item.id !== campaign.id);
    appendDigiAudit({ actorType: 'admin', actorId: admin.email, action: 'campaign.disabled', entityType: 'campaign', entityId: campaign.id, details: { deleted: true } });
    await persist();
    return send(res, 200, { ok: true });
  }

  if (req.method === 'POST' && /^\/admin\/campaigns\/[A-Za-z0-9_-]+\/tasks$/.test(path)) {
    const admin = adminAuth(req);
    requireAdminRole(admin, ['owner', 'ops']);
    const campaign = db.digirupee.campaigns.find(item => item.id === path.split('/').at(-2));
    if (!campaign) return send(res, 404, { error: 'Campaign not found' });
    const b = await body(req);
    const task = { id: `dta_${randomUUID().replace(/-/g, '').slice(0, 12)}`, campaignId: campaign.id, title: String(b.title || '').trim(), description: String(b.description || '').trim(), rewardAmountMicros: parseUsdtMicros(b.rewardAmount || b.rewardAmountUsdt || '0'), enabled: b.enabled === undefined ? true : b.enabled === true, claimType: String(b.claimType || 'AUTO').trim().toUpperCase(), requirements: b.requirements && typeof b.requirements === 'object' ? b.requirements : {}, startsAt: parseDigiDate(b.startsAt, campaign.startsAt), endsAt: parseDigiDate(b.endsAt, campaign.endsAt), maxClaimsPerUser: b.maxClaimsPerUser === undefined || b.maxClaimsPerUser === '' ? 1 : Number(b.maxClaimsPerUser) };
    if (task.title.length < 2 || task.title.length > 120 || task.description.length > 500 || task.rewardAmountMicros === null || task.rewardAmountMicros < 0 || !digiClaimTypes.has(task.claimType) || task.startsAt === null || (task.endsAt !== null && task.endsAt < task.startsAt) || !Number.isInteger(task.maxClaimsPerUser) || task.maxClaimsPerUser < 1) return send(res, 400, { error: 'Task fields are invalid' });
    if (task.claimType === 'AUTO' && campaign.type !== 'TRADE') return send(res, 400, { error: 'AUTO tasks are supported only for TRADE campaigns; use MANUAL for other campaign types' });
    campaign.tasks = campaign.tasks || []; campaign.tasks.push(task); campaign.updatedAt = Date.now();
    appendDigiAudit({ actorType: 'admin', actorId: admin.email, action: 'campaign.updated', entityType: 'task', entityId: task.id, details: { campaignId: campaign.id, title: task.title } });
    await persist();
    return send(res, 201, { task: { ...task, rewardAmount: formatUsdtMicros(task.rewardAmountMicros) } });
  }

  if (req.method === 'PATCH' && /^\/admin\/campaigns\/[A-Za-z0-9_-]+\/tasks\/[A-Za-z0-9_-]+$/.test(path)) {
    const admin = adminAuth(req); requireAdminRole(admin, ['owner', 'ops']);
    const parts = path.split('/'); const campaign = db.digirupee.campaigns.find(item => item.id === parts[3]); const task = campaign?.tasks?.find(item => item.id === parts[5]);
    if (!task) return send(res, 404, { error: 'Task not found' });
    const b = await body(req);
    if (b.title !== undefined) task.title = String(b.title || '').trim();
    if (b.description !== undefined) task.description = String(b.description || '').trim();
    if (b.rewardAmount !== undefined || b.rewardAmountUsdt !== undefined) task.rewardAmountMicros = parseUsdtMicros(b.rewardAmount ?? b.rewardAmountUsdt);
    if (typeof b.enabled === 'boolean') task.enabled = b.enabled;
    if (b.claimType !== undefined) task.claimType = String(b.claimType || '').trim().toUpperCase();
    if (b.requirements !== undefined) task.requirements = b.requirements && typeof b.requirements === 'object' ? b.requirements : {};
    if (task.title.length < 2 || task.title.length > 120 || task.description.length > 500 || !Number.isSafeInteger(task.rewardAmountMicros) || task.rewardAmountMicros < 0 || !digiClaimTypes.has(task.claimType)) return send(res, 400, { error: 'Task fields are invalid' });
    campaign.updatedAt = Date.now(); appendDigiAudit({ actorType: 'admin', actorId: admin.email, action: 'campaign.updated', entityType: 'task', entityId: task.id, details: { campaignId: campaign.id } }); await persist();
    return send(res, 200, { task: { ...task, rewardAmount: formatUsdtMicros(task.rewardAmountMicros) } });
  }

  if (req.method === 'PATCH' && /^\/admin\/campaigns\/[A-Za-z0-9_-]+\/tasks\/[A-Za-z0-9_-]+\/status$/.test(path)) {
    const admin = adminAuth(req); requireAdminRole(admin, ['owner', 'ops']);
    const parts = path.split('/'); const campaign = db.digirupee.campaigns.find(item => item.id === parts[3]); const task = campaign?.tasks?.find(item => item.id === parts[5]);
    if (!task) return send(res, 404, { error: 'Task not found' }); const b = await body(req); if (typeof b.enabled !== 'boolean') return send(res, 400, { error: 'enabled must be boolean' });
    task.enabled = b.enabled; campaign.updatedAt = Date.now(); appendDigiAudit({ actorType: 'admin', actorId: admin.email, action: b.enabled ? 'campaign.updated' : 'campaign.disabled', entityType: 'task', entityId: task.id, details: { campaignId: campaign.id } }); await persist(); return send(res, 200, { task: { ...task, rewardAmount: formatUsdtMicros(task.rewardAmountMicros) } });
  }

  if (req.method === 'DELETE' && /^\/admin\/campaigns\/[A-Za-z0-9_-]+\/tasks\/[A-Za-z0-9_-]+$/.test(path)) {
    const admin = adminAuth(req); requireAdminRole(admin, ['owner']); const parts = path.split('/'); const campaign = db.digirupee.campaigns.find(item => item.id === parts[3]); const task = campaign?.tasks?.find(item => item.id === parts[5]);
    if (!task) return send(res, 404, { error: 'Task not found' }); if (db.digirupee.taskClaims.some(claim => claim.taskId === task.id)) return send(res, 409, { error: 'Task has historical claims; disable it instead' }); campaign.tasks = campaign.tasks.filter(item => item.id !== task.id); campaign.updatedAt = Date.now(); appendDigiAudit({ actorType: 'admin', actorId: admin.email, action: 'campaign.disabled', entityType: 'task', entityId: task.id, details: { deleted: true } }); await persist(); return send(res, 200, { ok: true });
  }

  if (req.method === 'GET' && path === '/admin/task-claims') {
    const admin = adminAuth(req); const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`); const status = url.searchParams.get('status');
    return send(res, 200, { admin: { email: admin.email, role: admin.role }, claims: db.digirupee.taskClaims.filter(claim => !status || claim.status === status).sort((a, b) => Number(b.submittedAt) - Number(a.submittedAt)).slice(0, 500).map(claim => { const user = db.digirupee.users.find(item => item.id === claim.userId); const campaign = db.digirupee.campaigns.find(item => item.id === claim.campaignId); const task = campaign?.tasks?.find(item => item.id === claim.taskId); return { ...claim, user: user ? { id: user.id, name: user.profile?.fullName || '', email: user.email } : { id: claim.userId }, campaign: campaign ? campaign.title : '', task: task ? task.title : '' }; }) });
  }

  if (req.method === 'POST' && /^\/admin\/task-claims\/[A-Za-z0-9_-]+\/decision$/.test(path)) {
    const admin = adminAuth(req); requireAdminRole(admin, ['owner', 'ops']);
    const claim = db.digirupee.taskClaims.find(item => item.id === path.split('/').at(-2)); if (!claim) return send(res, 404, { error: 'Task claim not found' });
    if (claim.status !== 'pending_review') return send(res, 409, { error: 'This task claim has already been decided' });
    const b = await body(req); const decision = String(b.decision || '').trim().toUpperCase(); const note = String(b.note || '').trim().slice(0, 500);
    if (!['APPROVE', 'REJECT'].includes(decision)) return send(res, 400, { error: 'decision must be APPROVE or REJECT' });
    if (decision === 'REJECT' && note.length < 3) return send(res, 400, { error: 'A rejection reason is required' });
    claim.status = decision === 'APPROVE' ? 'approved' : 'rejected'; claim.reviewedBy = admin.email; claim.reviewedAt = Date.now(); claim.adminNote = note;
    if (decision === 'APPROVE') {
      const campaign = db.digirupee.campaigns.find(item => item.id === claim.campaignId); const task = campaign?.tasks?.find(item => item.id === claim.taskId);
      if (!task) return send(res, 409, { error: 'The claimed task no longer exists' });
      const reward = issueDigiReward({ userId: claim.userId, amountMicros: task.rewardAmountMicros, type: 'task', sourceType: 'task', sourceId: claim.id, description: task.title });
      if (reward.error) return send(res, 400, { error: reward.error }); claim.rewardLedgerId = reward.entry.id; claim.status = 'credited';
      createDigiNotification({ userId: claim.userId, type: 'campaign', title: 'Task claim approved', message: `Your task claim was approved and ${formatUsdtMicros(task.rewardAmountMicros)} USDT was credited.`, entityType: 'task-claim', entityId: claim.id, sourceKey: `task-claim:${claim.id}:approved` });
      appendDigiAudit({ actorType: 'admin', actorId: admin.email, action: 'task.approved', entityType: 'task-claim', entityId: claim.id, details: { reward: formatUsdtMicros(task.rewardAmountMicros) } });
    } else { createDigiNotification({ userId: claim.userId, type: 'campaign', title: 'Task claim rejected', message: `Your task claim was rejected${note ? `: ${note}` : '.'}`, entityType: 'task-claim', entityId: claim.id, sourceKey: `task-claim:${claim.id}:rejected` }); appendDigiAudit({ actorType: 'admin', actorId: admin.email, action: 'task.rejected', entityType: 'task-claim', entityId: claim.id, details: { reason: note } }); }
    await persist(); return send(res, 200, { claim });
  }

  if (req.method === 'GET' && path === '/admin/reward-page') {
    const admin = adminAuth(req);
    return send(res, 200, { admin: { email: admin.email, role: admin.role }, config: structuredClone(db.digirupee.config.rewardPage) });
  }

  if (req.method === 'PATCH' && path === '/admin/reward-page') {
    const admin = adminAuth(req); requireAdminRole(admin, ['owner']); const b = await body(req);
    const current = db.digirupee.config.rewardPage || structuredClone(defaultData.digirupee.config.rewardPage);
    const zonesIn = b.zones && typeof b.zones === 'object' ? b.zones : {};
    const flag = (value, fallback) => typeof value === 'boolean' ? value : fallback;
    const clean = (value, fallback, max) => {
      const text = String(value ?? fallback ?? '').replace(/\r/g, '').trim().slice(0, max);
      return text || String(fallback || '').slice(0, max);
    };
    const next = {
      showMascot: flag(b.showMascot, current.showMascot !== false),
      showCoins: flag(b.showCoins, current.showCoins !== false),
      heroKicker: clean(b.heroKicker, current.heroKicker || 'BONUS ZONE', 40),
      heroTitle: clean(b.heroTitle, current.heroTitle || 'Play More.\nEarn More.', 100),
      heroSubtitle: clean(b.heroSubtitle, current.heroSubtitle || '', 220),
      liveNewsEnabled: flag(b.liveNewsEnabled, current.liveNewsEnabled !== false),
      liveNewsText: String(b.liveNewsText ?? current.liveNewsText ?? '').replace(/\s+/g, ' ').trim().slice(0, 180),
      zones: {
        newuser: flag(zonesIn.newuser, current.zones?.newuser !== false),
        invite: flag(zonesIn.invite, current.zones?.invite !== false),
        tasks: flag(zonesIn.tasks, current.zones?.tasks !== false),
        events: flag(zonesIn.events, current.zones?.events !== false)
      }
    };
    db.digirupee.config.rewardPage = next;
    appendDigiAudit({ actorType: 'admin', actorId: admin.email, action: 'reward-page.configured', entityType: 'reward-page', entityId: 'config', details: { showMascot: next.showMascot, showCoins: next.showCoins, liveNewsEnabled: next.liveNewsEnabled, zones: next.zones } });
    await persist();
    return send(res, 200, { config: structuredClone(next) });
  }

  if (req.method === 'GET' && path === '/admin/wheel') {
    const admin = adminAuth(req); return send(res, 200, { admin: { email: admin.email, role: admin.role }, config: db.digirupee.wheelConfig });
  }

  if (req.method === 'PATCH' && path === '/admin/wheel') {
    const admin = adminAuth(req); requireAdminRole(admin, ['owner']); const b = await body(req);
    const segments = Array.isArray(b.segments) ? b.segments.map(item => ({ id: String(item.id || '').trim().slice(0, 40), label: String(item.label || '').trim().slice(0, 80), rewardAmountMicros: parseUsdtMicros(item.rewardAmount ?? item.rewardAmountUsdt ?? '0'), probabilityWeight: Number(item.probabilityWeight), enabled: item.enabled !== false })) : null;
    const dailyClaimLimit = Number(b.dailyClaimLimit); const enabled = b.enabled === true;
    if (!segments || segments.length !== 8 || segments.some(item => !/^[A-Za-z0-9_-]{1,40}$/.test(item.id) || !item.label || item.rewardAmountMicros === null || item.rewardAmountMicros < 0 || !Number.isSafeInteger(item.probabilityWeight) || item.probabilityWeight < 0) || new Set(segments.map(item => item.id)).size !== segments.length || !Number.isInteger(dailyClaimLimit) || dailyClaimLimit < 1 || dailyClaimLimit > 10 || (enabled && !segments.some(item => item.enabled && item.probabilityWeight > 0))) return send(res, 400, { error: 'Wheel configuration is invalid' });
    db.digirupee.wheelConfig = { enabled, dailyClaimLimit, segments, updatedAt: Date.now() };
    appendDigiAudit({ actorType: 'admin', actorId: admin.email, action: 'wheel.configured', entityType: 'wheel', entityId: 'config', details: { enabled, segmentCount: segments.length } }); await persist();
    return send(res, 200, { config: db.digirupee.wheelConfig });
  }

  if (req.method === 'GET' && path === '/admin/wheel/history') {
    const admin = adminAuth(req); const claims = db.digirupee.wheelClaims.slice().sort((a, b) => Number(b.createdAt) - Number(a.createdAt)).slice(0, 500).map(claim => { const user = db.digirupee.users.find(item => item.id === claim.userId); return { id: claim.id, user: user ? { id: user.id, name: user.profile?.fullName || '' } : { id: claim.userId }, label: claim.label, rewardAmount: formatUsdtMicros(claim.rewardAmountMicros), createdAt: claim.createdAt }; });
    return send(res, 200, { admin: { email: admin.email, role: admin.role }, claims, spinsToday: db.digirupee.wheelClaims.filter(claim => claim.dayKey === indiaDayKey()).length, rewardsIssuedToday: formatUsdtMicros(db.digirupee.wheelClaims.filter(claim => claim.dayKey === indiaDayKey()).reduce((sum, claim) => sum + Number(claim.rewardAmountMicros || 0), 0)) });
  }

  if (req.method === 'GET' && path === '/admin/referrals') {
    const admin = adminAuth(req);
    const referrals = db.digirupee.referrals.map(referral => referralPublic(referral, { includeInviter: true }));
    const metrics = referrals.reduce((summary, referral) => {
      summary.total += 1;
      if (['qualified', 'rewarded'].includes(referral.status)) summary.qualified += 1;
      if (referral.status === 'pending') summary.pending += 1;
      summary.completedTradeCount += Number(referral.stats.completedTradeCount || 0);
      summary.completedVolumeUsdt += Number(referral.stats.completedVolumeUsdt || 0);
      summary.commissionEarnedUsdt += Number(referral.stats.commissionEarnedUsdt || 0);
      return summary;
    }, { total: 0, qualified: 0, pending: 0, completedTradeCount: 0, completedVolumeUsdt: 0, commissionEarnedUsdt: 0 });
    const rewards = formatUsdtMicros(db.digirupee.rewardLedger.filter(entry => entry.sourceType === 'referral' || entry.sourceType === 'referral_commission').reduce((sum, entry) => sum + Number(entry.amountMicros || 0), 0));
    return send(res, 200, { admin: { email: admin.email, role: admin.role }, referrals, metrics: { ...metrics, rewards } });
  }

  if (req.method === 'GET' && path === '/admin/referral-policy') {
    const admin = adminAuth(req); return send(res, 200, { policy: referralPolicy() });
  }

  if (req.method === 'PATCH' && path === '/admin/referral-policy') {
    const admin = adminAuth(req); requireAdminRole(admin, ['owner']);
    const b = await body(req);
    const current = db.digirupee.config.referrals || {};
    const inviterCommissionPercent = validDigiAmount(b.inviterCommissionPercent ?? current.inviterCommissionPercent ?? 0.5, 0, 100);
    const inviterRewardUsdt = validDigiAmount(b.inviterRewardUsdt ?? current.inviterRewardUsdt ?? 0, 0, 1_000_000);
    const referredRewardUsdt = validDigiAmount(b.referredRewardUsdt ?? current.referredRewardUsdt ?? 0, 0, 1_000_000);
    const minimumCompletedUsdt = validDigiAmount(b.minimumCompletedUsdt ?? current.minimumCompletedUsdt ?? 0, 0, 1_000_000);
    if ([inviterCommissionPercent, inviterRewardUsdt, referredRewardUsdt, minimumCompletedUsdt].some(value => value === null)) return send(res, 400, { error: 'Referral policy amounts are invalid' });
    db.digirupee.config.referrals = { ...current, enabled: b.enabled !== false, inviterCommissionPercent, inviterRewardUsdt, referredRewardUsdt, minimumCompletedUsdt };
    db.digirupee.config.updatedAt = Date.now();
    appendDigiAudit({ actorType: 'admin', actorId: admin.email, action: 'referral.policy.updated', entityType: 'referral-policy', entityId: 'config', details: { enabled: db.digirupee.config.referrals.enabled, inviterCommissionPercent, inviterRewardUsdt, referredRewardUsdt, minimumCompletedUsdt } });
    await persist();
    return send(res, 200, { policy: referralPolicy() });
  }

  if (req.method === 'GET' && path === '/payout-methods') {
    const { user } = digirupeeAuth(req);
    return send(res, 200, { payoutMethods: db.digirupee.payoutMethods.filter(method => method.userId === user.id).sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt)).map(method => ({ ...publicDigiPayoutMethod(method), usedTodayInr: formatInrPaise(dailyMethodUsagePaise(method.id)), remainingDailyInr: formatInrPaise(payoutMethodRemainingPaise(method)) })) });
  }

  if (req.method === 'POST' && path === '/payout-methods') {
    const { user } = digirupeeAuth(req);
    const b = await body(req);
    const result = buildPayoutMethod(b);
    if (result.error) return send(res, 400, { error: result.error });
    const method = result.method;
    method.userId = user.id;
    const duplicate = db.digirupee.payoutMethods.some(existing => existing.userId === user.id && (
      method.type === 'UPI' ? existing.type === 'UPI' && existing.upiId === method.upiId : existing.type === 'BANK' && existing.accountNumber === method.accountNumber && existing.ifsc === method.ifsc
    ));
    if (duplicate) return send(res, 409, { error: 'This payout method is already saved' });
    db.digirupee.payoutMethods.push(method);
    appendDigiAudit({ actorType: 'user', actorId: user.id, action: 'payout-method.added', entityType: 'payout-method', entityId: method.id, details: { type: method.type, label: method.label, identifier: method.type === 'UPI' ? maskDigiValue(method.upiId, 2, 4) : maskDigiValue(method.accountNumber, 2, 4) } });
    await persist();
    return send(res, 201, { payoutMethod: publicDigiPayoutMethod(method) });
  }

  if (req.method === 'PATCH' && /^\/payout-methods\/[A-Za-z0-9_-]+$/.test(path)) {
    const { user } = digirupeeAuth(req);
    const id = path.split('/').pop();
    const method = findOwnedPayoutMethod(user.id, id);
    if (!method) return send(res, 404, { error: 'Payout method not found' });
    if (payoutMethodUsesActiveOrder(method.id)) return send(res, 409, { error: 'This payout method is locked while an active order uses it' });
    const b = await body(req);
    if (b.type !== undefined && String(b.type).trim().toUpperCase() !== method.type) return send(res, 400, { error: 'Payout method type cannot be changed' });
    const result = buildPayoutMethod({ ...b, type: method.type }, method);
    if (result.error) return send(res, 400, { error: result.error });
    const duplicate = db.digirupee.payoutMethods.some(existing => existing.id !== method.id && existing.userId === user.id && (
      result.method.type === 'UPI' ? existing.type === 'UPI' && existing.upiId === result.method.upiId : existing.type === 'BANK' && existing.accountNumber === result.method.accountNumber && existing.ifsc === result.method.ifsc
    ));
    if (duplicate) return send(res, 409, { error: 'This payout method is already saved' });
    Object.assign(method, result.method);
    appendDigiAudit({ actorType: 'user', actorId: user.id, action: 'payout-method.updated', entityType: 'payout-method', entityId: method.id, details: { type: method.type, label: method.label, identifier: method.type === 'UPI' ? maskDigiValue(method.upiId, 2, 4) : maskDigiValue(method.accountNumber, 2, 4) } });
    await persist();
    return send(res, 200, { payoutMethod: publicDigiPayoutMethod(method) });
  }

  if (req.method === 'PATCH' && /^\/payout-methods\/[A-Za-z0-9_-]+\/status$/.test(path)) {
    const { user } = digirupeeAuth(req);
    const id = path.split('/').at(-2);
    const method = findOwnedPayoutMethod(user.id, id);
    if (!method) return send(res, 404, { error: 'Payout method not found' });
    if (payoutMethodUsesActiveOrder(method.id)) return send(res, 409, { error: 'This payout method is locked while an active order uses it' });
    const b = await body(req);
    if (typeof b.enabled !== 'boolean') return send(res, 400, { error: 'enabled must be boolean' });
    method.enabled = b.enabled;
    method.updatedAt = Date.now();
    appendDigiAudit({ actorType: 'user', actorId: user.id, action: `payout-method.${b.enabled ? 'enabled' : 'disabled'}`, entityType: 'payout-method', entityId: method.id, details: { type: method.type, label: method.label } });
    await persist();
    return send(res, 200, { payoutMethod: publicDigiPayoutMethod(method) });
  }

  if (req.method === 'DELETE' && /^\/payout-methods\/[A-Za-z0-9_-]+$/.test(path)) {
    const { user } = digirupeeAuth(req);
    const id = path.split('/').pop();
    const method = findOwnedPayoutMethod(user.id, id);
    if (!method) return send(res, 404, { error: 'Payout method not found' });
    if (payoutMethodUsesActiveOrder(method.id)) return send(res, 409, { error: 'This payout method is locked while an active order uses it' });
    db.digirupee.payoutMethods = db.digirupee.payoutMethods.filter(item => item.id !== method.id);
    appendDigiAudit({ actorType: 'user', actorId: user.id, action: 'payout-method.deleted', entityType: 'payout-method', entityId: method.id, details: { type: method.type, label: method.label } });
    await persist();
    return send(res, 200, { ok: true });
  }

  if (req.method === 'GET' && path === '/admin/tron-addresses') {
    const admin = adminAuth(req);
    const expired = expireDigiOrders();
    if (expired) await persist();
    return send(res, 200, { admin: { email: admin.email, role: admin.role }, tronAddresses: db.digirupee.tronAddresses.map(address => ({ ...publicDigiAddress(address), activeOrderId: address.reservedOrderId || null })) });
  }

  if (req.method === 'POST' && path === '/admin/tron-addresses') {
    const admin = adminAuth(req);
    requireAdminRole(admin, ['owner', 'ops']);
    const b = await body(req);
    const address = String(b.address || '').trim();
    const label = String(b.label || '').trim();
    if (!isValidTronAddress(address)) return send(res, 400, { error: 'Enter a valid TRON mainnet address' });
    if (label.length < 1 || label.length > 80) return send(res, 400, { error: 'Address label must be 1 to 80 characters' });
    if (db.digirupee.tronAddresses.some(item => item.address === address)) return send(res, 409, { error: 'This TRON address is already registered' });
    const now = Date.now();
    const record = { id: 'dta_' + randomUUID().replace(/-/g, '').slice(0, 12), address, label, enabled: b.enabled === undefined ? true : b.enabled === true, createdAt: now, updatedAt: now, reservedOrderId: null, reservedUntil: null, lastUsedAt: null, totalOrders: 0, totalUsdtAssigned: 0 };
    db.digirupee.tronAddresses.push(record);
    backfillDigiMissingAddresses();
    appendDigiAudit({ actorType: 'admin', actorId: admin.email, action: 'tron-address.added', entityType: 'tron-address', entityId: record.id, details: { address: maskDigiValue(address, 5, 5), label: record.label } });
    await persist();
    return send(res, 201, { tronAddress: publicDigiAddress(record) });
  }

  if (req.method === 'PATCH' && /^\/admin\/tron-addresses\/[A-Za-z0-9_-]+$/.test(path)) {
    const admin = adminAuth(req);
    requireAdminRole(admin, ['owner', 'ops']);
    const id = path.split('/').pop();
    const record = db.digirupee.tronAddresses.find(item => item.id === id);
    if (!record) return send(res, 404, { error: 'TRON address not found' });
    const b = await body(req);
    const label = b.label === undefined ? record.label : String(b.label || '').trim();
    const nextAddress = b.address === undefined ? record.address : String(b.address || '').trim();
    if (label.length < 1 || label.length > 80) return send(res, 400, { error: 'Address label must be 1 to 80 characters' });
    if (!isValidTronAddress(nextAddress)) return send(res, 400, { error: 'Enter a valid TRON mainnet address' });
    if (nextAddress !== record.address && (record.reservedOrderId || record.totalOrders > 0)) return send(res, 409, { error: 'A used or reserved TRON address cannot be replaced' });
    if (db.digirupee.tronAddresses.some(item => item.id !== record.id && item.address === nextAddress)) return send(res, 409, { error: 'This TRON address is already registered' });
    record.label = label;
    record.address = nextAddress;
    record.updatedAt = Date.now();
    appendDigiAudit({ actorType: 'admin', actorId: admin.email, action: 'tron-address.updated', entityType: 'tron-address', entityId: record.id, details: { address: maskDigiValue(record.address, 5, 5), label: record.label } });
    await persist();
    return send(res, 200, { tronAddress: publicDigiAddress(record) });
  }

  if (req.method === 'PATCH' && /^\/admin\/tron-addresses\/[A-Za-z0-9_-]+\/status$/.test(path)) {
    const admin = adminAuth(req);
    requireAdminRole(admin, ['owner', 'ops']);
    const id = path.split('/').at(-2);
    const record = db.digirupee.tronAddresses.find(item => item.id === id);
    if (!record) return send(res, 404, { error: 'TRON address not found' });
    const b = await body(req);
    if (typeof b.enabled !== 'boolean') return send(res, 400, { error: 'enabled must be boolean' });
    record.enabled = b.enabled;
    record.updatedAt = Date.now();
    appendDigiAudit({ actorType: 'admin', actorId: admin.email, action: `tron-address.${b.enabled ? 'enabled' : 'disabled'}`, entityType: 'tron-address', entityId: record.id, details: { address: maskDigiValue(record.address, 5, 5) } });
    await persist();
    return send(res, 200, { tronAddress: publicDigiAddress(record) });
  }

  if (req.method === 'DELETE' && /^\/admin\/tron-addresses\/[A-Za-z0-9_-]+$/.test(path)) {
    const admin = adminAuth(req);
    requireAdminRole(admin, ['owner', 'ops']);
    const id = path.split('/').pop();
    const record = db.digirupee.tronAddresses.find(item => item.id === id);
    if (!record) return send(res, 404, { error: 'TRON address not found' });
    if (record.reservedOrderId || db.digirupee.orders.some(order => order.depositAddressId === record.id)) return send(res, 409, { error: 'A used or reserved TRON address cannot be removed; disable it instead' });
    db.digirupee.tronAddresses = db.digirupee.tronAddresses.filter(item => item.id !== record.id);
    appendDigiAudit({ actorType: 'admin', actorId: admin.email, action: 'tron-address.deleted', entityType: 'tron-address', entityId: record.id, details: { address: maskDigiValue(record.address, 5, 5) } });
    await persist();
    return send(res, 200, { ok: true });
  }

  if (req.method === 'GET' && path === '/rates') {
    return send(res, 200, publicDigiConfig());
  }

  if (req.method === 'POST' && path === '/auth/register') {
    limitRequest(req, 'digirupee-register', 5, 60 * 60 * 1000);
    const b = await body(req);
    const email = String(b.email || '').trim().toLowerCase();
    const password = String(b.password || '');
    const fullName = String(b.fullName || b.name || '').trim();
    const mobile = normalizeDigiMobile(b.mobile);
    if (!safeEmail(email)) return send(res, 400, { error: 'Enter a valid email address' });
    if (fullName.length < 2 || fullName.length > 80) return send(res, 400, { error: 'Enter your full name' });
    if (!mobile) return send(res, 400, { error: 'Enter a valid mobile number' });
    if (!validPassword(password)) return send(res, 400, { error: 'Password must be 8 to 128 characters' });
    if (db.digirupee.users.some(item => item.email === email)) return send(res, 409, { error: 'Email is already registered' });
    if (db.digirupee.users.some(item => item.mobile === mobile)) return send(res, 409, { error: 'Mobile number is already registered' });
    const referralCode = String(b.referralCode || '').trim().toUpperCase();
    const referrer = referralCode ? db.digirupee.users.find(item => String(item.referralCode || '').toUpperCase() === referralCode) : null;
    if (referralCode && !referrer) return send(res, 400, { error: 'Referral code is invalid' });

    const now = Date.now();
    const user = {
      id: 'dgu_' + randomUUID().replace(/-/g, '').slice(0, 12),
      email,
      mobile,
      passwordHash: hashPassword(password),
      status: 'active',
      createdAt: now,
      referralCode: `DGR${randomBytes(5).toString('hex').toUpperCase()}`,
      profile: {
        fullName,
        language: 'en',
        notificationPreference: true
      }
    };
    if (referrer && referrer.id === user.id) return send(res, 400, { error: 'You cannot refer yourself' });
    if (referrer && db.digirupee.referrals.some(item => item.referrerUserId === referrer.id && item.referredUserId === user.id)) return send(res, 409, { error: 'Referral relation already exists' });
    db.digirupee.users.push(user);
    if (referrer) {
      const referral = { id: `dref_${randomUUID().replace(/-/g, '').slice(0, 12)}`, referrerUserId: referrer.id, referredUserId: user.id, createdAt: now, status: 'pending', qualifiedAt: null, qualifyingOrderId: null, inviterRewardLedgerId: null, referredRewardLedgerId: null, commissionLedgerIds: [] };
      db.digirupee.referrals.push(referral);
      createDigiNotification({ userId: referrer.id, type: 'referral', title: 'New referral joined', message: `${fullName} joined eMoney using your referral.`, entityType: 'referral', entityId: referral.id, sourceKey: `referral:${referral.id}:joined` });
      appendDigiAudit({ actorType: 'user', actorId: user.id, action: 'referral.created', entityType: 'referral', entityId: referral.id, details: { referrerUserId: referrer.id } });
    }
    appendDigiAudit({ actorType: 'user', actorId: user.id, action: 'user.registered', entityType: 'user', entityId: user.id, details: { email } });
    await persist();
    return send(res, 201, { ...digiUserResponse(user), loginRequired: true });
  }

  if (req.method === 'POST' && path === '/auth/login') {
    limitRequest(req, 'digirupee-login', 12, 15 * 60 * 1000);
    const b = await body(req);
    const email = String(b.email || '').trim().toLowerCase();
    const password = String(b.password || '');
    const user = db.digirupee.users.find(item => item.email === email);
    if (!safeEmail(email) || !password || !user || !verifyPassword(password, user.passwordHash)) {
      return send(res, 401, { error: 'Invalid email or password' });
    }
    if (user.status !== 'active') return send(res, 403, { error: 'Account is not active' });
    if (!String(user.passwordHash || '').startsWith('scrypt$')) user.passwordHash = hashPassword(password);
    ensureDigiSecurityFields();
    if (user.security.twoFactor.enabled) {
      const challengeId = createDigiAuthChallenge(user.id);
      await persist();
      return send(res, 200, { twoFactorRequired: true, challengeId, expiresIn: 300 });
    }
    const token = makeDigiSession(user.id);
    const session = registerDigiSession(user.id, token, req);
    user.security.lastLoginAt = Date.now();
    createDigiNotification({ userId: user.id, type: 'security', title: 'New session created', message: `A new ${session.deviceLabel} session was created.`, entityType: 'session', entityId: session.id, sourceKey: `security:session:${session.id}` });
    appendDigiAudit({ actorType: 'user', actorId: user.id, action: 'user.login', entityType: 'session', entityId: user.id });
    await persist();
    return send(res, 200, { ...digiUserResponse(user), token, expiresIn: sessionMaxAge }, { 'Set-Cookie': digiSessionCookie(req, token) });
  }

  if (req.method === 'POST' && path === '/auth/2fa') {
    limitRequest(req, 'digirupee-2fa-login', 10, 15 * 60 * 1000);
    const b = await body(req); const rawChallenge = String(b.challengeId || '').trim(); const challenge = consumeDigiAuthChallenge(rawChallenge); if (!challenge) return send(res, 401, { error: 'Invalid or expired authentication challenge' });
    const user = db.digirupee.users.find(item => item.id === challenge.userId); if (!user || user.status !== 'active') return send(res, 401, { error: 'Invalid authentication challenge' }); ensureDigiSecurityFields(); const check = verifyDigiSecondFactor(user, b.code); challenge.attempts += 1;
    if (!check.valid) { await persist(); return send(res, 401, { error: 'Invalid authentication code' }); }
    challenge.usedAt = Date.now(); const token = makeDigiSession(user.id); const session = registerDigiSession(user.id, token, req); user.security.lastLoginAt = Date.now(); createDigiNotification({ userId: user.id, type: 'security', title: 'New session created', message: `A new ${session.deviceLabel} session was created.`, entityType: 'session', entityId: session.id, sourceKey: `security:session:${session.id}` }); appendDigiAudit({ actorType: 'user', actorId: user.id, action: 'user.login', entityType: 'session', entityId: session.id, details: { secondFactor: check.kind } }); if (check.kind === 'recovery') appendDigiAudit({ actorType: 'user', actorId: user.id, action: 'security.recovery_code_used', entityType: 'security', entityId: user.id, details: {} }); await persist(); return send(res, 200, { ...digiUserResponse(user), token, expiresIn: sessionMaxAge }, { 'Set-Cookie': digiSessionCookie(req, token) });
  }

  if (req.method === 'POST' && path === '/auth/logout') {
    const token = digiSessionToken(req);
    const uid = verifyDigiSession(token);
    const session = revokeDigiSession(token);
    if (uid && session) {
      appendDigiAudit({ actorType: 'user', actorId: uid, action: 'user.logout', entityType: 'session', entityId: uid });
      appendDigiAudit({ actorType: 'user', actorId: uid, action: 'security.session_revoked', entityType: 'session', entityId: session.id || uid, details: { reason: 'logout' } });
      await persist();
    }
    return send(res, 200, { ok: true }, { 'Set-Cookie': clearDigiSessionCookie(req) });
  }

  if (req.method === 'GET' && (path === '/me' || path === '/profile')) {
    const { user } = digirupeeAuth(req);
    return send(res, 200, digiUserResponse(user));
  }

  if (req.method === 'PATCH' && path === '/profile') {
    const { user } = digirupeeAuth(req);
    const b = await body(req);
    const changes = {};
    if (b.fullName !== undefined || b.name !== undefined) {
      const fullName = String(b.fullName ?? b.name).trim();
      if (fullName.length < 2 || fullName.length > 80) return send(res, 400, { error: 'Enter your full name' });
      user.profile.fullName = fullName;
      changes.fullName = fullName;
    }
    if (b.mobile !== undefined) {
      const mobile = normalizeDigiMobile(b.mobile);
      if (!mobile) return send(res, 400, { error: 'Enter a valid mobile number' });
      if (db.digirupee.users.some(item => item.id !== user.id && item.mobile === mobile)) return send(res, 409, { error: 'Mobile number is already registered' });
      user.mobile = mobile;
      changes.mobile = mobile;
    }
    if (b.language !== undefined) {
      const language = String(b.language).trim().toLowerCase();
      if (!['en', 'hi'].includes(language)) return send(res, 400, { error: 'Unsupported language' });
      user.profile.language = language;
      changes.language = language;
    }
    if (b.notificationPreference !== undefined || b.notifications !== undefined) {
      const preference = b.notificationPreference ?? b.notifications;
      if (typeof preference !== 'boolean') return send(res, 400, { error: 'Notification preference must be boolean' });
      user.profile.notificationPreference = preference;
      changes.notificationPreference = preference;
    }
    if (!Object.keys(changes).length) return send(res, 400, { error: 'No profile changes supplied' });
    appendDigiAudit({ actorType: 'user', actorId: user.id, action: 'profile.updated', entityType: 'profile', entityId: user.id, details: changes });
    await persist();
    return send(res, 200, digiUserResponse(user));
  }

  if (req.method === 'GET' && path === '/support') {
    const { user } = digirupeeAuth(req);
    const tickets = db.digirupee.supportTickets.filter(ticket => ticket.userId === user.id).sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt)).slice(0, 100).map(ticket => publicDigiTicket(ticket));
    return send(res, 200, { tickets });
  }

  if (req.method === 'POST' && path === '/support') {
    limitRequest(req, 'digirupee-support', 10, 60 * 60 * 1000);
    const { user } = digirupeeAuth(req); const b = await body(req); const category = String(b.category || b.type || '').trim().toUpperCase(); const subject = String(b.subject || '').trim(); const message = String(b.message || '').trim(); const orderId = String(b.orderId || '').trim();
    if (!digiTicketCategories.has(category)) return send(res, 400, { error: 'Choose a valid support category' });
    if (subject.length < 4 || subject.length > 120 || message.length < 10 || message.length > 4000) return send(res, 400, { error: 'Subject or message length is invalid' });
    if (orderId && !db.digirupee.orders.some(order => order.id === orderId && order.userId === user.id)) return send(res, 404, { error: 'Order not found' });
    const recent = db.digirupee.supportTickets.find(ticket => ticket.userId === user.id && ticket.subject === subject && ticket.message === message && Date.now() - Number(ticket.createdAt) < 60 * 1000);
    if (recent) return send(res, 409, { error: 'A matching support ticket was submitted recently', ticket: publicDigiTicket(recent) });
    const now = Date.now(); const ticket = { id: `dst_${randomUUID().replace(/-/g, '').slice(0, 12)}`, userId: user.id, category, subject, message, orderId: orderId || null, priority: 'normal', status: 'Open', createdAt: now, updatedAt: now, closedAt: null, messages: [{ id: `dsm_${randomUUID().replace(/-/g, '').slice(0, 12)}`, senderType: 'user', senderId: user.id, text: message, createdAt: now }] };
    db.digirupee.supportTickets.push(ticket); appendDigiAudit({ actorType: 'user', actorId: user.id, action: 'support.created', entityType: 'support-ticket', entityId: ticket.id, details: { category, orderId: orderId || null } }); await persist(); return send(res, 201, { ticket: publicDigiTicket(ticket) });
  }

  if (req.method === 'GET' && /^\/support\/[A-Za-z0-9_-]+$/.test(path)) {
    const { user } = digirupeeAuth(req); const ticket = db.digirupee.supportTickets.find(item => item.id === path.split('/').pop() && item.userId === user.id); if (!ticket) return send(res, 404, { error: 'Support ticket not found' }); return send(res, 200, { ticket: publicDigiTicket(ticket) });
  }

  if (req.method === 'POST' && /^\/support\/[A-Za-z0-9_-]+\/messages$/.test(path)) {
    limitRequest(req, 'digirupee-support-message', 20, 60 * 60 * 1000); const { user } = digirupeeAuth(req); const ticket = db.digirupee.supportTickets.find(item => item.id === path.split('/').at(-2) && item.userId === user.id); if (!ticket) return send(res, 404, { error: 'Support ticket not found' }); if (ticket.status === 'Closed') return send(res, 409, { error: 'Closed tickets cannot receive new messages' }); const b = await body(req); const text = String(b.message || b.text || '').trim(); if (text.length < 2 || text.length > 4000) return send(res, 400, { error: 'Message length is invalid' }); const now = Date.now(); ticket.messages.push({ id: `dsm_${randomUUID().replace(/-/g, '').slice(0, 12)}`, senderType: 'user', senderId: user.id, text, createdAt: now }); ticket.updatedAt = now; appendDigiAudit({ actorType: 'user', actorId: user.id, action: 'support.user_replied', entityType: 'support-ticket', entityId: ticket.id, details: {} }); await persist(); return send(res, 200, { ticket: publicDigiTicket(ticket) });
  }

  if (req.method === 'POST' && /^\/support\/[A-Za-z0-9_-]+\/close$/.test(path)) {
    const { user } = digirupeeAuth(req); const ticket = db.digirupee.supportTickets.find(item => item.id === path.split('/').at(-2) && item.userId === user.id); if (!ticket) return send(res, 404, { error: 'Support ticket not found' }); if (ticket.status === 'Closed') return send(res, 200, { ticket: publicDigiTicket(ticket), idempotent: true }); const now = Date.now(); ticket.status = 'Closed'; ticket.closedAt = now; ticket.updatedAt = now; appendDigiAudit({ actorType: 'user', actorId: user.id, action: 'support.status_changed', entityType: 'support-ticket', entityId: ticket.id, details: { status: 'Closed' } }); await persist(); return send(res, 200, { ticket: publicDigiTicket(ticket) });
  }

  if (req.method === 'GET' && path === '/notifications') {
    const { user } = digirupeeAuth(req); const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`); const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 50))); const offset = Math.max(0, Number(url.searchParams.get('offset') || 0)); const notifications = db.digirupee.notifications.filter(item => item.userId === user.id).sort((a, b) => Number(b.createdAt) - Number(a.createdAt)); return send(res, 200, { notifications: notifications.slice(offset, offset + limit).map(publicDigiNotification), total: notifications.length, unreadCount: notifications.filter(item => !item.readAt).length });
  }

  if (req.method === 'GET' && path === '/notifications/unread-count') {
    const { user } = digirupeeAuth(req); return send(res, 200, { unreadCount: db.digirupee.notifications.filter(item => item.userId === user.id && !item.readAt).length });
  }

  if (req.method === 'PATCH' && /^\/notifications\/[A-Za-z0-9_-]+\/read$/.test(path)) {
    const { user } = digirupeeAuth(req); const notification = db.digirupee.notifications.find(item => item.id === path.split('/').at(-2) && item.userId === user.id); if (!notification) return send(res, 404, { error: 'Notification not found' }); if (!notification.readAt) { notification.readAt = Date.now(); await persist(); } return send(res, 200, { notification: publicDigiNotification(notification) });
  }

  if (req.method === 'POST' && path === '/notifications/read-all') {
    const { user } = digirupeeAuth(req); const now = Date.now(); let changed = false; for (const notification of db.digirupee.notifications.filter(item => item.userId === user.id && !item.readAt)) { notification.readAt = now; changed = true; } if (changed) await persist(); return send(res, 200, { ok: true });
  }

  if (req.method === 'GET' && path === '/security/sessions') {
    const { user, token } = digirupeeAuth(req); const currentHash = digiSessionHash(token); const sessions = db.digirupee.sessions.filter(item => (item.userId || item.uid) === user.id && !item.revokedAt && Number(item.expiresAt) > Date.now()).sort((a, b) => Number(b.lastSeenAt || b.createdAt) - Number(a.lastSeenAt || a.createdAt)); return send(res, 200, { sessions: sessions.map(item => publicDigiSession(item, currentHash)) });
  }

  if (req.method === 'DELETE' && /^\/security\/sessions\/[A-Za-z0-9_-]+$/.test(path)) {
    const { user, token } = digirupeeAuth(req); const id = path.split('/').pop(); const current = digiSessionRecord(token); const session = db.digirupee.sessions.find(item => item.id === id && (item.userId || item.uid) === user.id); if (!session) return send(res, 404, { error: 'Session not found' }); if (current?.id === session.id) return send(res, 400, { error: 'Use logout to revoke the current session' }); if (!session.revokedAt) { session.revokedAt = Date.now(); appendDigiAudit({ actorType: 'user', actorId: user.id, action: 'security.session_revoked', entityType: 'session', entityId: session.id, details: {} }); await persist(); } return send(res, 200, { ok: true });
  }

  if (req.method === 'POST' && path === '/security/sessions/revoke-others') {
    const { user, token } = digirupeeAuth(req); const current = digiSessionRecord(token); const count = revokeOtherDigiSessions(user.id, current?.id); if (count) { createDigiNotification({ userId: user.id, type: 'security', title: 'Other sessions revoked', message: `${count} other session(s) were revoked.`, entityType: 'security', entityId: user.id, sourceKey: `security:revoke-others:${current?.id}:${Date.now()}` }); appendDigiAudit({ actorType: 'user', actorId: user.id, action: 'security.sessions_revoked', entityType: 'session', entityId: user.id, details: { count } }); await persist(); } return send(res, 200, { revoked: count });
  }

  if (req.method === 'POST' && path === '/security/change-password') {
    const { user, token } = digirupeeAuth(req); const b = await body(req); const currentPassword = String(b.currentPassword || ''); const newPassword = String(b.newPassword || ''); if (!verifyPassword(currentPassword, user.passwordHash)) return send(res, 401, { error: 'Current password is incorrect' }); if (!validPassword(newPassword)) return send(res, 400, { error: 'Password must be 8 to 128 characters' }); if (verifyPassword(newPassword, user.passwordHash)) return send(res, 400, { error: 'Choose a different password' }); user.passwordHash = hashPassword(newPassword); const current = digiSessionRecord(token); const revoked = revokeOtherDigiSessions(user.id, current?.id); createDigiNotification({ userId: user.id, type: 'security', title: 'Password changed', message: 'Your digiRupee password was changed successfully.', entityType: 'security', entityId: user.id, sourceKey: `security:password:${user.id}:${Date.now()}` }); appendDigiAudit({ actorType: 'user', actorId: user.id, action: 'security.password_changed', entityType: 'user', entityId: user.id, details: { otherSessionsRevoked: revoked } }); await persist(); return send(res, 200, { ok: true, otherSessionsRevoked: revoked });
  }

  if (req.method === 'GET' && path === '/security/2fa/status') {
    const { user } = digirupeeAuth(req); return send(res, 200, { enabled: !!user.security?.twoFactor?.enabled, backupCodesRemaining: (user.security?.twoFactor?.backupCodeHashes || []).filter(item => !item.usedAt).length });
  }

  if (req.method === 'POST' && path === '/security/2fa/setup') {
    const { user } = digirupeeAuth(req); ensureDigiSecurityFields(); if (user.security?.twoFactor?.enabled) return send(res, 409, { error: 'Two-factor authentication is already enabled' }); if (!digiTwoFactorEncryptionKey) return send(res, 503, { error: 'digiRupee 2FA encryption is not configured' }); const encodedSecret = base32Encode(randomBytes(20)); user.security.twoFactor.pendingSecretCiphertext = encryptDigiSecret(encodedSecret); const otpauth = `otpauth://totp/digiRupee:${encodeURIComponent(user.email)}?secret=${encodedSecret}&issuer=digiRupee`; appendDigiAudit({ actorType: 'user', actorId: user.id, action: 'security.2fa_setup', entityType: 'user', entityId: user.id, details: {} }); await persist(); return send(res, 200, { secret: encodedSecret, otpauthUri: otpauth });
  }

  if (req.method === 'POST' && path === '/security/2fa/enable') {
    const { user } = digirupeeAuth(req); if (!user.security?.twoFactor?.pendingSecretCiphertext) return send(res, 409, { error: 'Start 2FA setup first' }); const b = await body(req); const secret = decryptDigiSecret(user.security.twoFactor.pendingSecretCiphertext); if (!secret || !validTotp(secret, b.code)) return send(res, 400, { error: 'Invalid verification code' }); const codes = recoveryCodes(); user.security.twoFactor = { enabled: true, secretCiphertext: user.security.twoFactor.pendingSecretCiphertext, pendingSecretCiphertext: null, backupCodeHashes: codes.map(code => ({ hash: hashRecoveryCode(code), usedAt: null })), enabledAt: Date.now() }; createDigiNotification({ userId: user.id, type: 'security', title: 'Two-factor authentication enabled', message: 'Two-factor authentication is now enabled on your account.', entityType: 'security', entityId: user.id, sourceKey: `security:2fa-enabled:${user.id}:${user.security.twoFactor.enabledAt}` }); appendDigiAudit({ actorType: 'user', actorId: user.id, action: 'security.2fa_enabled', entityType: 'user', entityId: user.id, details: {} }); await persist(); return send(res, 200, { enabled: true, recoveryCodes: codes });
  }

  if (req.method === 'POST' && path === '/security/2fa/disable') {
    const { user } = digirupeeAuth(req); if (!user.security?.twoFactor?.enabled) return send(res, 409, { error: 'Two-factor authentication is not enabled' }); const b = await body(req); if (!verifyPassword(String(b.currentPassword || ''), user.passwordHash)) return send(res, 401, { error: 'Current password is incorrect' }); const check = verifyDigiSecondFactor(user, b.code); if (!check.valid) return send(res, 400, { error: 'Invalid verification code' }); user.security.twoFactor = { enabled: false, secretCiphertext: null, pendingSecretCiphertext: null, backupCodeHashes: [], enabledAt: null }; createDigiNotification({ userId: user.id, type: 'security', title: 'Two-factor authentication disabled', message: 'Two-factor authentication was disabled on your account.', entityType: 'security', entityId: user.id, sourceKey: `security:2fa-disabled:${user.id}:${Date.now()}` }); appendDigiAudit({ actorType: 'user', actorId: user.id, action: 'security.2fa_disabled', entityType: 'user', entityId: user.id, details: { verification: check.kind } }); if (check.kind === 'recovery') appendDigiAudit({ actorType: 'user', actorId: user.id, action: 'security.recovery_code_used', entityType: 'security', entityId: user.id, details: {} }); await persist(); return send(res, 200, { enabled: false });
  }

  if (req.method === 'POST' && path === '/quotes') {
    const { user } = digirupeeAuth(req);
    const expired = expireDigiOrders();
    if (expired) await persist();
    const b = await body(req);
    const payoutType = String(b.payoutType || '').trim().toUpperCase();
    const activeOrder = activeDigiOrderForUser(user.id, payoutType);
    if (activeOrder) return send(res, 409, { error: `An active ${payoutType} sell order already exists`, order: publicDigiOrder(activeOrder) });
    const channelKey = payoutType.toLowerCase();
    const config = db.digirupee.config;
    if (!['UPI', 'BANK'].includes(payoutType)) return send(res, 400, { error: 'Payout type must be UPI or BANK' });
    if (!config.channels[channelKey]) return send(res, 409, { error: `${payoutType} selling is currently disabled` });
    const usdtMicros = parseUsdtMicros(b.usdtAmount);
    const minimum = parseUsdtMicros(payoutType === 'UPI' ? config.limits.upiMinUsdt : config.limits.bankMinUsdt);
    const maximum = parseUsdtMicros(config.limits.globalMaxUsdt);
    if (!usdtMicros || usdtMicros < minimum || usdtMicros > maximum) return send(res, 400, { error: 'USDT amount is outside the configured order limits' });
    const ratePaise = rateToPaise(config.rates[channelKey]);
    if (!ratePaise) return send(res, 503, { error: 'Selling rate is not configured' });
    const inrPaise = Math.round(usdtMicros * ratePaise / 1_000_000);
    const payoutMethodIds = Array.isArray(b.payoutMethodIds) ? b.payoutMethodIds : (Array.isArray(b.bankMethodIds) ? b.bankMethodIds : []);
    const selection = validateDigiPayoutSelection({
      userId: user.id,
      payoutType,
      totalPaise: inrPaise,
      payoutMethodId: b.payoutMethodId,
      allocations: b.allocations ?? b.payoutAllocations,
      candidateIds: payoutMethodIds,
      autoSplit: b.allocations === undefined && b.payoutAllocations === undefined
    });
    if (selection.error) return send(res, 400, { error: selection.error });
    const now = Date.now();
    const quote = {
      id: 'dqt_' + randomUUID().replace(/-/g, '').slice(0, 12),
      userId: user.id,
      payoutType,
      payoutMethodId: selection.payoutMethodId,
      payoutMethodIds: selection.payoutMethodIds,
      allocations: selection.allocations,
      payoutSummary: selection.payoutSummary,
      flexibleBankAllocation: !!selection.flexibleBankAllocation,
      usdtMicros,
      ratePaise,
      inrPaise,
      createdAt: now,
      expiresAt: now + Number(config.quoteValiditySeconds) * 1000,
      status: 'issued'
    };
    db.digirupee.quotes.push(quote);
    appendDigiAudit({ actorType: 'user', actorId: user.id, action: 'quote.created', entityType: 'quote', entityId: quote.id, details: { payoutType, usdtAmount: formatUsdtMicros(usdtMicros), rate: formatInrPaise(ratePaise), inrAmount: formatInrPaise(inrPaise), payoutMethodIds: selection.payoutMethodIds } });
    await persist();
    return send(res, 201, { quote: publicDigiQuote(quote) });
  }

  if (req.method === 'POST' && path === '/orders') {
    const { user } = digirupeeAuth(req);
    const expired = expireDigiOrders();
    if (expired) await persist();
    const idempotencyKey = String(req.headers['idempotency-key'] || '').trim();
    if (!/^[A-Za-z0-9_-]{16,100}$/.test(idempotencyKey)) return send(res, 400, { error: 'A valid Idempotency-Key header is required' });
    const b = await body(req);
    const quoteId = String(b.quoteId || '').trim();
    const existing = db.digirupee.orders.find(order => order.userId === user.id && order.idempotencyKey === idempotencyKey);
    if (existing) {
      const requestedAllocations = b.allocations === undefined && b.payoutAllocations === undefined ? null : normalizeDigiAllocations(b.allocations ?? b.payoutAllocations);
      if (existing.quoteId === quoteId && (requestedAllocations === null || sameDigiAllocations(requestedAllocations, existing.allocations))) return send(res, 200, { order: publicDigiOrder(existing), replayed: true });
      return send(res, 409, { error: 'Idempotency key was already used for a different order request' });
    }
    const quote = db.digirupee.quotes.find(item => item.id === quoteId && item.userId === user.id);
    if (!quote) return send(res, 404, { error: 'Quote not found' });
    if (quote.status !== 'issued' || Number(quote.expiresAt) <= Date.now()) {
      quote.status = 'expired';
      await persist();
      return send(res, 409, { error: 'Quote has expired; request a new quote' });
    }
    const activeOrder = activeDigiOrderForUser(user.id, quote.payoutType);
    if (activeOrder) return send(res, 409, { error: `An active ${quote.payoutType} sell order already exists`, order: publicDigiOrder(activeOrder) });
    const submittedAllocations = b.allocations === undefined && b.payoutAllocations === undefined ? null : normalizeDigiAllocations(b.allocations ?? b.payoutAllocations);
    if ((b.allocations !== undefined || b.payoutAllocations !== undefined) && !submittedAllocations) return send(res, 400, { error: 'Invalid bank allocations' });
    if (submittedAllocations && !sameDigiAllocations(submittedAllocations, quote.allocations || [])) return send(res, 409, { error: 'Allocations do not match the locked quote' });
    const selection = validateDigiPayoutSelection({
      userId: user.id,
      payoutType: quote.payoutType,
      totalPaise: quote.inrPaise,
      payoutMethodId: quote.payoutMethodId,
      allocations: quote.allocations,
      candidateIds: quote.payoutMethodIds,
      autoSplit: false
    });
    if (selection.error) return send(res, 400, { error: selection.error });
    const address = availableDigiAddress();
    if (!address) return send(res, 409, { error: 'No TRON deposit address is currently available' });
    const payoutMethodSnapshots = selection.payoutMethodIds.map(id => db.digirupee.payoutMethods.find(method => method.id === id)).filter(Boolean).map(method => ({ ...method }));
    const now = Date.now();
    const order = {
      id: 'dso_' + randomUUID().replace(/-/g, '').slice(0, 12),
      userId: user.id,
      quoteId: quote.id,
      payoutType: quote.payoutType,
      payoutMethodId: selection.payoutMethodId,
      payoutMethodIds: selection.payoutMethodIds,
      allocations: selection.allocations,
      payoutMethodSnapshots,
      flexibleBankAllocation: !!selection.flexibleBankAllocation || !!quote.flexibleBankAllocation,
      usdtMicros: quote.usdtMicros,
      lockedRatePaise: quote.ratePaise,
      inrPaise: quote.inrPaise,
      depositAddressId: address.id,
      depositAddress: address.address,
      status: 'Awaiting Deposit',
      createdAt: now,
      updatedAt: now,
      quoteExpiresAt: quote.expiresAt,
      timeline: [{ status: 'Quote Locked', at: now }, { status: 'Awaiting Deposit', at: now }],
      txId: null,
      txDetectedAt: null,
      txBlockNumber: null,
      txTimestamp: null,
      receivedUsdtMicros: null,
      receivedUsdtDifferenceMicros: null,
      confirmations: 0,
      lastChainCheckAt: null,
      chainStatus: 'unseen',
      chainError: null,
      verificationSource: null,
      payout: null,
      review: null,
      idempotencyKey,
      idempotencyFingerprint: digiRequestFingerprint(quote.id, selection.allocations)
    };
    address.reservedOrderId = order.id;
    address.reservedUntil = quote.expiresAt;
    address.lastUsedAt = now;
    address.totalOrders = Number(address.totalOrders || 0) + 1;
    address.totalUsdtAssigned = Number((Number(address.totalUsdtAssigned || 0) + formatUsdtMicros(order.usdtMicros)).toFixed(6));
    db.digirupee.addressAssignments.push({
      addressId: address.id,
      address: address.address,
      orderId: order.id,
      userId: order.userId,
      assignedAt: now,
      quoteExpiresAt: order.quoteExpiresAt,
      releasedAt: null,
      safeReuseAt: null,
      txId: null,
      status: order.status
    });
    db.digirupee.orders.push(order);
    quote.status = 'consumed';
    quote.consumedOrderId = order.id;
    appendDigiAudit({ actorType: 'user', actorId: user.id, action: 'order.created', entityType: 'sell-order', entityId: order.id, details: { quoteId: quote.id, payoutType: order.payoutType, usdtAmount: formatUsdtMicros(order.usdtMicros), rate: formatInrPaise(order.lockedRatePaise), inrAmount: formatInrPaise(order.inrPaise), depositAddress: maskDigiValue(address.address, 5, 5), payoutMethodIds: order.payoutMethodIds } });
    createDigiNotification({ userId: user.id, type: 'order', title: 'Sell order created', message: `${order.id} is awaiting USDT deposit.`, entityType: 'sell-order', entityId: order.id, sourceKey: `order:${order.id}:created` });
    await persist();
    return send(res, 201, { order: publicDigiOrder(order) });
  }

  if (req.method === 'PATCH' && /^\/orders\/[A-Za-z0-9_-]+\/bank-allocations$/.test(path)) {
    const { user } = digirupeeAuth(req);
    const orderId = path.split('/')[2];
    const order = db.digirupee.orders.find(item => item.id === orderId && item.userId === user.id);
    if (!order) return send(res, 404, { error: 'Order not found' });
    if (order.payoutType !== 'BANK' || !order.flexibleBankAllocation) return send(res, 409, { error: 'This order does not support flexible bank distribution' });
    if (digiFinalStatuses.has(order.status)) return send(res, 409, { error: 'Bank distribution cannot be changed on a final order' });
    if (!digiBankDistributionStatuses.has(order.status)) return send(res, 409, { error: 'Bank distribution is available after the deposit is detected' });

    const b = await body(req);
    if (!Array.isArray(b.allocations)) return send(res, 400, { error: 'allocations must be an array' });
    const seen = new Set();
    const next = [];
    for (const item of b.allocations) {
      const payoutMethodId = String(item?.payoutMethodId || '').trim();
      const inrPaise = parseInrPaise(item?.inrAmount ?? item?.amount);
      if (!payoutMethodId || !inrPaise || inrPaise <= 0 || seen.has(payoutMethodId)) return send(res, 400, { error: 'Bank allocations are invalid' });
      seen.add(payoutMethodId);
      next.push({ payoutMethodId, inrPaise });
    }

    const plannedTotal = next.reduce((sum, item) => sum + item.inrPaise, 0);
    if (plannedTotal > Number(order.inrPaise)) return send(res, 400, { error: 'Allocated INR cannot exceed the order INR total' });
    if (plannedTotal !== Number(order.inrPaise)) return send(res, 400, { error: 'Bank allocation total must equal the order INR total' });

    const paidByMethod = new Map();
    for (const ref of order.payout?.allocations || []) {
      paidByMethod.set(ref.payoutMethodId, (paidByMethod.get(ref.payoutMethodId) || 0) + Number(ref.inrPaise || 0));
    }
    const currentPlan = new Map((order.allocations || []).map(item => [item.payoutMethodId, Number(item.inrPaise || 0)]));

    for (const [methodId, paid] of paidByMethod.entries()) {
      const planned = next.find(item => item.payoutMethodId === methodId)?.inrPaise || 0;
      if (planned < paid) return send(res, 409, { error: 'Allocation cannot be reduced below an amount already paid to that bank' });
    }

    for (const allocation of next) {
      const method = findOwnedPayoutMethod(user.id, allocation.payoutMethodId);
      if (!method || method.type !== 'BANK') return send(res, 400, { error: 'Every allocation must use your own bank account' });
      if (!method.enabled && allocation.inrPaise > Number(currentPlan.get(method.id) || 0)) return send(res, 409, { error: `${method.label || method.bankName || 'Bank'} is disabled` });
      const availableIncludingCurrentPlan = payoutMethodRemainingPaise(method) + Number(currentPlan.get(method.id) || 0);
      if (allocation.inrPaise > availableIncludingCurrentPlan) return send(res, 409, { error: `Daily capacity for ${method.label || method.bankName || 'Bank'} is unavailable` });
    }

    order.allocations = next;
    order.payoutMethodIds = [...new Set([...next.map(item => item.payoutMethodId), ...paidByMethod.keys()])];
    order.updatedAt = Date.now();
    appendDigiAudit({ actorType: 'user', actorId: user.id, action: 'bank-allocation.updated', entityType: 'sell-order', entityId: order.id, details: { allocatedInr: formatInrPaise(plannedTotal), pendingInr: formatInrPaise(Math.max(0, Number(order.inrPaise) - plannedTotal)), payoutMethodIds: order.payoutMethodIds } });
    await persist();
    return send(res, 200, { order: publicDigiOrder(order) });
  }

  if (req.method === 'GET' && path === '/orders') {
    const { user } = digirupeeAuth(req);
    const expired = expireDigiOrders();
    const repaired = backfillDigiMissingAddresses(user.id);
    if (expired || repaired) await persist();
    const status = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`).searchParams.get('status');
    if (status && !digiActiveStatuses.has(status) && !digiFinalStatuses.has(status)) return send(res, 400, { error: 'Unsupported order status filter' });
    const orders = db.digirupee.orders.filter(order => order.userId === user.id && (!status || order.status === status)).sort((a, b) => Number(b.createdAt) - Number(a.createdAt)).map(order => publicDigiOrder(order));
    return send(res, 200, { orders });
  }

  if (req.method === 'GET' && /^\/orders\/[A-Za-z0-9_-]+$/.test(path)) {
    const { user } = digirupeeAuth(req);
    const expired = expireDigiOrders();
    if (expired) await persist();
    const id = path.split('/').pop();
    const order = db.digirupee.orders.find(item => item.id === id && item.userId === user.id);
    if (!order) return send(res, 404, { error: 'Order not found' });
    return send(res, 200, { order: publicDigiOrder(order) });
  }

  if (req.method === 'POST' && /^\/orders\/[A-Za-z0-9_-]+\/tx$/.test(path)) {
    limitRequest(req, 'digirupee-tx-check', 12, 60 * 60 * 1000);
    const { user } = digirupeeAuth(req);
    const id = path.split('/').at(-2);
    const order = db.digirupee.orders.find(item => item.id === id && item.userId === user.id);
    if (!order) return send(res, 404, { error: 'Order not found' });
    if (['Completed', 'Failed', 'Rejected'].includes(order.status)) return send(res, 409, { error: 'This order cannot accept a transaction check' });
    const b = await body(req);
    const txId = normalizeDigiTxId(b.txId || b.txid || b.transactionId);
    if (!txId) return send(res, 400, { error: 'Enter a valid 64-character transaction hash' });
    try {
      const candidates = await loadDigiTransfers(order, txId);
      let changed = false;
      let matched = false;
      for (const rawCandidate of candidates) {
        const candidate = await hydrateDigiTransfer(rawCandidate);
        const assignment = assignmentForTransfer(order.depositAddressId, candidate.timestamp, candidate.receivedUsdtMicros, candidate.txId);
        if (!assignment || assignment.orderId !== order.id) continue;
        matched = true;
        changed = applyDigiTransfer(order, candidate) || changed;
      }
      if (!matched) changed = markDigiProviderResult(order, 'not_found', null) || changed;
      if (changed) await persist();
      return send(res, matched ? 200 : 202, { order: publicDigiOrder(order), checked: true, matched });
    } catch (error) {
      markDigiProviderResult(order, 'provider_error', error.message || 'TRON provider unavailable');
      await persist();
      return send(res, error.status && error.status >= 500 ? error.status : 503, { error: 'TRON verification is temporarily unavailable; please retry' });
    }
  }

  if (req.method === 'GET' && path === '/admin/orders') {
    const admin = adminAuth(req);
    const expired = expireDigiOrders();
    if (expired) await persist();
    const status = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`).searchParams.get('status');
    if (status && !digiActiveStatuses.has(status) && !digiFinalStatuses.has(status)) return send(res, 400, { error: 'Unsupported order status filter' });
    const orders = db.digirupee.orders.filter(order => !status || order.status === status).sort((a, b) => Number(b.createdAt) - Number(a.createdAt)).map(order => publicDigiOrder(order, { admin: true }));
    return send(res, 200, { admin: { email: admin.email, role: admin.role }, orders });
  }

  if (req.method === 'GET' && /^\/admin\/orders\/[A-Za-z0-9_-]+$/.test(path)) {
    const admin = adminAuth(req);
    const expired = expireDigiOrders();
    if (expired) await persist();
    const id = path.split('/').pop();
    const order = db.digirupee.orders.find(item => item.id === id);
    if (!order) return send(res, 404, { error: 'Order not found' });
    return send(res, 200, { admin: { email: admin.email, role: admin.role }, order: publicDigiOrder(order, { admin: true }) });
  }

  if (req.method === 'GET' && path === '/admin/deposits') {
    const admin = adminAuth(req);
    const expired = expireDigiOrders();
    if (expired) await persist();
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const status = url.searchParams.get('status');
    const statuses = new Set(['Awaiting Deposit', 'Detected', 'Confirming', 'Late Review', 'USDT Confirmed']);
    if (status && !statuses.has(status)) return send(res, 400, { error: 'Unsupported deposit status filter' });
    const deposits = db.digirupee.orders
      .filter(order => statuses.has(order.status) && (!status || order.status === status))
      .sort((a, b) => Number(b.createdAt) - Number(a.createdAt))
      .map(order => publicDigiOrder(order, { admin: true }));
    return send(res, 200, { admin: { email: admin.email, role: admin.role }, requiredConfirmations: tronRequiredConfirmations, deposits });
  }

  if (req.method === 'POST' && /^\/admin\/orders\/[A-Za-z0-9_-]+\/deposit-confirmation$/.test(path)) {
    const admin = adminAuth(req);
    requireAdminRole(admin, ['owner', 'ops']);
    const id = path.split('/').at(-2);
    const order = db.digirupee.orders.find(item => item.id === id);
    if (!order) return send(res, 404, { error: 'Order not found' });
    if (['USDT Confirmed', 'INR Processing', 'Completed'].includes(order.status)) {
      return send(res, 200, { order: publicDigiOrder(order, { admin: true }), idempotent: true });
    }
    if (['Failed', 'Rejected'].includes(order.status)) return send(res, 409, { error: 'This deposit belongs to a final rejected or failed order' });

    const b = await body(req);
    const suppliedTxId = String(b.txId || b.txid || b.transactionId || '').trim();
    const requestedTxId = suppliedTxId ? normalizeDigiTxId(suppliedTxId) : '';
    if (suppliedTxId && !requestedTxId) return send(res, 400, { error: 'Enter a valid 64-character TRON transaction hash' });

    try {
      const candidates = await loadDigiTransfers(order, requestedTxId);
      digiMonitorState.lastSuccessfulProviderCheckAt = Date.now();
      let changed = false;
      let matched = false;
      for (const rawCandidate of candidates) {
        const candidate = await hydrateDigiTransfer(rawCandidate);
        const assignment = assignmentForTransfer(order.depositAddressId, candidate.timestamp, candidate.receivedUsdtMicros, candidate.txId);
        if (!assignment || assignment.orderId !== order.id) continue;
        matched = true;
        changed = applyDigiTransfer(order, candidate) || changed;
      }

      if (!matched) {
        changed = markDigiProviderResult(order, 'not_found', null) || changed;
        if (changed) await persist();
        return send(res, 404, { error: requestedTxId ? 'That transaction does not match this deposit' : 'No matching TRON USDT deposit was found for this order' });
      }

      if (
        order.status === 'Late Review' &&
        order.txId &&
        order.chainStatus === 'valid_exact' &&
        Number(order.receivedUsdtMicros) === Number(order.usdtMicros) &&
        Number(order.confirmations || 0) >= tronRequiredConfirmations
      ) {
        const decision = decideDigiReview(order, admin, {
          decision: 'APPROVE',
          note: 'Manually confirmed by admin after independent TRON provider verification'
        });
        if (decision.error) {
          if (changed) await persist();
          return send(res, decision.status || 409, { error: decision.error, order: publicDigiOrder(order, { admin: true }) });
        }
        changed = true;
      }

      if (!['USDT Confirmed', 'INR Processing', 'Completed'].includes(order.status)) {
        if (changed) await persist();
        const waiting = order.status === 'Confirming'
          ? `Deposit found with ${Number(order.confirmations || 0)} of ${tronRequiredConfirmations} required confirmations`
          : order.review?.reason || 'Deposit was found but is not safe to confirm';
        return send(res, 409, { error: waiting, order: publicDigiOrder(order, { admin: true }) });
      }

      appendDigiAudit({
        actorType: 'admin',
        actorId: admin.email,
        action: 'tx.manually_confirmed',
        entityType: 'sell-order',
        entityId: order.id,
        details: { txId: order.txId, verificationSource: order.verificationSource, confirmations: order.confirmations }
      });
      await persist();
      return send(res, 200, { order: publicDigiOrder(order, { admin: true }), idempotent: false });
    } catch (error) {
      markDigiProviderResult(order, 'provider_error', error.message || 'TRON provider unavailable');
      await persist();
      return send(res, error.status && error.status >= 500 ? error.status : 503, { error: 'TRON verification is temporarily unavailable; please retry' });
    }
  }

  if (req.method === 'GET' && /^\/admin\/payout-methods\/[A-Za-z0-9_-]+\/reveal$/.test(path)) {
    const admin = adminAuth(req);
    requireAdminRole(admin, ['owner', 'ops']);
    const id = path.split('/').at(-2);
    const method = db.digirupee.payoutMethods.find(item => item.id === id);
    if (!method) return send(res, 404, { error: 'Payout method not found' });
    appendDigiAudit({
      actorType: 'admin',
      actorId: admin.email,
      action: 'payout.destination_revealed',
      entityType: 'payout-method',
      entityId: method.id,
      details: { userId: method.userId, type: method.type }
    });
    await persist();
    return send(res, 200, {
      method: method.type === 'BANK'
        ? { id: method.id, type: method.type, label: method.label, bankName: method.bankName, accountNumber: method.accountNumber, ifsc: method.ifsc, holderName: method.holderName, mobile: method.mobile }
        : { id: method.id, type: method.type, label: method.label, upiId: method.upiId, holderName: method.holderName, mobile: method.mobile }
    });
  }

  if (req.method === 'GET' && path === '/admin/payouts') {
    const admin = adminAuth(req);
    const expired = expireDigiOrders();
    if (expired) await persist();
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const status = String(url.searchParams.get('status') || '').trim();
    const allowed = new Set(['USDT Confirmed', 'INR Processing', 'Completed']);
    if (status && !allowed.has(status)) return send(res, 400, { error: 'Unsupported payout status filter' });
    const payouts = db.digirupee.orders
      .filter(order => allowed.has(order.status) && (!status || order.status === status))
      .sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt))
      .map(order => publicDigiOrder(order, { admin: true }));
    return send(res, 200, { admin: { email: admin.email, role: admin.role }, payouts });
  }

  if (req.method === 'GET' && /^\/admin\/payouts\/[A-Za-z0-9_-]+$/.test(path)) {
    const admin = adminAuth(req);
    const id = path.split('/').pop();
    const order = db.digirupee.orders.find(item => item.id === id);
    if (!order) return send(res, 404, { error: 'Order not found' });
    return send(res, 200, { admin: { email: admin.email, role: admin.role }, payout: publicDigiOrder(order, { admin: true }) });
  }

  if (req.method === 'POST' && /^\/admin\/orders\/[A-Za-z0-9_-]+\/payout$/.test(path)) {
    const admin = adminAuth(req);
    requireAdminRole(admin, ['owner', 'ops']);
    const id = path.split('/').at(-2);
    const order = db.digirupee.orders.find(item => item.id === id);
    if (!order) return send(res, 404, { error: 'Order not found' });
    const result = recordDigiPayout(order, admin, await body(req));
    if (result.error) return send(res, result.status || 400, { error: result.error });
    if (!result.idempotent) await persist();
    return send(res, 200, { order: publicDigiOrder(order, { admin: true }), idempotent: !!result.idempotent });
  }

  if (req.method === 'POST' && /^\/admin\/orders\/[A-Za-z0-9_-]+\/review$/.test(path)) {
    const admin = adminAuth(req);
    requireAdminRole(admin, ['owner', 'ops']);
    const id = path.split('/').at(-2);
    const order = db.digirupee.orders.find(item => item.id === id);
    if (!order) return send(res, 404, { error: 'Order not found' });
    const result = decideDigiReview(order, admin, await body(req));
    if (result.error) return send(res, result.status || 400, { error: result.error });
    await persist();
    return send(res, 200, { order: publicDigiOrder(order, { admin: true }) });
  }

  if (req.method === 'GET' && path === '/admin/rates') {
    const admin = adminAuth(req);
    return send(res, 200, { admin: { email: admin.email, role: admin.role }, config: publicDigiConfig() });
  }

  if (req.method === 'PATCH' && path === '/admin/rates') {
    const admin = adminAuth(req);
    requireAdminRole(admin, ['owner']);
    const b = await body(req);
    const current = db.digirupee.config;
    const rates = b.rates || {};
    const limits = b.limits || {};
    const channels = b.channels || {};
    const upi = rateToPaise(rates.upi === undefined ? current.rates.upi : rates.upi);
    const bank = rateToPaise(rates.bank === undefined ? current.rates.bank : rates.bank);
    const upiMinUsdt = validDigiAmount(limits.upiMinUsdt === undefined ? current.limits.upiMinUsdt : limits.upiMinUsdt, 0.000001, 1_000_000);
    const bankMinUsdt = validDigiAmount(limits.bankMinUsdt === undefined ? current.limits.bankMinUsdt : limits.bankMinUsdt, 0.000001, 1_000_000);
    const globalMaxUsdt = validDigiAmount(limits.globalMaxUsdt === undefined ? current.limits.globalMaxUsdt : limits.globalMaxUsdt, 0.000001, 1_000_000);
    const quoteValiditySeconds = Number(b.quoteValiditySeconds === undefined ? current.quoteValiditySeconds : b.quoteValiditySeconds);
    const nextChannels = {
      upi: channels.upi === undefined ? !!current.channels.upi : channels.upi === true,
      bank: channels.bank === undefined ? !!current.channels.bank : channels.bank === true
    };
    if ([upi, bank, upiMinUsdt, bankMinUsdt, globalMaxUsdt].some(value => value === null)) return send(res, 400, { error: 'Rates and limits must be positive numbers' });
    if (upiMinUsdt > globalMaxUsdt || bankMinUsdt > globalMaxUsdt) return send(res, 400, { error: 'Channel minimum cannot exceed the global maximum' });
    if (!Number.isInteger(quoteValiditySeconds) || quoteValiditySeconds < 60 || quoteValiditySeconds > 86_400) return send(res, 400, { error: 'Quote validity must be between 60 and 86400 seconds' });
    if (!nextChannels.upi && !nextChannels.bank) return send(res, 400, { error: 'At least one selling channel must be enabled' });

    current.rates = { upi: formatInrPaise(upi), bank: formatInrPaise(bank) };
    current.limits = { upiMinUsdt, bankMinUsdt, globalMaxUsdt };
    current.quoteValiditySeconds = quoteValiditySeconds;
    current.channels = nextChannels;
    current.updatedAt = Date.now();
    appendDigiAudit({
      actorType: 'admin', actorId: admin.email, action: 'rates.updated', entityType: 'digirupee-config', entityId: 'rates',
      details: { rates: current.rates, limits: current.limits, quoteValiditySeconds, channels: current.channels }
    });
    await persist();
    return send(res, 200, { config: publicDigiConfig() });
  }

  if (req.method === 'GET' && path === '/admin/audit-log') {
    const admin = adminAuth(req);
    requireAdminRole(admin, ['owner', 'ops', 'support']);
    return send(res, 200, { auditLog: db.digirupee.auditLog.slice(-250).reverse() });
  }

  return send(res, 404, { error: 'digiRupee API route not found' });
}

async function api(req, res, path) {
  if (path === '/digirupee' || path.startsWith('/digirupee/')) {
    return digirupeeApi(req, res, path.slice('/digirupee'.length) || '/');
  }

  if (req.method === 'GET' && path === '/config') {
    return send(res, 200, db.config);
  }

  if (req.method === 'POST' && path === '/admin/login') {
    limitRequest(req, 'admin-login', 8, 15 * 60 * 1000);
    if (production && !adminConfigured) {
      return send(res, 503, { error: 'Admin credentials are not configured on the server' });
    }
    const b = await body(req);
    const email = String(b.email || '').trim().toLowerCase();
    const password = String(b.password || '');
    const admin = findAdmin(email);
    if (!admin || !verifyAdminPassword(admin, password)) {
      return send(res, 401, { error: 'Invalid admin credentials' });
    }
    if (!verifyAdminMfa(admin, b.mfaCode)) {
      return send(res, 401, { error: 'Admin MFA code required' });
    }
    appendAudit({ actorType: 'admin', actorId: email, action: 'admin.login', entityType: 'session', entityId: email, details: { role: admin.role, mfa: !!admin.mfaCode } });
    const token = makeAdminSession(admin);
    await persist();
    return send(res, 200, { token, expiresIn: adminSessionMaxAge, admin: { email: admin.email, role: admin.role, mfaEnabled: !!admin.mfaCode } }, { 'Set-Cookie': adminSessionCookie(req, token) });
  }

  if (req.method === 'POST' && path === '/admin/logout') {
    const token = adminSessionToken(req);
    const admin = adminAuth(req);
    revokeAdminSession(token);
    appendAudit({ actorType: 'admin', actorId: admin.email, action: 'admin.logout', entityType: 'session', entityId: admin.email });
    await persist();
    return send(res, 200, { ok: true }, { 'Set-Cookie': clearAdminSessionCookie(req) });
  }

  if (req.method === 'GET' && path === '/admin/overview') {
    const admin = adminAuth(req);
    return send(res, 200, {
      admin: { email: admin.email, role: admin.role, mfaEnabled: !!admin.mfaCode },
      config: db.config,
      orders: db.orders,
      bankLedger: db.bankLedger.slice(-500).reverse().map(publicBankEntry),
      tickets: db.tickets,
      users: db.users.map(publicUser),
      auditLog: db.auditLog.slice(-250).reverse(),
      auditHealthy: auditHealthy(),
      system: {
        alertingEnabled: !!alertWebhookUrl,
        adminRoles: adminUsers.map(item => ({ email: item.email, role: item.role, mfaEnabled: !!item.mfaCode })),
        bankLedgerEntries: db.bankLedger.length
      }
    });
  }

  if (req.method === 'PATCH' && path === '/admin/config') {
    const admin = adminAuth(req);
    requireAdminRole(admin, ['owner']);
    const b = await body(req);
    const rate = Number(b.rate);
    if (!Number.isFinite(rate) || rate <= 0) return send(res, 400, { error: 'Invalid rate' });
    const minInr = Math.max(1, Number(b.minInr || db.config.minInr));
    const maxInr = Math.max(minInr, Number(b.maxInr || db.config.maxInr || minInr));
    db.config.rate = rate;
    db.config.minInr = minInr;
    db.config.maxInr = maxInr;
    db.config.paymentMode = String(b.paymentMode || db.config.paymentMode || '').trim().slice(0, 120) || defaultData.config.paymentMode;
    const support = b.support || {};
    db.config.support = {
      ...db.config.support,
      label: String(support.label || db.config.support?.label || 'Online').trim().slice(0, 40) || 'Online',
      telegram: String(support.telegram || '').trim().replace(/^https?:\/\/t\.me\//i, '@').slice(0, 80),
      note: String(support.note || db.config.support?.note || '').trim().slice(0, 180)
    };
    const bank = b.bank || {};
    for (const key of ['bank', 'accountName', 'accountNumber', 'ifsc', 'transferTypes']) {
      if (String(bank[key] || '').trim()) db.config.bank[key] = String(bank[key]).trim().slice(0, 120);
    }
    if (Array.isArray(b.currencies) && b.currencies.length) {
      db.config.currencies = b.currencies.slice(0, 12).map(item => ({
        code: String(item.code || '').trim().toUpperCase().slice(0, 8),
        name: String(item.name || '').trim().slice(0, 40),
        symbol: String(item.symbol || '').trim().slice(0, 6),
        status: String(item.status || '').toLowerCase() === 'live' ? 'live' : 'coming-soon',
        note: String(item.note || '').trim().slice(0, 140)
      })).filter(item => item.code && item.name && item.code !== 'USDT');
      for (const code of ['INR', 'USD']) {
        let row = db.config.currencies.find(item => item.code === code);
        if (!row) {
          row = structuredClone(defaultData.config.currencies.find(item => item.code === code));
          db.config.currencies.unshift(row);
        }
        row.status = 'live';
      }
    }
    appendAudit({
      actorType: 'admin', actorId: admin.email, action: 'config.updated', entityType: 'config', entityId: 'purchase',
      details: { rate: db.config.rate, minInr: db.config.minInr, maxInr: db.config.maxInr, bank: db.config.bank.bank, accountNumber: db.config.bank.accountNumber, support: db.config.support.telegram }
    });
    await persist();
    return send(res, 200, { config: db.config });
  }

  if (req.method === 'GET' && path === '/admin/export') {
    const admin = adminAuth(req);
    requireAdminRole(admin, ['owner']);
    appendAudit({ actorType: 'admin', actorId: admin.email, action: 'backup.exported', entityType: 'backup', entityId: 'runtime' });
    await persist();
    return send(res, 200, backupSnapshot(), {
      'Content-Disposition': `attachment; filename="loktron-backup-${new Date().toISOString().slice(0, 10)}.json"`
    });
  }

  if (req.method === 'POST' && path === '/admin/bank-ledger/import') {
    const admin = adminAuth(req);
    requireAdminRole(admin, ['owner', 'ops']);
    const b = await body(req, 700_000);
    const rawEntries = Array.isArray(b.entries) ? b.entries : [];
    if (!rawEntries.length || rawEntries.length > 500) return send(res, 400, { error: 'Upload 1 to 500 bank ledger entries' });
    let imported = 0;
    let skipped = 0;
    for (const raw of rawEntries) {
      const parsed = parseBankEntry(raw);
      if (!parsed) { skipped += 1; continue; }
      const duplicate = db.bankLedger.find(entry => entry.normalizedReference === parsed.normalizedReference && Math.abs(Number(entry.amount) - parsed.amount) <= 1);
      if (duplicate) { skipped += 1; continue; }
      db.bankLedger.push({
        id: 'BL-' + randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase(),
        ...parsed,
        status: 'unmatched',
        importedAt: Date.now(),
        importedBy: admin.email
      });
      imported += 1;
    }
    const matchedOrderIds = await autoMatchBankLedger(admin);
    appendAudit({ actorType: 'admin', actorId: admin.email, action: 'bank_ledger.imported', entityType: 'bank-ledger', entityId: 'batch', details: { imported, skipped, matched: matchedOrderIds.length } });
    await emitAlert('bank_ledger.imported', { imported, skipped, matched: matchedOrderIds.length });
    await persist();
    return send(res, 200, { imported, skipped, matched: matchedOrderIds.length, matchedOrderIds, bankLedger: db.bankLedger.slice(-500).reverse().map(publicBankEntry) });
  }

  if (req.method === 'POST' && /^\/admin\/orders\/[A-Za-z0-9-]+\/verify-payment$/.test(path)) {
    const admin = adminAuth(req);
    requireAdminRole(admin, ['owner', 'ops']);
    const id = path.split('/').at(-2);
    const b = await body(req);
    const order = db.orders.find(x => x.id === id);
    if (!order) return send(res, 404, { error: 'Order not found' });
    if (order.status !== 'Under Review') return send(res, 409, { error: `Order is already ${order.status}` });
    const bankReference = String(b.bankReference || order.utr || '').trim().slice(0, 80);
    const note = String(b.note || '').trim().slice(0, 300);
    if (bankReference.length < 6) return send(res, 400, { error: 'Enter the verified bank reference' });
    order.status = 'Payment Verified';
    order.paymentVerification = { bankReference, note, verifiedAt: Date.now(), verifiedBy: admin.email };
    order.updatedAt = Date.now();
    db.notifications.unshift({
      id: randomUUID(),
      userId: order.userId,
      title: 'Payment verified',
      text: `${order.id} payment is verified and queued for USDT delivery.`,
      time: 'Just now'
    });
    appendAudit({ actorType: 'admin', actorId: admin.email, action: 'order.payment_verified', entityType: 'order', entityId: order.id, details: { bankReference, note } });
    await emitAlert('order.payment_verified', { orderId: order.id, inr: order.inr, utr: order.utr, verifiedBy: admin.email });
    await persist();
    return send(res, 200, { order });
  }

  if (req.method === 'POST' && /^\/admin\/orders\/[A-Za-z0-9-]+\/settle$/.test(path)) {
    const admin = adminAuth(req);
    requireAdminRole(admin, ['owner', 'ops']);
    const id = path.split('/').at(-2);
    const b = await body(req);
    const order = db.orders.find(x => x.id === id);
    if (!order) return send(res, 404, { error: 'Order not found' });
    if (order.status !== 'Payment Verified') return send(res, 409, { error: 'Verify the INR payment before settlement' });
    const txId = String(b.txId || '').trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(txId)) return send(res, 400, { error: 'Enter a valid 64-character TRON transaction ID' });
    if (db.orders.some(x => x.id !== order.id && x.settlement?.txId === txId)) return send(res, 409, { error: 'This transaction ID is already attached to another order' });
    const chainVerification = await verifyUsdtTransfer(order, txId);
    order.status = 'USDT Sent';
    order.settlement = { txId, network: db.config.network, recordedAt: Date.now(), recordedBy: admin.email, verification: chainVerification };
    order.updatedAt = Date.now();
    db.notifications.unshift({ id: randomUUID(), userId: order.userId, title: 'USDT sent', text: `${order.id} was settled on ${db.config.network}.`, time: 'Just now' });
    appendAudit({ actorType: 'admin', actorId: admin.email, action: 'order.settled', entityType: 'order', entityId: order.id, details: { txId, wallet: order.wallet, usdt: order.usdt, network: db.config.network, verification: chainVerification.mode } });
    await emitAlert('order.settled', { orderId: order.id, usdt: order.usdt, txId, wallet: order.wallet, recordedBy: admin.email });
    await persist();
    return send(res, 200, { order });
  }

  if (req.method === 'POST' && /^\/admin\/orders\/[A-Za-z0-9-]+\/reject$/.test(path)) {
    const admin = adminAuth(req);
    requireAdminRole(admin, ['owner', 'ops']);
    const id = path.split('/').at(-2);
    const b = await body(req);
    const order = db.orders.find(x => x.id === id);
    if (!order) return send(res, 404, { error: 'Order not found' });
    if (!['Under Review', 'Payment Verified'].includes(order.status)) return send(res, 409, { error: `Order cannot be rejected from ${order.status}` });
    const reason = String(b.reason || '').trim().slice(0, 300);
    if (reason.length < 5) return send(res, 400, { error: 'Enter a rejection reason' });
    order.status = 'Rejected';
    order.rejection = { reason, rejectedAt: Date.now(), rejectedBy: admin.email };
    order.updatedAt = Date.now();
    db.notifications.unshift({ id: randomUUID(), userId: order.userId, title: 'Order needs attention', text: `${order.id}: ${reason}`, time: 'Just now' });
    appendAudit({ actorType: 'admin', actorId: admin.email, action: 'order.rejected', entityType: 'order', entityId: order.id, details: { reason } });
    await emitAlert('order.rejected', { orderId: order.id, reason, rejectedBy: admin.email });
    await persist();
    return send(res, 200, { order });
  }

  if (req.method === 'GET' && /^\/admin\/orders\/[A-Za-z0-9-]+\/proof$/.test(path)) {
    requireAdminRole(adminAuth(req), ['owner', 'ops']);
    const id = path.split('/').at(-2);
    const order = db.orders.find(x => x.id === id);
    if (!order?.proofFile) return send(res, 404, { error: 'Payment proof not found' });
    const file = join(uploadDir, order.proofFile);
    const data = await readFile(file).catch(() => null);
    if (!data) return send(res, 404, { error: 'Payment proof not found' });
    const type = types[extname(file).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { ...headers(type), 'Cache-Control': 'private, no-store' });
    return res.end(data);
  }

  if (req.method === 'PATCH' && /^\/admin\/tickets\/[A-Za-z0-9-]+$/.test(path)) {
    const admin = adminAuth(req);
    requireAdminRole(admin, ['owner', 'ops', 'support']);
    const id = path.split('/').pop();
    const b = await body(req);
    const ticket = db.tickets.find(x => x.id === id);
    if (!ticket) return send(res, 404, { error: 'Ticket not found' });
    ticket.status = String(b.status || 'Closed').slice(0, 30);
    ticket.updatedAt = Date.now();
    appendAudit({ actorType: 'admin', actorId: admin.email, action: 'ticket.updated', entityType: 'ticket', entityId: ticket.id, details: { status: ticket.status } });
    await persist();
    return send(res, 200, { ticket });
  }

  if (req.method === 'POST' && path === '/auth/login') {
    limitRequest(req, 'user-login', 12, 15 * 60 * 1000);
    const b = await body(req);
    const email = String(b.email || '').trim().toLowerCase();
    const password = String(b.password || '');
    if (!safeEmail(email) || !password) return send(res, 400, { error: 'Enter a valid email and password' });
    const user = db.users.find(x => x.email === email);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return send(res, 401, { error: 'Invalid email or password' });
    }
    if (!String(user.passwordHash || '').startsWith('scrypt$')) {
      user.passwordHash = hashPassword(password);
    }
    appendAudit({ actorType: 'user', actorId: user.id, action: 'user.login', entityType: 'session', entityId: user.id });
    await persist();
    const token = makeSession(user.id);
    return send(res, 200, { user: publicUser(user) }, { 'Set-Cookie': sessionCookie(req, token) });
  }

  if (req.method === 'POST' && path === '/auth/register') {
    limitRequest(req, 'register', 5, 60 * 60 * 1000);
    const b = await body(req);
    const email = String(b.email || '').trim().toLowerCase();
    const password = String(b.password || '');
    const name = String(b.name || '').trim();
    if (!safeEmail(email)) return send(res, 400, { error: 'Enter a valid email address' });
    if (name.length < 2 || name.length > 80) return send(res, 400, { error: 'Enter your full name' });
    if (!validPassword(password)) return send(res, 400, { error: 'Password must be 8 to 128 characters' });
    if (db.users.some(x => x.email === email)) return send(res, 409, { error: 'Account already exists' });

    const user = {
      id: 'usr_' + randomUUID().slice(0, 8),
      email,
      passwordHash: hashPassword(password),
      name,
      mobile: '',
      currency: 'INR',
      wallet: '',
      createdAt: Date.now()
    };
    db.users.push(user);
    db.notifications.unshift({
      id: randomUUID(),
      userId: user.id,
      title: 'Welcome to LOKTRON',
      text: 'Save your receiving wallet before creating your first order.',
      time: 'Just now'
    });
    appendAudit({ actorType: 'user', actorId: user.id, action: 'user.registered', entityType: 'user', entityId: user.id, details: { email: user.email } });
    await persist();
    return send(res, 201, { user: publicUser(user), loginRequired: true });
  }

  if (req.method === 'POST' && path === '/auth/logout') {
    const token = sessionToken(req);
    if (token) {
      revokeLegacySession(token);
      await persist();
    }
    return send(res, 200, { ok: true }, { 'Set-Cookie': clearSessionCookie(req) });
  }

  if (req.method === 'GET' && path === '/me') {
    const { user } = auth(req);
    return send(res, 200, userData(user));
  }

  if (req.method === 'PATCH' && path === '/profile') {
    const { user } = auth(req);
    const b = await body(req);
    const name = String(b.name || '').trim();
    const mobile = String(b.mobile || '').trim();
    const currency = String(b.currency || 'INR');
    if (name.length < 2 || name.length > 80) return send(res, 400, { error: 'Enter a valid name' });
    user.name = name;
    user.mobile = mobile.slice(0, 30);
    const liveFiatCodes = db.config.currencies.filter(item => item.status === 'live' && item.code !== 'USDT').map(item => item.code);
    user.currency = liveFiatCodes.includes(currency) ? currency : 'INR';
    appendAudit({ actorType: 'user', actorId: user.id, action: 'profile.updated', entityType: 'user', entityId: user.id });
    await persist();
    return send(res, 200, { user: publicUser(user) });
  }

  if (req.method === 'PUT' && path === '/wallet') {
    const { user } = auth(req);
    const b = await body(req);
    const wallet = String(b.wallet || '').trim();
    if (!/^T[1-9A-HJ-NP-Za-km-z]{25,40}$/.test(wallet)) {
      return send(res, 400, { error: 'Invalid TRC20 address' });
    }
    const previousWallet = user.wallet || '';
    user.wallet = wallet;
    db.notifications.unshift({
      id: randomUUID(),
      userId: user.id,
      title: 'Wallet saved',
      text: 'Your TRC20 receiving wallet was updated.',
      time: 'Just now'
    });
    appendAudit({ actorType: 'user', actorId: user.id, action: 'wallet.updated', entityType: 'user', entityId: user.id, details: { previousWallet, wallet } });
    await persist();
    return send(res, 200, { wallet });
  }

  if (req.method === 'POST' && path === '/orders') {
    limitRequest(req, 'create-order', 12, 60 * 60 * 1000);
    const { user } = auth(req);
    const b = await body(req);
    if (!user.wallet) return send(res, 400, { error: 'Save your wallet before creating an order' });

    const inr = Number(b.inr);
    const paid = Number(b.paid);
    const utr = String(b.utr || '').trim();
    const proof = b.proof || {};
    const idempotencyKey = String(req.headers['idempotency-key'] || '').trim();

    if (!/^[A-Za-z0-9_-]{16,100}$/.test(idempotencyKey)) return send(res, 400, { error: 'A valid Idempotency-Key header is required' });
    const existing = db.orders.find(o => o.userId === user.id && o.idempotencyKey === idempotencyKey);
    if (existing) return send(res, 200, { order: publicOrder(existing), replayed: true });

    if (!Number.isFinite(inr) || inr < db.config.minInr) return send(res, 400, { error: `Minimum order is ₹${db.config.minInr}` });
    if (Number.isFinite(Number(db.config.maxInr)) && inr > Number(db.config.maxInr)) return send(res, 400, { error: `Maximum order is ₹${db.config.maxInr}` });
    if (Math.abs(inr - paid) > 1) return send(res, 400, { error: 'Paid amount must match order amount' });
    if (!/^[A-Za-z0-9-]{6,40}$/.test(utr)) return send(res, 400, { error: 'Invalid UTR / reference' });
    if (db.orders.some(o => String(o.utr).toLowerCase() === utr.toLowerCase())) return send(res, 409, { error: 'This UTR has already been submitted' });
    if (!/^image\/(png|jpeg|jpg|webp)$/.test(String(proof.type || '')) || !proof.data) return send(res, 400, { error: 'Valid payment proof image is required' });

    const raw = Buffer.from(String(proof.data), 'base64');
    if (raw.length > 2.5 * 1024 * 1024) return send(res, 413, { error: 'Proof image must be under 2.5 MB' });
    if (raw.length < 64 || !validProof(raw, String(proof.type || ''))) return send(res, 400, { error: 'Payment proof file content is invalid' });

    await mkdir(uploadDir, { recursive: true });
    const id = 'LK-' + randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase();
    const file = id + proofExt(proof.type);
    await writeFile(join(uploadDir, file), raw);

    const order = {
      id,
      userId: user.id,
      date: Date.now(),
      inr,
      paid,
      rate: db.config.rate,
      usdt: Number((inr / db.config.rate).toFixed(6)),
      utr,
      wallet: user.wallet,
      status: 'Under Review',
      proofFile: file,
      bankSnapshot: structuredClone(db.config.bank),
      configSnapshot: {
        rate: db.config.rate,
        network: db.config.network,
        minInr: db.config.minInr,
        maxInr: db.config.maxInr,
        paymentMode: db.config.paymentMode
      },
      idempotencyKey,
      updatedAt: Date.now()
    };

    db.orders.unshift(order);
    db.notifications.unshift({
      id: randomUUID(),
      userId: user.id,
      title: 'Payment submitted',
      text: `${id} is under review.`,
      time: 'Just now'
    });
    appendAudit({ actorType: 'user', actorId: user.id, action: 'order.created', entityType: 'order', entityId: order.id, details: { inr, usdt: order.usdt, utr, wallet: order.wallet, rate: order.rate } });
    await persist();
    console.log('ADMIN ALERT', JSON.stringify({ order: id, user: user.email, inr, utr }));
    return send(res, 201, { order: publicOrder(order) });
  }

  if (req.method === 'POST' && path === '/support') {
    limitRequest(req, 'support', 10, 60 * 60 * 1000);
    const { user } = auth(req);
    const b = await body(req);
    const text = String(b.text || '').trim();
    const type = String(b.type || 'General support');
    const orderId = String(b.orderId || '').trim();

    if (text.length < 10) return send(res, 400, { error: 'Please provide more detail' });
    if (orderId && !db.orders.some(o => o.id === orderId && o.userId === user.id)) {
      return send(res, 400, { error: 'Order ID not found' });
    }

    const ticket = {
      id: 'SUP-' + String(Date.now()).slice(-6),
      userId: user.id,
      type: text ? type : 'General support',
      text,
      orderId,
      status: 'Open',
      time: 'Just now',
      createdAt: Date.now()
    };
    db.tickets.unshift(ticket);
    db.notifications.unshift({
      id: randomUUID(),
      userId: user.id,
      title: 'Support ticket created',
      text: `${ticket.id} has been submitted.`,
      time: 'Just now'
    });
    appendAudit({ actorType: 'user', actorId: user.id, action: 'ticket.created', entityType: 'ticket', entityId: ticket.id, details: { type, orderId } });
    await persist();
    return send(res, 201, { ticket });
  }

  return send(res, 404, { error: 'API route not found' });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const requestHost = String(req.headers['x-forwarded-host'] || req.headers.host || '')
      .split(',')[0].trim().toLowerCase().replace(/:\d+$/, '');
    const isDigiRupeeHost = ['digirupee.loktron.com', 'emoney-production-3e0a.up.railway.app'].includes(requestHost);
    const isDigiRupeeClient = /\bdigiRupee\/[0-9.]+/i.test(String(req.headers['user-agent'] || ''));

    if (url.pathname === '/health' || url.pathname === '/ready') {
      const persistenceConfigured = !!(supabaseUrl && supabaseSecretKey && persistenceSecret);
      const chainConfigurationReady = tronVerifyMode === 'required' && !!tronApiKey && isValidTronAddress(tronUsdtContract);
      const twoFactorEncryptionConfigured = !!digiTwoFactorEncryptionKey;
      const productionConfigurationReady = !!process.env.SESSION_SECRET
        && adminConfigured
        && persistenceConfigured
        && chainConfigurationReady
        && twoFactorEncryptionConfigured;
      const ready = auditHealthy() && (!production || productionConfigurationReady);
      const strict = url.pathname === '/ready';
      return send(res, strict && !ready ? 503 : 200, {
        ok: true,
        ready,
        service: 'loktron-web',
        api: true,
        auth: 'signed-cookie-session',
        audit: auditHealthy() ? 'valid' : 'invalid',
        settlementVerification: tronVerifyMode,
        productionConfiguration: production ? (ready ? 'ready' : 'incomplete') : 'development',
        adminMfa: adminUsers.some(item => item.mfaCode) ? 'enabled' : 'not-configured',
        alerting: alertWebhookUrl ? 'enabled' : 'not-configured',
        bankLedgerEntries: db.bankLedger.length,
        checks: {
          sessionSecret: !!process.env.SESSION_SECRET,
          adminConfigured,
          persistenceConfigured,
          twoFactorEncryptionConfigured,
          tronRequired: tronVerifyMode === 'required',
          tronApiKeyConfigured: !!tronApiKey,
          tronContractConfigured: isValidTronAddress(tronUsdtContract),
          auditHealthy: auditHealthy()
        }
      });
    }

    if (url.pathname.startsWith('/api/')) {
      limitRequest(req, 'api', 240, 60 * 1000);
      assertSameOrigin(req);
      return await api(req, res, url.pathname.slice(4));
    }

    if (url.pathname.startsWith('/uploads/')) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }

    const pathname = decodeURIComponent(url.pathname);
    const digiStaticFiles = new Set([
      '/digirupee-app.html',
      '/digirupee-app.js',
      '/digirupee-qr.js',
      '/digirupee-rewards.js',
      '/digirupee-rewards-assets.js',
      '/digirupee-layout-v3.js'
    ]);
    const digiPageAliases = new Map([
      ['/', 'digirupee-download.html'],
      ['/download', 'digirupee-download.html'],
      ['/admin', 'digirupee-admin.html']
    ]);
    let hostRelativePath = '';

    if (isDigiRupeeHost && ['/download/digirupee.apk', '/download/emoney.apk'].includes(pathname)) {
      await recordDigiPendingReferralInstall(req, url.searchParams.get('ref'));
      const candidates = pathname.endsWith('/emoney.apk')
        ? [
            join(root, '..', 'dist', 'eMoney.apk'),
            join(root, '..', 'dist', 'eMoney-debug.apk')
          ]
        : [
            join(root, '..', 'dist', 'digiRupee.apk'),
            join(root, '..', 'dist', 'eMoney.apk'),
            join(root, '..', 'dist', 'digiRupee-debug.apk'),
            join(root, '..', 'dist', 'eMoney-debug.apk')
          ];
      for (const candidate of candidates) {
        try {
          const apk = await readFile(candidate);
          res.writeHead(200, {
            'Content-Type': 'application/vnd.android.package-archive',
            'Content-Disposition': `attachment; filename="${pathname.endsWith('/emoney.apk') ? 'eMoney' : 'digiRupee'}.apk"`,
            'Content-Length': String(apk.length),
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff'
          });
          return res.end(apk);
        } catch {
          // Try the next installable build.
        }
      }
      return send(res, 503, { error: 'eMoney APK is being prepared. Please try again shortly.' });
    }

    const legacyAdminPath = pathname === '/admin/' || pathname === '/admin.html' || pathname === '/digirupee-admin.html';
    if (legacyAdminPath) {
      res.writeHead(308, { Location: '/admin', 'Cache-Control': 'no-store' });
      return res.end();
    }

    if (isDigiRupeeHost) {
      hostRelativePath = digiPageAliases.get(pathname) || '';
      if (!hostRelativePath && digiStaticFiles.has(pathname) && isDigiRupeeClient) {
        hostRelativePath = pathname.replace(/^\/+/, '');
      }
      if (!hostRelativePath) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.end('Not found');
      }
    } else if (pathname === '/admin') {
      hostRelativePath = 'admin.html';
    } else if (digiStaticFiles.has(pathname) || pathname === '/digirupee-admin.html') {
      if (pathname === '/digirupee-app.html' && isDigiRupeeClient) {
        res.writeHead(307, { Location: 'https://digirupee.loktron.com/digirupee-app.html', 'Cache-Control': 'no-store' });
        return res.end();
      }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end('Not found');
    }

    if (/^(?:\/runtime-data\.json|\/\.env(?:\.|$)|\/.*(?:\.tmp|\.bak)$|\/server\.mjs$|\/persistent-start\.mjs$|\/package\.json$|\/uploads(?:\/|$)|\/apk(?:\/|$)|\/.*\.apk$)/i.test(pathname)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end('Not found');
    }
    const nestedAsset = pathname.indexOf('/assets/');
    let rel = hostRelativePath || (nestedAsset >= 0
      ? pathname.slice(nestedAsset + 1)
      : pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, ''));
    rel = normalize(rel);
    const protectedRelativePath = rel.replace(/\\/g, '/');
    if (/^(?:runtime-data\.json|\.env(?:\.|$)|.*(?:\.tmp|\.bak)$|server\.mjs$|persistent-start\.mjs$|package\.json$|uploads(?:\/|$)|apk(?:\/|$)|.*\.apk$)/i.test(protectedRelativePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end('Not found');
    }
    let file = join(root, rel);
    const normalizedRoot = normalize(root).replace(/[\\/]+$/, '');
    if (file !== normalizedRoot && !file.startsWith(`${normalizedRoot}\\`) && !file.startsWith(`${normalizedRoot}/`)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end('Not found');
    }

    try {
      if (!(await stat(file)).isFile()) throw new Error('not-file');
      const data = await readFile(file);
      const type = types[extname(file).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, headers(type));
      return res.end(data);
    } catch {
      await ensureIndexFile();
      const index = await readFile(indexFile);
      res.writeHead(200, headers('text/html; charset=utf-8'));
      return res.end(index);
    }
  } catch (error) {
    if (!error.status || error.status >= 500) console.error(error);
    const extra = error.retryAfter ? { 'Retry-After': String(error.retryAfter) } : {};
    return send(res, error.status || 500, { error: error.status ? error.message : 'Internal server error' }, extra);
  }
});

const loktronBootStateChanged = ensureLoktronFiatCurrencies();
const digiBootStateChanged = [
  ensureDigiReferralCodes(),
  ensureDigiWheelDefaults(),
  ensureDigiAddressAssignments(),
  ensureDigiSecurityFields(),
  ensureDigiSessionFields()
].some(Boolean);
if (loktronBootStateChanged || digiBootStateChanged) await persist();

server.listen(port, '0.0.0.0', () => {
  console.log(`LOKTRON website listening on ${port}`);
  startDigiMonitor();
});
