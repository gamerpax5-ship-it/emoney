import http from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
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
const dataFile = join(root, 'runtime-data.json');
const uploadDir = join(root, 'uploads');
const sessionSecret = String(process.env.SESSION_SECRET || randomBytes(48).toString('hex'));
const sessionMaxAge = 60 * 60 * 24 * 7;

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
  tickets: [],
  notifications: [{
    id: 'n1',
    userId: 'usr_demo',
    title: 'Welcome to LOKTRON',
    text: 'Save your USDT wallet address before creating your first Buy order.',
    time: 'Today'
  }]
};

let db = await loadDb();
const adminSessions = new Set();
const adminEmail = String(process.env.ADMIN_EMAIL || 'admin@loktron.local').toLowerCase();
const adminPassword = String(process.env.ADMIN_PASSWORD || 'ChangeMe-LOKTRON-2026');

async function loadDb() {
  try {
    const parsed = JSON.parse(await readFile(dataFile, 'utf8'));
    return {
      ...structuredClone(defaultData),
      ...parsed,
      config: { ...structuredClone(defaultData.config), ...(parsed.config || {}) },
      users: Array.isArray(parsed.users) ? parsed.users : [],
      orders: Array.isArray(parsed.orders) ? parsed.orders : [],
      tickets: Array.isArray(parsed.tickets) ? parsed.tickets : [],
      notifications: Array.isArray(parsed.notifications) ? parsed.notifications : []
    };
  } catch {
    return structuredClone(defaultData);
  }
}

async function persist() {
  try {
    await writeFile(dataFile, JSON.stringify(db, null, 2), 'utf8');
  } catch (error) {
    console.error('persist failed', error.message);
  }
}

