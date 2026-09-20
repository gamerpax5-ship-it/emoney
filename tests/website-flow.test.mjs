import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

async function waitFor(url, child) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Server exited with ${child.exitCode}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Server did not become ready');
}

test('complete user, verification and settlement flow', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'loktron-test-'));
  const receivingWallet = 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8';
  const tronServer = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: [{
      event_name: 'Transfer',
      contract_address: 'TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj',
      block_number: 76543210,
      block_timestamp: Date.now(),
      result: { to: receivingWallet, value: '100000000' }
    }] }));
  });
  await new Promise(resolve => tronServer.listen(0, '127.0.0.1', resolve));
  const tronPort = tronServer.address().port;
  const port = 42000 + Math.floor(Math.random() * 1000);
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['website/server.mjs'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      LOKTRON_DATA_DIR: dataDir,
      SESSION_SECRET: 'test-session-secret-that-is-long-and-stable',
      ADMIN_EMAIL: 'admin@example.com',
      ADMIN_PASSWORD: 'Strong-Test-Password-2026',
      ADMIN_MFA_CODE: '246810',
      TRON_VERIFY_MODE: 'required',
      TRON_API_URL: `http://127.0.0.1:${tronPort}`
    }
  });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  t.after(async () => {
    child.kill('SIGTERM');
    await new Promise(resolve => child.once('exit', resolve));
    await new Promise(resolve => tronServer.close(resolve));
    await rm(dataDir, { recursive: true, force: true });
    assert.equal(stderr, '');
  });

  await waitFor(`${base}/health`, child);

  const health = await fetch(`${base}/health`).then(response => response.json());
  assert.equal(health.audit, 'valid');
  const logo = await fetch(`${base}/assets/loktron-logo.svg`);
  assert.equal(logo.status, 200);
  assert.equal(logo.headers.get('content-type'), 'image/svg+xml');

  const request = async (path, options = {}) => {
    const response = await fetch(base + path, options);
    let payload = {};
    try { payload = await response.json(); } catch {}
    return { response, payload };
  };

  const registered = await request('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'buyer@example.com', name: 'Test Buyer', password: 'Buyer-Password-2026' })
  });
  assert.equal(registered.response.status, 201);
  assert.equal(registered.payload.loginRequired, true);
  assert.equal(registered.response.headers.get('set-cookie'), null);

  const userLogin = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'buyer@example.com', password: 'Buyer-Password-2026' })
  });
  assert.equal(userLogin.response.status, 200);
  const cookie = userLogin.response.headers.get('set-cookie').split(';')[0];

  const crossSite = await request('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://attacker.example' },
    body: JSON.stringify({ email: 'blocked@example.com', name: 'Blocked User', password: 'Buyer-Password-2026' })
  });
  assert.equal(crossSite.response.status, 403);

  const wallet = await request('/api/wallet', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ wallet: receivingWallet })
  });
  assert.equal(wallet.response.status, 200);

  const orderBody = JSON.stringify({ inr: 11240, paid: 11240, utr: 'UTR123456789', proof: { type: 'image/png', data: png } });
  const missingKey = await request('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: orderBody });
  assert.equal(missingKey.response.status, 400);

  const fakeImage = await request('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie, 'Idempotency-Key': 'invalid-proof-key-123456' },
    body: JSON.stringify({ inr: 11240, paid: 11240, utr: 'UTRFAKE123456', proof: { type: 'image/png', data: Buffer.from('not a real image'.repeat(8)).toString('base64') } })
  });
  assert.equal(fakeImage.response.status, 400);

  const orderHeaders = { 'Content-Type': 'application/json', Cookie: cookie, 'Idempotency-Key': 'test-order-key-123456789' };
  const created = await request('/api/orders', { method: 'POST', headers: orderHeaders, body: orderBody });
  assert.equal(created.response.status, 201);
  assert.equal(created.payload.order.status, 'Under Review');
  assert.equal(created.payload.order.proofFile, undefined);

  const replay = await request('/api/orders', { method: 'POST', headers: orderHeaders, body: orderBody });
  assert.equal(replay.response.status, 200);
  assert.equal(replay.payload.replayed, true);
  assert.equal(replay.payload.order.id, created.payload.order.id);

  const secondOrderBody = JSON.stringify({ inr: 22480, paid: 22480, utr: 'UTR222222222', proof: { type: 'image/png', data: png } });
  const createdByLedger = await request('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie, 'Idempotency-Key': 'test-order-key-222222222' },
    body: secondOrderBody
  });
  assert.equal(createdByLedger.response.status, 201);
  assert.equal(createdByLedger.payload.order.status, 'Under Review');

  const adminMfaMissing = await request('/api/admin/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.com', password: 'Strong-Test-Password-2026' })
  });
  assert.equal(adminMfaMissing.response.status, 401);

  const adminLogin = await request('/api/admin/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.com', password: 'Strong-Test-Password-2026', mfaCode: '246810' })
  });
  assert.equal(adminLogin.response.status, 200);
  const adminHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${adminLogin.payload.token}` };

  const configUpdate = await request('/api/admin/config', {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({
      rate: 102,
      minInr: 1000,
      maxInr: 500000,
      paymentMode: 'IMPS / NEFT',
      support: { label: 'Online', telegram: '@loktron_support', note: 'Telegram support available' },
      bank: {
        bank: 'Test Bank',
        accountName: 'LOKTRON TEST',
        accountNumber: '1234567890',
        ifsc: 'TEST0001234',
        transferTypes: 'IMPS / NEFT'
      },
      currencies: [
        { code: 'INR', name: 'Indian Rupee', symbol: '₹', status: 'live', note: 'INR live' },
        { code: 'USD', name: 'US Dollar', symbol: '$', status: 'coming-soon', note: 'Coming soon' }
      ]
    })
  });
  assert.equal(configUpdate.response.status, 200);
  assert.equal(configUpdate.payload.config.rate, 102);
  assert.equal(configUpdate.payload.config.maxInr, 500000);
  assert.equal(configUpdate.payload.config.support.telegram, '@loktron_support');

  const overMax = await request('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie, 'Idempotency-Key': 'test-order-key-overmax123' },
    body: JSON.stringify({ inr: 500001, paid: 500001, utr: 'UTROVERMAX123', proof: { type: 'image/png', data: png } })
  });
  assert.equal(overMax.response.status, 400);

  const ledgerImport = await request('/api/admin/bank-ledger/import', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ entries: [{ reference: 'UTR222222222', amount: 22480, date: '2026-09-13', note: 'Bank statement credit' }] })
  });
  assert.equal(ledgerImport.response.status, 200);
  assert.equal(ledgerImport.payload.imported, 1);
  assert.equal(ledgerImport.payload.matched, 1);
  assert.deepEqual(ledgerImport.payload.matchedOrderIds, [createdByLedger.payload.order.id]);

  const earlySettle = await request(`/api/admin/orders/${created.payload.order.id}/settle`, {
    method: 'POST', headers: adminHeaders, body: JSON.stringify({ txId: 'a'.repeat(64) })
  });
  assert.equal(earlySettle.response.status, 409);

  const verified = await request(`/api/admin/orders/${created.payload.order.id}/verify-payment`, {
    method: 'POST', headers: adminHeaders, body: JSON.stringify({ bankReference: 'UTR123456789', note: 'Matched in bank statement' })
  });
  assert.equal(verified.response.status, 200);
  assert.equal(verified.payload.order.status, 'Payment Verified');

  const settled = await request(`/api/admin/orders/${created.payload.order.id}/settle`, {
    method: 'POST', headers: adminHeaders, body: JSON.stringify({ txId: 'a'.repeat(64) })
  });
  assert.equal(settled.response.status, 200);
  assert.equal(settled.payload.order.status, 'USDT Sent');
  assert.equal(settled.payload.order.settlement.verification.mode, 'on-chain');

  const account = await request('/api/me', { headers: { Cookie: cookie } });
  assert.equal(account.response.status, 200);
  assert.equal(account.payload.orders.length, 2);
  const settledOrder = account.payload.orders.find(order => order.id === created.payload.order.id);
  const ledgerOrder = account.payload.orders.find(order => order.id === createdByLedger.payload.order.id);
  assert.equal(settledOrder.settlement.txId, 'a'.repeat(64));
  assert.equal(settledOrder.proofFile, undefined);
  assert.equal(settledOrder.idempotencyKey, undefined);
  assert.equal(ledgerOrder.status, 'Payment Verified');
  assert.equal(ledgerOrder.paymentVerification.bankReference, 'UTR222222222');

  const proofDenied = await request(`/api/admin/orders/${created.payload.order.id}/proof`);
  assert.equal(proofDenied.response.status, 401);
  const proofAllowed = await fetch(`${base}/api/admin/orders/${created.payload.order.id}/proof`, { headers: { Authorization: `Bearer ${adminLogin.payload.token}` } });
  assert.equal(proofAllowed.status, 200);
  assert.equal(proofAllowed.headers.get('content-type'), 'image/png');

  const overview = await request('/api/admin/overview', { headers: { Authorization: `Bearer ${adminLogin.payload.token}` } });
  assert.equal(overview.response.status, 200);
  assert.equal(overview.payload.auditHealthy, true);
  assert.equal(overview.payload.admin.mfaEnabled, true);
  assert.equal(overview.payload.system.bankLedgerEntries, 1);
  assert.ok(overview.payload.auditLog.some(entry => entry.action === 'order.payment_verified'));
  assert.ok(overview.payload.auditLog.some(entry => entry.action === 'order.payment_auto_verified'));
  assert.ok(overview.payload.auditLog.some(entry => entry.action === 'order.settled'));

  const backup = await request('/api/admin/export', { headers: { Authorization: `Bearer ${adminLogin.payload.token}` } });
  assert.equal(backup.response.status, 200);
  assert.equal(backup.payload.schema, 'loktron-runtime-v2');
  assert.ok(Array.isArray(backup.payload.orders));
});
