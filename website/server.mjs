import http from 'node:http';
import { readFile, stat, mkdir, writeFile, rename } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  randomBytes,
  randomUUID,
  createHash,
  createHmac,
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
const configuredOrigins = String(process.env.PUBLIC_ORIGIN || '')
  .split(',')
  .map(v => v.trim().replace(/\/$/, ''))
  .filter(Boolean);
const tronApiUrl = String(process.env.TRON_API_URL || 'https://api.trongrid.io').replace(/\/$/, '');
const tronApiKey = String(process.env.TRONGRID_API_KEY || '');
const tronUsdtContract = String(process.env.TRON_USDT_CONTRACT || 'TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj');
const tronVerifyMode = String(process.env.TRON_VERIFY_MODE || (production ? 'required' : 'manual')).toLowerCase();
const alertWebhookUrl = String(process.env.ALERT_WEBHOOK_URL || '').trim();

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
      { code: 'INR', name: 'Indian Rupee', symbol: '₹', status: 'live', note: 'Bank transfer, IMPS, NEFT and RTGS purchase orders enabled.' },
      { code: 'USD', name: 'US Dollar', symbol: '$', status: 'coming-soon', note: 'Additional purchase rails will appear when activated.' },
      { code: 'EUR', name: 'Euro', symbol: '€', status: 'coming-soon', note: 'European payment options are planned for future rollout.' },
      { code: 'GBP', name: 'British Pound', symbol: '£', status: 'coming-soon', note: 'UK banking and pricing will appear when available.' },
      { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ', status: 'coming-soon', note: 'Gulf payment rails are prepared for future rollout.' },
      { code: 'USDT', name: 'Tether USD', symbol: '₮', status: 'coming-soon', note: 'Crypto-side purchase and settlement options will appear when activated.' }
    ],
    bank: {
      bank: 'HDFC Bank',
      accountName: 'LOKTRON SERVICES',
      accountNumber: 'XXXX XXXX 4582',
      ifsc: 'HDFC0001234',
      transferTypes: 'IMPS / NEFT / RTGS'
    }
  },
  users: [{
    id: 'usr_demo',
    email: 'demo@loktron.com',
    passwordHash: legacyHash('12345678'),
    name: 'Demo User',
    mobile: '+91 98765 43210',
    currency: 'INR',
    wallet: '',
    createdAt: Date.now()
  }],
  orders: [],
  bankLedger: [],
  tickets: [],
  auditLog: [],
  notifications: [{
    id: 'n1',
    userId: 'usr_demo',
    title: 'Welcome to LOKTRON',
    text: 'Save your USDT wallet address before creating your first Buy order.',
    time: 'Today'
  }]
};

let db = await loadDb();
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
      auditLog: Array.isArray(parsed.auditLog) ? parsed.auditLog : []
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
  const payload = Buffer.from(JSON.stringify({
    email: admin.email,
    role: admin.role,
    exp: Date.now() + adminSessionMaxAge * 1000
  })).toString('base64url');
  const sig = createHmac('sha256', sessionSecret).update(`admin:${payload}`).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyAdminSession(token) {
  try {
    const [payload, sig] = String(token || '').split('.');
    if (!payload || !sig) return '';
    const expected = createHmac('sha256', sessionSecret).update(`admin:${payload}`).digest();
    const actual = Buffer.from(sig, 'base64url');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return '';
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.email || Number(data.exp) < Date.now()) return '';
    const admin = findAdmin(data.email);
    if (!admin || admin.role !== data.role) return '';
    return admin;
  } catch {
    return null;
  }
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
    return String(data.uid);
  } catch {
    return '';
  }
}

function sessionToken(req) {
  return readCookies(req).loktron_session || bearer(req);
}

function sessionCookie(req, token, maxAge = sessionMaxAge) {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  const secure = forwardedProto === 'https' ? '; Secure' : '';
  return `loktron_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function clearSessionCookie(req) {
  return sessionCookie(req, '', 0);
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
  const token = bearer(req);
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
      })).filter(item => safeEmail(item.email) && (item.password || item.passwordHash || (!production && index === 0)));
    } catch (error) {
      console.error('ADMIN_USERS is invalid JSON:', error.message);
      return [];
    }
  }
  const email = String(process.env.ADMIN_EMAIL || (production ? '' : 'admin@loktron.local')).trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || (production ? '' : 'ChangeMe-LOKTRON-2026'));
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
    'Cache-Control': type.startsWith('image/') ? 'public, max-age=86400' : 'no-cache',
    'Content-Security-Policy': "default-src 'self' data: blob:; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'self'"
  };
}

async function api(req, res, path) {
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
    await persist();
    return send(res, 200, { token: makeAdminSession(admin), expiresIn: adminSessionMaxAge, admin: { email: admin.email, role: admin.role, mfaEnabled: !!admin.mfaCode } });
  }

  if (req.method === 'POST' && path === '/admin/logout') {
    const admin = adminAuth(req);
    appendAudit({ actorType: 'admin', actorId: admin.email, action: 'admin.logout', entityType: 'session', entityId: admin.email });
    await persist();
    return send(res, 200, { ok: true });
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
      })).filter(item => item.code && item.name);
      if (!db.config.currencies.some(item => item.code === 'INR')) db.config.currencies.unshift(structuredClone(defaultData.config.currencies[0]));
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
    user.currency = ['INR'].includes(currency) ? currency : 'INR';
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

    if (url.pathname === '/health' || url.pathname === '/ready') {
      const persistenceConfigured = !!(process.env.LOKTRON_SUPABASE_URL && process.env.LOKTRON_SUPABASE_KEY && process.env.LOKTRON_PERSISTENCE_SECRET);
      const ready = auditHealthy() && (!production || (!!process.env.SESSION_SECRET && adminConfigured && persistenceConfigured && tronVerifyMode === 'required'));
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
          tronRequired: tronVerifyMode === 'required',
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
    let rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    rel = normalize(rel).replace(/^(\.\.[/\\])+/, '');
    let file = join(root, rel);

    try {
      if (!(await stat(file)).isFile()) throw new Error('not-file');
      const data = await readFile(file);
      const type = types[extname(file).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, headers(type));
      return res.end(data);
    } catch {
      const index = await readFile(join(root, 'index.html'));
      res.writeHead(200, headers('text/html; charset=utf-8'));
      return res.end(index);
    }
  } catch (error) {
    if (!error.status || error.status >= 500) console.error(error);
    const extra = error.retryAfter ? { 'Retry-After': String(error.retryAfter) } : {};
    return send(res, error.status || 500, { error: error.status ? error.message : 'Internal server error' }, extra);
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`LOKTRON website listening on ${port}`);
});