function send(res, status, data, extra = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
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
  const secure = String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https' ? '; Secure' : '';
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
  if (!adminSessions.has(token)) {
    throw Object.assign(new Error('Admin authentication required'), { status: 401 });
  }
  return token;
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
    orders: db.orders.filter(o => o.userId === u.id).sort((a, b) => b.date - a.date),
    tickets: db.tickets.filter(t => t.userId === u.id).sort((a, b) => b.createdAt - a.createdAt),
    notifications: db.notifications.filter(n => n.userId === u.id).slice(0, 30)
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
    const b = await body(req);
    const email = String(b.email || '').trim().toLowerCase();
    const password = String(b.password || '');
    if (email !== adminEmail || password !== adminPassword) {
      return send(res, 401, { error: 'Invalid admin credentials' });
    }
    const token = randomBytes(32).toString('hex');
    adminSessions.add(token);
    return send(res, 200, { token });
  }

  if (req.method === 'POST' && path === '/admin/logout') {
    const token = adminAuth(req);
    adminSessions.delete(token);
    return send(res, 200, { ok: true });
  }

  if (req.method === 'GET' && path === '/admin/overview') {
    adminAuth(req);
    return send(res, 200, {
      config: db.config,
      orders: db.orders,
      tickets: db.tickets,
      users: db.users.map(publicUser)
    });
  }

  if (req.method === 'PATCH' && path === '/admin/config') {
    adminAuth(req);
    const b = await body(req);
    const rate = Number(b.rate);
    if (!Number.isFinite(rate) || rate <= 0) return send(res, 400, { error: 'Invalid rate' });
    db.config.rate = rate;
    db.config.minInr = Math.max(1, Number(b.minInr || db.config.minInr));
    const bank = b.bank || {};
    for (const key of ['bank', 'accountName', 'accountNumber', 'ifsc', 'transferTypes']) {
      if (String(bank[key] || '').trim()) db.config.bank[key] = String(bank[key]).trim().slice(0, 120);
    }
    await persist();
    return send(res, 200, { config: db.config });
  }

  if (req.method === 'PATCH' && /^\/admin\/orders\/[A-Za-z0-9-]+$/.test(path)) {
    adminAuth(req);
    const id = path.split('/').pop();
    const b = await body(req);
    const order = db.orders.find(x => x.id === id);
    if (!order) return send(res, 404, { error: 'Order not found' });
    const status = String(b.status || '');
    if (!['Under Review', 'USDT Sent', 'Rejected'].includes(status)) {
      return send(res, 400, { error: 'Invalid status' });
    }
    order.status = status;
    order.updatedAt = Date.now();
    const title = status === 'USDT Sent' ? 'USDT sent' : status === 'Rejected' ? 'Order needs attention' : 'Order under review';
    db.notifications.unshift({
      id: randomUUID(),
      userId: order.userId,
      title,
      text: `${order.id} status changed to ${status}.`,
      time: 'Just now'
    });
    await persist();
    return send(res, 200, { order });
  }

  if (req.method === 'PATCH' && /^\/admin\/tickets\/[A-Za-z0-9-]+$/.test(path)) {
    adminAuth(req);
    const id = path.split('/').pop();
    const b = await body(req);
    const ticket = db.tickets.find(x => x.id === id);
    if (!ticket) return send(res, 404, { error: 'Ticket not found' });
    ticket.status = String(b.status || 'Closed').slice(0, 30);
    await persist();
    return send(res, 200, { ticket });
  }

  if (req.method === 'POST' && path === '/auth/login') {
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
      await persist();
    }
    const token = makeSession(user.id);
    return send(res, 200, { user: publicUser(user) }, { 'Set-Cookie': sessionCookie(req, token) });
  }

  if (req.method === 'POST' && path === '/auth/register') {
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
    await persist();
    const token = makeSession(user.id);
    return send(res, 201, { user: publicUser(user) }, { 'Set-Cookie': sessionCookie(req, token) });
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
    user.wallet = wallet;
    db.notifications.unshift({
      id: randomUUID(),
      userId: user.id,
      title: 'Wallet saved',
      text: 'Your TRC20 receiving wallet was updated.',
      time: 'Just now'
    });
    await persist();
    return send(res, 200, { wallet });
  }

  if (req.method === 'POST' && path === '/orders') {
    const { user } = auth(req);
    const b = await body(req);
    if (!user.wallet) return send(res, 400, { error: 'Save your wallet before creating an order' });

    const inr = Number(b.inr);
    const paid = Number(b.paid);
    const utr = String(b.utr || '').trim();
    const proof = b.proof || {};

    if (!Number.isFinite(inr) || inr < db.config.minInr) return send(res, 400, { error: `Minimum order is ₹${db.config.minInr}` });
    if (Math.abs(inr - paid) > 1) return send(res, 400, { error: 'Paid amount must match order amount' });
    if (!/^[A-Za-z0-9-]{6,40}$/.test(utr)) return send(res, 400, { error: 'Invalid UTR / reference' });
    if (db.orders.some(o => o.utr === utr)) return send(res, 409, { error: 'This UTR has already been submitted' });
    if (!/^image\/(png|jpeg|jpg|webp)$/.test(String(proof.type || '')) || !proof.data) return send(res, 400, { error: 'Valid payment proof image is required' });

    const raw = Buffer.from(String(proof.data), 'base64');
    if (raw.length > 2.5 * 1024 * 1024) return send(res, 413, { error: 'Proof image must be under 2.5 MB' });

    await mkdir(uploadDir, { recursive: true });
    const id = 'LK-' + String(Date.now()).slice(-7);
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
      bankSnapshot: structuredClone(db.config.bank)
    };

    db.orders.unshift(order);
    db.notifications.unshift({
      id: randomUUID(),
      userId: user.id,
      title: 'Payment submitted',
      text: `${id} is under review.`,
      time: 'Just now'
    });
    await persist();
    console.log('ADMIN ALERT', JSON.stringify({ order: id, user: user.email, inr, utr }));
    return send(res, 201, { order });
  }

  if (req.method === 'POST' && path === '/support') {
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
    await persist();
    return send(res, 201, { ticket });
  }

  return send(res, 404, { error: 'API route not found' });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (url.pathname === '/health') {
      return send(res, 200, { ok: true, service: 'loktron-web', api: true, auth: 'cookie-session' });
    }

    if (url.pathname.startsWith('/api/')) {
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
    return send(res, error.status || 500, { error: error.status ? error.message : 'Internal server error' });
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`LOKTRON website listening on ${port}`);
});
