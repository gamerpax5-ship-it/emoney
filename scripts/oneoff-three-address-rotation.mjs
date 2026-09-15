import { readFile, writeFile } from 'node:fs/promises';

const path = 'website/server.mjs';
let source = await readFile(path, 'utf8');

function replaceOne(oldText, newText, label) {
  const count = source.split(oldText).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  source = source.replace(oldText, newText);
}

replaceOne(
  "const tronAddressReuseCooldownMs = Math.max(tronLateDepositGraceMs, Math.min(30 * 24 * 60 * 60 * 1000, envNumber('TRON_ADDRESS_REUSE_COOLDOWN_MS', 48 * 60 * 60 * 1000)));\nconst tronMockScenario",
  "const tronAddressReuseCooldownMs = Math.max(tronLateDepositGraceMs, Math.min(30 * 24 * 60 * 60 * 1000, envNumber('TRON_ADDRESS_REUSE_COOLDOWN_MS', 48 * 60 * 60 * 1000)));\n// Clean expiries (no tx ever detected) should not strand a small receiving-address pool for 48 hours.\n// Five minutes is the production default; tx-bearing/review cases still keep the long safety cooldown.\nconst tronExpiredAddressReuseMs = Math.max(1_000, Math.min(60 * 60 * 1000, envNumber('TRON_EXPIRED_ADDRESS_REUSE_MS', 5 * 60 * 1000)));\nconst tronMockScenario",
  'expired reuse variable'
);

replaceOne(
  "  address.reservedOrderId = null;\n  const safeReuseAt = exactConfirmed ? timestamp : timestamp + digiAddressCooldownMs;",
  "  const cleanExpired = order.status === 'Expired' && !order.txId &&\n    (order.receivedUsdtMicros === null || order.receivedUsdtMicros === undefined);\n  address.reservedOrderId = null;\n  const safeReuseAt = exactConfirmed\n    ? timestamp\n    : cleanExpired\n      ? timestamp + tronExpiredAddressReuseMs\n      : timestamp + digiAddressCooldownMs;",
  'release policy'
);

replaceOne(
String.raw`function ensureDigiAddressAssignments() {
  let changed = false;
  for (const order of db.digirupee.orders) {
    if (!order.depositAddressId || !order.depositAddress) continue;
    if (db.digirupee.addressAssignments.some(item => item.orderId === order.id)) continue;
    const final = digiFinalStatuses.has(order.status);
    const safeReuseAt = final ? Number(order.updatedAt || order.quoteExpiresAt || Date.now()) + digiAddressCooldownMs : null;
    db.digirupee.addressAssignments.push({
      addressId: order.depositAddressId,
      address: order.depositAddress,
      orderId: order.id,
      userId: order.userId,
      assignedAt: order.createdAt,
      quoteExpiresAt: order.quoteExpiresAt,
      releasedAt: final ? order.updatedAt : null,
      safeReuseAt,
      txId: order.txId || null,
      status: order.status
    });
    changed = true;
  }
  return changed;
}`,
String.raw`function ensureDigiAddressAssignments() {
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
}`,
'boot normalization'
);

replaceOne(
String.raw`function assignmentForTransfer(addressId, timestamp) {
  const at = Number(timestamp);
  if (!Number.isFinite(at) || at <= 0) return null;
  return db.digirupee.addressAssignments
    .filter(item => item.addressId === addressId && Number(item.assignedAt) <= at && at <= Number(item.quoteExpiresAt) + tronLateDepositGraceMs)
    .sort((a, b) => Number(b.assignedAt) - Number(a.assignedAt))[0] || null;
}`,
String.raw`function assignmentForTransfer(addressId, timestamp, receivedUsdtMicros = null, candidateTxId = '') {
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
}`,
'amount-aware assignment routing'
);

const call = 'const assignment = assignmentForTransfer(order.depositAddressId, candidate.timestamp);';
const callCount = source.split(call).length - 1;
if (callCount !== 2) throw new Error(`assignment call sites: expected 2, found ${callCount}`);
source = source.replaceAll(call, 'const assignment = assignmentForTransfer(order.depositAddressId, candidate.timestamp, candidate.receivedUsdtMicros, candidate.txId);');

replaceOne(
  "        addressReuseCooldownMs: tronAddressReuseCooldownMs,\n        apiKeyConfigured: !!tronApiKey",
  "        addressReuseCooldownMs: tronAddressReuseCooldownMs,\n        expiredAddressReuseMs: tronExpiredAddressReuseMs,\n        apiKeyConfigured: !!tronApiKey",
  'system status'
);

await writeFile(path, source, 'utf8');
console.log('Three-address rotation patch applied.');
