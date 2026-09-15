import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const root = new URL('..', import.meta.url).pathname;
const usdtContract = 'TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj';

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

function tronAddress(seed) {
  const body = Buffer.concat([
    Buffer.from([0x41]),
    createHash('sha256').update(seed).digest().subarray(0, 20)
  ]);
  const checksum = createHash('sha256')
    .update(createHash('sha256').update(body).digest())
    .digest()
    .subarray(0, 4);
  return base58Encode(Buffer.concat([body, checksum]));
}

async function waitFor(url, child) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Server exited with ${child.exitCode}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Server did not become ready');
}

async function waitForOrder(base, token, orderId, expectedStatus = 'INR Processing') {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const response = await fetch(`${base}/api/digirupee/orders`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const payload = await response.json();
    const order = payload.orders?.find(item => item.id === orderId);
    if (order?.status === expectedStatus) return order;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Order ${orderId} did not reach ${expectedStatus}`);
}

test('digiRupee cycles three TRON addresses after confirmed deposits and sends the TronGrid API key', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'digirupee-pool-test-'));
  const apiKeys = [];
  const txRecords = new Map();
  const accountPollCount = new Map();

  const tronServer = createServer((req, res) => {
    apiKeys.push(String(req.headers['tron-pro-api-key'] || ''));
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    res.setHeader('Content-Type', 'application/json');

    const accountMatch = url.pathname.match(/^\/v1\/accounts\/([^/]+)\/transactions\/trc20$/);
    if (accountMatch) {
      const address = decodeURIComponent(accountMatch[1]);
      const count = (accountPollCount.get(address) || 0) + 1;
      accountPollCount.set(address, count);
      const txId = createHash('sha256').update(`${address}:${count}`).digest('hex');
      const timestamp = Date.now();
      txRecords.set(txId, { address, timestamp });
      res.end(JSON.stringify({
        data: [{
          transaction_id: txId,
          token_info: { address: usdtContract, decimals: 6 },
          to: address,
          value: '1000000000',
          block_timestamp: timestamp,
          block_number: 100
        }]
      }));
      return;
    }

    const txMatch = url.pathname.match(/^\/v1\/transactions\/([a-f0-9]{64})$/);
    if (txMatch) {
      const record = txRecords.get(txMatch[1]);
      res.end(JSON.stringify({
        data: {
          ret: [{ contractRet: 'SUCCESS' }],
          blockNumber: 100,
          block_timestamp: record?.timestamp || Date.now() - 500,
          confirmed: true
        }
      }));
      return;
    }

    if (url.pathname === '/wallet/getnowblock') {
      res.end(JSON.stringify({ block_header: { raw_data: { number: 100 } } }));
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'not found' }));
  });

  await new Promise(resolve => tronServer.listen(0, '127.0.0.1', resolve));
  const tronPort = tronServer.address().port;
  const port = 45000 + Math.floor(Math.random() * 1000);
  const base = `http://127.0.0.1:${port}`;

  const child = spawn(process.execPath, ['website/server.mjs'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      LOKTRON_DATA_DIR: dataDir,
      SESSION_SECRET: 'digirupee-pool-test-session-secret-2026',
      ADMIN_EMAIL: 'admin@example.com',
      ADMIN_PASSWORD: 'Strong-Test-Password-2026',
      TRON_VERIFY_MODE: 'required',
      TRON_API_URL: `http://127.0.0.1:${tronPort}`,
      TRONGRID_API_KEY: 'test-trongrid-api-key',
      TRON_REQUIRED_CONFIRMATIONS: '1',
      TRON_POLL_INTERVAL_MS: '1000',
      TRON_PROVIDER_TIMEOUT_MS: '2000',
      TRON_LATE_DEPOSIT_GRACE_MS: '60000',
      TRON_ADDRESS_REUSE_COOLDOWN_MS: '60000'
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

  async function request(path, options = {}) {
    const response = await fetch(base + path, options);
    const payload = await response.json().catch(() => ({}));
    return { response, payload };
  }

  const adminLogin = await request('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({
      email:'admin@example.com',
      password:'Strong-Test-Password-2026'
    })
  });
  assert.equal(adminLogin.response.status, 200);
  const adminHeaders = {
    'Content-Type':'application/json',
    Authorization:`Bearer ${adminLogin.payload.token}`
  };

  const pool = [
    tronAddress('pool-address-1'),
    tronAddress('pool-address-2'),
    tronAddress('pool-address-3')
  ];

  for (let index = 0; index < pool.length; index += 1) {
    const added = await request('/api/digirupee/admin/tron-addresses', {
      method:'POST',
      headers:adminHeaders,
      body:JSON.stringify({
        address:pool[index],
        label:`Pool ${index + 1}`,
        enabled:true
      })
    });
    assert.equal(added.response.status, 201);
  }

  async function createUserOrder(index) {
    const email = `pool-user-${index}@example.com`;
    const password = `Pool-Password-${index}-2026`;
    const mobile = `+91${9000000000 + index}`;
    const registered = await request('/api/digirupee/auth/register', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify({
        email,
        password,
        fullName:`Pool User ${index}`,
        mobile
      })
    });
    assert.equal(registered.response.status, 201);

    const login = await request('/api/digirupee/auth/login', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify({ email, password })
    });
    assert.equal(login.response.status, 200);
    const token = login.payload.token;
    const authHeaders = {
      'Content-Type':'application/json',
      Authorization:`Bearer ${token}`
    };

    const method = await request('/api/digirupee/payout-methods', {
      method:'POST',
      headers:authHeaders,
      body:JSON.stringify({
        type:'UPI',
        label:`UPI ${index}`,
        holderName:`Pool User ${index}`,
        mobile,
        upiId:`pooluser${index}@upi`,
        minInr:1,
        maxInr:500000,
        dailyLimitInr:5000000,
        enabled:true
      })
    });
    assert.equal(method.response.status, 201);
    assert.equal(method.payload.payoutMethod.maxInr, 5000000, 'UPI daily limit should be the usable transfer ceiling');

    const quote = await request('/api/digirupee/quotes', {
      method:'POST',
      headers:authHeaders,
      body:JSON.stringify({
        payoutType:'UPI',
        usdtAmount:1000,
        payoutMethodIds:[method.payload.payoutMethod.id]
      })
    });
    assert.equal(quote.response.status, 201);

    const order = await request('/api/digirupee/orders', {
      method:'POST',
      headers:{
        ...authHeaders,
        'Idempotency-Key':`pool-order-key-${index}-123456789`
      },
      body:JSON.stringify({ quoteId:quote.payload.quote.quoteId })
    });
    assert.equal(order.response.status, 201);
    assert.ok(pool.includes(order.payload.order.depositAddress));

    if (index === 1) {
      const manual = await request(`/api/digirupee/admin/orders/${order.payload.order.id}/deposit-confirmation`, {
        method:'POST',
        headers:adminHeaders,
        body:JSON.stringify({})
      });
      assert.equal(manual.response.status, 200);
      assert.equal(manual.payload.order.status, 'INR Processing');
      assert.equal(manual.payload.order.chainStatus, 'valid_exact');
    }

    const confirmed = await waitForOrder(base, token, order.payload.order.id);
    assert.equal(confirmed.chainStatus, 'valid_exact');
    assert.equal(confirmed.verificationSource, 'trongrid');
    assert.ok(Number(confirmed.confirmations) >= 1);

    const addresses = await request('/api/digirupee/admin/tron-addresses', {
      headers:{ Authorization:`Bearer ${adminLogin.payload.token}` }
    });
    assert.equal(addresses.response.status, 200);
    const used = addresses.payload.tronAddresses.find(item => item.id === confirmed.depositAddressId);
    assert.ok(used);
    assert.equal(used.activeOrderId, null, 'confirmed deposit address should immediately return to the pool');

    return confirmed;
  }

  const first = await createUserOrder(1);
  const second = await createUserOrder(2);
  const third = await createUserOrder(3);
  const fourth = await createUserOrder(4);

  assert.equal(new Set([first.depositAddress, second.depositAddress, third.depositAddress]).size, 3);
  assert.equal(fourth.depositAddress, first.depositAddress, 'oldest free address should rotate back into use');
  assert.ok(apiKeys.length > 0);
  assert.ok(apiKeys.every(key => key === 'test-trongrid-api-key'), 'every provider request must send TRON-PRO-API-KEY');
});

test('Android and hosted UI keep system bars and focused inputs stable', async () => {
  const main = await readFile(join(root, 'android/app/src/main/java/com/loktron/tronpay/MainActivity.java'), 'utf8');
  const manifest = await readFile(join(root, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
  const layout = await readFile(join(root, 'ui/digirupee-layout-v3.js'), 'utf8');

  assert.match(main, /setDecorFitsSystemWindows\(false\)/);
  assert.match(main, /WindowInsets\.Type\.displayCutout\(\)/);
  assert.match(main, /FrameLayout rootView/);
  assert.match(manifest, /android:windowSoftInputMode="adjustResize"/);
  assert.match(layout, /do not rebuild #v61root here/);
  assert.match(layout, /Background refresh must not replace a focused input/);
});
