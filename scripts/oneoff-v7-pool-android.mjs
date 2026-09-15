import { readFile, writeFile } from 'node:fs/promises';

async function replaceExact(path, oldText, newText, label) {
  const source = await readFile(path, 'utf8');
  const first = source.indexOf(oldText);
  if (first < 0) throw new Error(`${label}: expected source block was not found in ${path}`);
  if (source.indexOf(oldText, first + 1) >= 0) throw new Error(`${label}: source block matched more than once in ${path}`);
  const next = source.slice(0, first) + newText + source.slice(first + oldText.length);
  await writeFile(path, next, 'utf8');
}

async function replaceSingle(path, oldText, newText, label) {
  const source = await readFile(path, 'utf8');
  const count = source.split(oldText).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match in ${path}, found ${count}`);
  await writeFile(path, source.replace(oldText, newText), 'utf8');
}

const serverPath = 'website/server.mjs';

await replaceExact(
  serverPath,
`function digiOrderIsActive(order) {
  return digiActiveStatuses.has(String(order?.status || '')) && !digiFinalStatuses.has(String(order?.status || ''));
}
`,
`function digiOrderIsActive(order) {
  return digiActiveStatuses.has(String(order?.status || '')) && !digiFinalStatuses.has(String(order?.status || ''));
}

function digiOrderNeedsExclusiveAddress(order) {
  return ['Awaiting Deposit', 'Detected', 'Confirming', 'Late Review'].includes(String(order?.status || ''));
}
`,
  'exclusive-address helper'
);

await replaceSingle(
  serverPath,
  'assignedOrder && digiOrderIsActive(assignedOrder)',
  'assignedOrder && digiOrderNeedsExclusiveAddress(assignedOrder)',
  'available address exclusivity'
);

await replaceExact(
  serverPath,
`function releaseDigiAddress(order, timestamp = Date.now()) {
  const address = db.digirupee.tronAddresses.find(item => item.id === order.depositAddressId);
  if (!address || address.reservedOrderId !== order.id) return false;
  address.reservedOrderId = null;
  const safeReuseAt = timestamp + digiAddressCooldownMs;
  address.reservedUntil = safeReuseAt;
  address.updatedAt = timestamp;
  const assignment = db.digirupee.addressAssignments.find(item => item.orderId === order.id && item.addressId === address.id);
  if (assignment) {
    assignment.releasedAt = timestamp;
    assignment.safeReuseAt = safeReuseAt;
    assignment.status = order.status;
  }
  return true;
}
`,
`function releaseDigiAddress(order, timestamp = Date.now(), { confirmed = false } = {}) {
  const address = db.digirupee.tronAddresses.find(item => item.id === order.depositAddressId);
  if (!address || address.reservedOrderId !== order.id) return false;
  const exactConfirmed = confirmed || (
    !!order.txId &&
    order.chainStatus === 'valid_exact' &&
    Number(order.receivedUsdtMicros) === Number(order.usdtMicros) &&
    Number(order.confirmations || 0) >= tronRequiredConfirmations
  );
  address.reservedOrderId = null;
  const safeReuseAt = exactConfirmed ? timestamp : timestamp + digiAddressCooldownMs;
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
`,
  'confirmed address release'
);

await replaceExact(
  serverPath,
`    if (setDigiOrderStatus(order, 'INR Processing', 'INR Processing', now)) changed = true;
    if (ensureDigiPayoutRecord(order)) changed = true;
`,
`    if (setDigiOrderStatus(order, 'INR Processing', 'INR Processing', now)) changed = true;
    if (ensureDigiPayoutRecord(order)) changed = true;
    if (releaseDigiAddress(order, now, { confirmed: true })) changed = true;
`,
  'release address after chain confirmation'
);

await replaceExact(
  serverPath,
`function monitorableDigiOrders(timestamp = Date.now()) {
  const result = db.digirupee.orders.filter(order => digiOrderIsActive(order));
  for (const order of db.digirupee.orders) {
    if (order.status !== 'Expired') continue;
    const assignment = db.digirupee.addressAssignments.find(item => item.orderId === order.id);
    if (assignment && Number(assignment.safeReuseAt || 0) > timestamp) result.push(order);
  }
  return [...new Map(result.map(order => [order.id, order])).values()];
}
`,
`function monitorableDigiOrders(timestamp = Date.now()) {
  const result = db.digirupee.orders.filter(order => digiOrderNeedsExclusiveAddress(order));
  for (const order of db.digirupee.orders) {
    if (order.status !== 'Expired') continue;
    const assignment = db.digirupee.addressAssignments.find(item => item.orderId === order.id);
    if (assignment && Number(assignment.safeReuseAt || 0) > timestamp) result.push(order);
  }
  return [...new Map(result.map(order => [order.id, order])).values()];
}
`,
  'monitor only deposit-stage active orders'
);

await replaceExact(
  serverPath,
`  setDigiOrderStatus(order, 'INR Processing', 'INR Processing', now);
  ensureDigiPayoutRecord(order);
  return { ok: true };
`,
`  setDigiOrderStatus(order, 'INR Processing', 'INR Processing', now);
  ensureDigiPayoutRecord(order);
  releaseDigiAddress(order, now, { confirmed: true });
  return { ok: true };
`,
  'release reviewed confirmed address'
);

const mainPath = 'android/app/src/main/java/com/loktron/tronpay/MainActivity.java';
await replaceSingle(
  mainPath,
  'import android.webkit.WebViewClient;\n',
  'import android.webkit.WebViewClient;\nimport android.widget.FrameLayout;\n',
  'FrameLayout import'
);

await replaceExact(
  mainPath,
`        getWindow().setStatusBarColor(Color.rgb(7, 5, 18));
        getWindow().setNavigationBarColor(Color.rgb(7, 5, 18));
        getWindow().getDecorView().setSystemUiVisibility(0);

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(7, 5, 18));
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setVerticalScrollBarEnabled(false);
        webView.setHorizontalScrollBarEnabled(false);
        setContentView(webView);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM) {
            webView.setOnApplyWindowInsetsListener((view, insets) -> {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return insets;
            });
            webView.requestApplyInsets();
        }
`,
`        getWindow().setStatusBarColor(Color.rgb(7, 5, 18));
        getWindow().setNavigationBarColor(Color.rgb(7, 5, 18));
        getWindow().getDecorView().setSystemUiVisibility(0);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(false);
        }

        FrameLayout rootView = new FrameLayout(this);
        rootView.setBackgroundColor(Color.rgb(7, 5, 18));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(7, 5, 18));
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setVerticalScrollBarEnabled(false);
        webView.setHorizontalScrollBarEnabled(false);
        rootView.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
        ));
        setContentView(rootView);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            rootView.setOnApplyWindowInsetsListener((view, insets) -> {
                android.graphics.Insets bars = insets.getInsets(
                        WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout()
                );
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return insets;
            });
            rootView.requestApplyInsets();
        }
`,
  'Android safe system insets'
);

await replaceSingle(
  'android/app/src/main/AndroidManifest.xml',
`            android:screenOrientation="portrait">`,
`            android:screenOrientation="portrait"
            android:windowSoftInputMode="adjustResize">`,
  'Android keyboard resize'
);

await replaceSingle(
  'android/app/build.gradle.kts',
`        versionCode = 5
        versionName = "1.0.4"`,
`        versionCode = 6
        versionName = "1.0.5"`,
  'Android version bump'
);

const testContent = Buffer.from('aW1wb3J0IHRlc3QgZnJvbSAnbm9kZTp0ZXN0JzsKaW1wb3J0IGFzc2VydCBmcm9tICdub2RlOmFzc2VydC9zdHJpY3QnOwppbXBvcnQgeyBjcmVhdGVIYXNoIH0gZnJvbSAnbm9kZTpjcnlwdG8nOwppbXBvcnQgeyBjcmVhdGVTZXJ2ZXIgfSBmcm9tICdub2RlOmh0dHAnOwppbXBvcnQgeyBta2R0ZW1wLCByZWFkRmlsZSwgcm0gfSBmcm9tICdub2RlOmZzL3Byb21pc2VzJzsKaW1wb3J0IHsgdG1wZGlyIH0gZnJvbSAnbm9kZTpvcCc7CmltcG9ydCB7IGpvaW4gfSBmcm9tICdub2RlOnBhdGgnOwppbXBvcnQgeyBzcGF3biB9IGZyb20gJ25vZGU6Y2hpbGRfcHJvY2Vzcyc7Cgpjb25zdCByb290ID0gbmV3IFVSTCgnLi4nLCBpbXBvcnQubWV0YS51cmwpLnBhdGhuYW1lOwpjb25zdCB1c2R0Q29udHJhY3QgPSAnVFhMQVE2M1hnMU5BemNrUHdLSHZ6dzdDU0VtTE1FcWNkJzsKCmZ1bmN0aW9uIGJhc2U1OEVuY29kZShidWZmZXIpIHsKICBjb25zdCBhbHBoYWJldCA9ICcxMjM0NTY3ODlBQkNERUZHSEpLTE1OUFFSU1RVVldYWVphYmNkZWZnaGlqa21ub3BxcnN0dXZ3eHl6JzsKICBsZXQgdmFsdWUgPSBCaWdJbnQoJzB4JyArIGJ1ZmZlci50b1N0cmluZygnaGV4JykpOwogIGxldCBlbmNvZGVkID0gJyc7CiAgd2hpbGUgKHZhbHVlID4gMG4pIHsKICAgIGVuY29kZWQgPSBhbHBoYWJldFtOdW1iZXIodmFsdWUgJSA1OG4pXSArIGVuY29kZWQ7CiAgICB2YWx1ZSAvPSA1OG47CiAgfQogIGZvciAoY29uc3QgYnl0ZSBvZiBidWZmZXIpIHsKICAgIGlmIChieXRlICE9PSAwKSBicmVhazsKICAgIGVuY29kZWQgPSAnMScgKyBlbmNvZGVkOwogIH0KICByZXR1cm4gZW5jb2RlZCB8fCAnMSc7Cn0KCmZ1bmN0aW9uIHRyb25BZGRyZXNzKHNlZWQpIHsKICBjb25zdCBib2R5ID0gQnVmZmVyLmNvbmNhdChbCiAgICBCdWZmZXIuZnJvbShbMHg0MV0pLAogICAgY3JlYXRlSGFzaCgnc2hhMjU2JykudXBkYXRlKHNlZWQpLmRpZ2VzdCgpLnN1YmFycmF5KDAsIDIwKQogIF0pOwogIGNvbnN0IGNoZWNrc3VtID0gY3JlYXRlSGFzaCgnc2hhMjU2JykKICAgIC51cGRhdGUoY3JlYXRlSGFzaCgnc2hhMjU2JykudXBkYXRlKGJvZHkpLmRpZ2VzdCgpKQogICAgLmRpZ2VzdCgpCiAgICAuc3ViYXJyYXkoMCwgNCk7CiAgcmV0dXJuIGJhc2U1OEVuY29kZShCdWZmZXIuY29uY2F0KFtib2R5LCBjaGVja3N1bV0pKTsKfQoKYXN5bmMgZnVuY3Rpb24gd2FpdEZvcih1cmwsIGNoaWxkKSB7CiAgZm9yIChsZXQgYXR0ZW1wdCA9IDA7IGF0dGVtcHQgPCA4MDsgYXR0ZW1wdCArPSAxKSB7CiAgICBpZiAoY2hpbGQuZXhpdENvZGUgIT09IG51bGwpIHRocm93IG5ldyBFcnJvcihgU2VydmVyIGV4aXRlZCB3aXRoICR7Y2hpbGQuZXhpdENvZGV9YCk7CiAgICB0cnkgewogICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKHVybCk7CiAgICAgIGlmIChyZXNwb25zZS5vaykgcmV0dXJuOwogICAgfSBjYXRjaCB7fQogICAgYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDEwMCkpOwogIH0KICB0aHJvdyBuZXcgRXJyb3IoJ1NlcnZlciBkaWQgbm90IGJlY29tZSByZWFkeScpOwp9Cgphc3luYyBmdW5jdGlvbiB3YWl0Rm9yT3JkZXIoYmFzZSwgdG9rZW4sIG9yZGVySWQsIGV4cGVjdGVkU3RhdHVzID0gJ0lOUiBQcm9jZXNzaW5nJykgewogIGZvciAobGV0IGF0dGVtcHQgPSAwOyBhdHRlbXB0IDwgNDA7IGF0dGVtcHQgKz0gMSkgewogICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaChgJHtiYXNlfS9hcGkvZGlnaXJ1cGVlL29yZGVyc2AsIHsKICAgICAgaGVhZGVyczogeyBBdXRob3JpemF0aW9uOiBgQmVhcmVyICR7dG9rZW59YCB9CiAgICB9KTsKICAgIGNvbnN0IHBheWxvYWQgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7CiAgICBjb25zdCBvcmRlciA9IHBheWxvYWQub3JkZXJzPy5maW5kKGl0ZW0gPT4gaXRlbS5pZCA9PT0gb3JkZXJJZCk7CiAgICBpZiAob3JkZXI/LnN0YXR1cyA9PT0gZXhwZWN0ZWRTdGF0dXMpIHJldHVybiBvcmRlcjsKICAgIGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAyNTApKTsKICB9CiAgdGhyb3cgbmV3IEVycm9yKGBTcmRlciAke29yZGVySWR9IGRpZCBub3QgcmVhY2ggJHtleHBlY3RlZFN0YXR1c31gKTsKfQoKdGVzdCgnZGlnaVJ1cGVlIGN5Y2xlcyB0aHJlZSBUUk9OIGFkZHJlc3NlcyBhZnRlciBjb25maXJtZWQgZGVwb3NpdHMgYW5kIHNlbmRzIHRoZSBUcm9uR3JpZCBBUEkga2V5JywgYXN5bmMgdCA9PiB7CiAgY29uc3QgZGF0YURpciA9IGF3YWl0IG1rZHRlbXAoam9pbih0bXBkaXIoKSwgJ2RpZ2lydXBlZS1wb29sLXRlc3QtJykpOwogIGNvbnN0IGFwaUtleXMgPSBbXTsKICBjb25zdCB0eFJlY29yZHMgPSBuZXcgTWFwKCk7CiAgY29uc3QgYWNjb3VudFBvbGxDb3VudCA9IG5ldyBNYXAoKTsKCiAgY29uc3QgdHJvblNlcnZlciA9IGNyZWF0ZVNlcnZlcigocmVxLCByZXMpID0+IHsKICAgIGFwaUtleXMucHVzaChTdHJpbmcocmVxLmhlYWRlcnNbJ3Ryb24tcHJvLWFwaS1rZXknXSB8fCAnJykpOwogICAgY29uc3QgdXJsID0gbmV3IFVSTChyZXEudXJsIHx8ICcvJywgYGh0dHA6Ly8ke3JlcS5oZWFkZXJzLmhvc3R9YCk7CiAgICByZXMuc2V0SGVhZGVyKCdDb250ZW50LVR5cGUnLCAnYXBwbGljYXRpb24vanNvbicpOwoKICAgIGNvbnN0IGFjY291bnRNYXRjaCA9IHVybC5wYXRobmFtZS5tYXRjaCgvXlwvdjFcL2FjY291bnRzXC8oW14vXSspXC90cmFuc2FjdGlvbnNcL3RyYzIwJC8pOwogICAgaWYgKGFjY291bnRNYXRjaCkgewogICAgICBjb25zdCBhZGRyZXNzID0gZGVjb2RlVVJJQ29tcG9uZW50KGFjY291bnRNYXRjaFsxXSk7CiAgICAgIGNvbnN0IGNvdW50ID0gKGFjY291bnRQb2xsQ291bnQuZ2V0KGFkZHJlc3MpIHx8IDApICsgMTsKICAgICAgYWNjb3VudFBvbGxDb3VudC5zZXQoYWRkcmVzcywgY291bnQpOwogICAgICBjb25zdCB0eElkID0gY3JlYXRlSGFzaCgnc2hhMjU2JykudXBkYXRlKGAke2FkZHJlc3N9OiR7Y291bnR9YCkuZGlnZXN0KCdoZXgnKTsKICAgICAgY29uc3QgdGltZXN0YW1wID0gRGF0ZS5ub3coKSAtIDUwMDsKICAgICAgdHhSZWNvcmRzLnNldCh0eElkLCB7IGFkZHJlc3MsIHRpbWVzdGFtcCB9KTsKICAgICAgcmVzLmVuZChKU09OLnN0cmluZ2lmeSh7CiAgICAgICAgZGF0YTogW3sKICAgICAgICAgIHRyYW5zYWN0aW9uX2lkOiB0eElkLAogICAgICAgICAgdG9rZW5faW5mbzogeyBhZGRyZXNzOiB1c2R0Q29udHJhY3QsIGRlY2ltYWxzOiA2IH0sCiAgICAgICAgICB0bzogYWRkcmVzcywKICAgICAgICAgIHZhbHVlOiAnMTAwMDAwMDAwMCcsCiAgICAgICAgICBibG9ja190aW1lc3RhbXA6IHRpbWVzdGFtcCwKICAgICAgICAgIGJsb2NrX251bWJlcjogMTAwCiAgICAgICAgfV0KICAgICAgfSkpOwogICAgICByZXR1cm47CiAgICB9CgogICAgY29uc3QgdHhNYXRjaCA9IHVybC5wYXRobmFtZS5tYXRjaCgvXlwvdjFcL3RyYW5zYWN0aW9uc1wvKFthLWYwLTldezY0fSkkLyk7CiAgICBpZiAodHhNYXRjaCkgewogICAgICBjb25zdCByZWNvcmQgPSB0eFJlY29yZHMuZ2V0KHR4TWF0Y2hbMV0pOwogICAgICByZXMuZW5kKEpTT04uc3RyaW5naWZ5KHsKICAgICAgICBkYXRhOiB7CiAgICAgICAgICByZXQ6IFt7IGNvbnRyYWN0UmV0OiAnU1VDQ0VTUycgfV0sCiAgICAgICAgICBibG9ja051bWJlcjogMTAwLAogICAgICAgICAgYmxvY2tfdGltZXN0YW1wOiByZWNvcmQ/LnRpbWVzdGFtcCB8fCBEYXRlLm5vdygpIC0gNTAwLAogICAgICAgICAgY29uZmlybWVkOiB0cnVlCiAgICAgICAgfQogICAgICB9KSk7CiAgICAgIHJldHVybjsKICAgIH0KCiAgICBpZiAodXJsLnBhdGhuYW1lID09PSAnL3dhbGxldC9nZXRub3dibG9jaycpIHsKICAgICAgcmVzLmVuZChKU09OLnN0cmluZ2lmeSh7IGJsb2NrX2hlYWRlcjogeyByYXdfZGF0YTogeyBudW1iZXI6IDEwMCB9IH0gfSkpOwogICAgICByZXR1cm47CiAgICB9CgogICAgcmVzLnN0YXR1c0NvZGUgPSA0MDQ7CiAgICByZXMuZW5kKEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdub3QgZm91bmQnIH0pKTsKICB9KTsKCiAgYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiB0cm9uU2VydmVyLmxpc3RlbigwLCAnMTI3LjAuMC4xJywgcmVzb2x2ZSkpOwogIGNvbnN0IHRyb25Qb3J0ID0gdHJvblNlcnZlci5hZGRyZXNzKCkucG9ydDsKICBjb25zdCBwb3J0ID0gNDUwMDAgKyBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiAxMDAwKTsKICBjb25zdCBiYXNlID0gYGh0dHA6Ly8xMjcuMC4wLjE6JHtwb3J0fWA7CgogIGNvbnN0IGNoaWxkID0gc3Bhd24ocHJvY2Vzcy5leGVjUGF0aCwgWyd3ZWJzaXRlL3NlcnZlci5tanMnXSwgewogICAgY3dkOiByb290LAogICAgc3RkaW86IFsnaWdub3JlJywgJ3BpcGUnLCAncGlwZSddLAogICAgZW52OiB7CiAgICAgIC4uLnByb2Nlc3MuZW52LAogICAgICBQT1JUOiBTdHJpbmcocG9ydCksCiAgICAgIE5PREVfRU5WOiAndGVzdCcsCiAgICAgIExPS1RST05fREFUQV9ESVI6IGRhdGFEaXIsCiAgICAgIFNFU1NJT05fU0VDUkVUOiAnZGlnaXJ1cGVlLXBvb2wtdGVzdC1zZXNzaW9uLXNlY3JldC0yMDI2JywKICAgICAgQURNSU5fRU1BSUw6ICdhZG1pbkBleGFtcGxlLmNvbScsCiAgICAgIEFETUlOX1BBU1NXT1JEOiAnU3Ryb25nLVRlc3QtUGFzc3dvcmQtMjAyNicsCiAgICAgIFRST05fVkVSSUZZX01PREU6ICdyZXF1aXJlZCcsCiAgICAgIFRST05fQVBJX1VSTDogYGh0dHA6Ly8xMjcuMC4wLjE6JHt0cm9uUG9ydH1gLAogICAgICBUUk9OR1JJRF9BUElfS0VZOiAndGVzdC10cm9uZ3JpZC1hcGkta2V5JywKICAgICAgVFJPTl9SRVFVJUkVEX0NPTkZJUk1BVElPTlM6ICcxJywKICAgICAgVFJPTl9QT0xMX0lOVEVSVkFMX01TOiAnMTAwMCcsCiAgICAgIFRST05fUFJPVklERVJfVElNRU9VVF9NUzogJzIwMDAnLAogICAgICBUUk9OX0xBVEVfREVQT1NJVF9HUkFDRV9NUzogJzYwMDAwJywKICAgICAgVFJPTl9BRERSRVNTX1JFVVNFX0NPT0xET1dOX01TOiAnNjAwMDAnCiAgICB9CiAgfSk7CgogIGxldCBzdGRlcnIgPSAnJzsKICBjaGlsZC5zdGRlcnIub24oJ2RhdGEnLCBjaHVuayA9PiB7IHN0ZGVyciArPSBjaHVuazsgfSk7CgogIHQuYWZ0ZXIoYXN5bmMgKCkgPT4gewogICAgY2hpbGQua2lsbCgnU0lHVEVSTScpOwogICAgYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBjaGlsZC5vbmNlKCdleGl0JywgcmVzb2x2ZSkpOwogICAgYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiB0cm9uU2VydmVyLmNsb3NlKHJlc29sdmUpKTsKICAgIGF3YWl0IHJtKGRhdGFEaXIsIHsgcmVjdXJzaXZlOiB0cnVlLCBmb3JjZTogdHJ1ZSB9KTsKICAgIGFzc2VydC5lcXVhbChzdGRlcnIsICcnKTsKICB9KTsKCiAgYXdhaXQgd2FpdEZvcihgJHtiYXNlfS9oZWFsdGhgLCBjaGlsZCk7CgogIGFzeW5jIGZ1bmN0aW9uIHJlcXVlc3QocGF0aCwgb3B0aW9ucyA9IHt9KSB7CiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKGJhc2UgKyBwYXRoLCBvcHRpb25zKTsKICAgIGNvbnN0IHBheWxvYWQgPSBhd2FpdCByZXNwb25zZS5qc29uKCkuY2F0Y2goKCkgPT4gKHt9KSk7CiAgICByZXR1cm4geyByZXNwb25zZSwgcGF5bG9hZCB9OwogIH0KCiAgY29uc3QgYWRtaW5Mb2dpbiA9IGF3YWl0IHJlcXVlc3QoJy9hcGkvYWRtaW4vbG9naW4nLCB7CiAgICBtZXRob2Q6ICdQT1NUJywKICAgIGhlYWRlcnM6IHsgJ0NvbnRlbnQtVHlwZSc6J2FwcGxpY2F0aW9uL2pzb24nIH0sCiAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7CiAgICAgIGVtYWlsOidhZG1pbkBleGFtcGxlLmNvbScsCiAgICAgIHBhc3N3b3JkOidTdHJvbmctVGVzdC1QYXNzd29yZC0yMDI2JwogICAgfSkKICB9KTsKICBhc3NlcnQuZXF1YWwoYWRtaW5Mb2dpbi5yZXNwb25zZS5zdGF0dXMsIDIwMCk7CiAgY29uc3QgYWRtaW5IZWFkZXJzID0gewogICAgJ0NvbnRlbnQtVHlwZSc6J2FwcGxpY2F0aW9uL2pzb24nLAogICAgQXV0aG9yaXphdGlvbjpgQmVhcmVyICR7YWRtaW5Mb2dpbi5wYXlsb2FkLnRva2VufWAKICB9OwoKICBjb25zdCBwb29sID0gWwogICAgdHJvbkFkZHJlc3MoJ3Bvb2wtYWRkcmVzcy0xJyksCiAgICB0cm9uQWRkcmVzcygncG9vbC1hZGRyZXNzLTInKSwKICAgIHRyb25BZGRyZXNzKCdwb29sLWFkZHJlc3MtMycpCiAgXTsKCiAgZm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IHBvb2wubGVuZ3RoOyBpbmRleCArPSAxKSB7CiAgICBjb25zdCBhZGRlZCA9IGF3YWl0IHJlcXVlc3QoJy9hcGkvZGlnaXJ1cGVlL2FkbWluL3Ryb24tYWRkcmVzc2VzJywgewogICAgICBtZXRob2Q6J1BPU1QnLAogICAgICBoZWFkZXJzOmFkbWluSGVhZGVycywKICAgICAgYm9keTpKU09OLnN0cmluZ2lmeSh7CiAgICAgICAgYWRkcmVzczpwb29sW2luZGV4XSwKICAgICAgICBsYWJlbDpgUG9vbCAke2luZGV4ICsgMX1gLAogICAgICAgIGVuYWJsZWQ6dHJ1ZQogICAgICB9KQogICAgfSk7CiAgICBhc3NlcnQuZXF1YWwoYWRkZWQucmVzcG9uc2Uuc3RhdHVzLCAyMDEpOwogIH0KCiAgYXN5bmMgZnVuY3Rpb24gY3JlYXRlVXNlck9yZGVyKGluZGV4KSB7CiAgICBjb25zdCBlbWFpbCA9IGBwb29sLXVzZXItJHtpbmRleH1AZXhhbXBsZS5jb21gOwogICAgY29uc3QgcGFzc3dvcmQgPSBgUG9vbC1QYXNzd29yZC0ke2luZGV4fS0yMDI2YDsKICAgIGNvbnN0IG1vYmlsZSA9IGArOTEkezkwMDAwMDAwMDAgKyBpbmRleH1gOwogICAgY29uc3QgcmVnaXN0ZXJlZCA9IGF3YWl0IHJlcXVlc3QoJy9hcGkvZGlnaXJ1cGVlL2F1dGgvcmVnaXN0ZXInLCB7CiAgICAgIG1ldGhvZDonUE9TVCcsCiAgICAgIGhlYWRlcnM6eyAnQ29udGVudC1UeXBlJzonYXBwbGljYXRpb24vanNvbicgfSwKICAgICAgYm9keTpKU09OLnN0cmluZ2lmeSh7CiAgICAgICAgZW1haWwsCiAgICAgICAgcGFzc3dvcmQsCiAgICAgICAgZnVsbE5hbWU6YFBvb2wgVXNlciAke2luZGV4fWAsCiAgICAgICAgbW9iaWxlCiAgICAgIH0pCiAgICB9KTsKICAgIGFzc2VydC5lcXVhbChyZWdpc3RlcmVkLnJlc3BvbnNlLnN0YXR1cywgMjAxKTsKCiAgICBjb25zdCBsb2dpbiA9IGF3YWl0IHJlcXVlc3QoJy9hcGkvZGlnaXJ1cGVlL2F1dGgvbG9naW4nLCB7CiAgICAgIG1ldGhvZDonUE9TVCcsCiAgICAgIGhlYWRlcnM6eyAnQ29udGVudC1UeXBlJzonYXBwbGljYXRpb24vanNvbicgfSwKICAgICAgYm9keTpKU09OLnN0cmluZ2lmeSh7IGVtYWlsLCBwYXNzd29yZCB9KQogICAgfSk7CiAgICBhc3NlcnQuZXF1YWwobG9naW4ucmVzcG9uc2Uuc3RhdHVzLCAyMDApOwogICAgY29uc3QgdG9rZW4gPSBsb2dpbi5wYXlsb2FkLnRva2VuOwogICAgY29uc3QgYXV0aEhlYWRlcnMgPSB7CiAgICAgICdDb250ZW50LVR5cGUnOidhcHBsaWNhdGlvbi9qc29uJywKICAgICAgQXV0aG9yaXphdGlvbjpgQmVhcmVyICR7dG9rZW59YAogICAgfTsKCiAgICBjb25zdCBtZXRob2QgPSBhd2FpdCByZXF1ZXN0KCcvYXBpL2RpZ2lydXBlZS9wYXlvdXQtbWV0aG9kcycsIHsKICAgICAgbWV0aG9kOidQT1NUJywKICAgICAgaGVhZGVyczphdXRoSGVhZGVycywKICAgICAgYm9keTpKU09OLnN0cmluZ2lmeSh7CiAgICAgICAgdHlwZTonVVBJJywKICAgICAgICBsYWJlbDpgVVBJICR7aW5kZXh9YCwKICAgICAgICBob2xkZXJOYW1lOmBQb29sIFVzZXIgJHtpbmRleH1gLAogICAgICAgIG1vYmlsZSwKICAgICAgICB1cGlJZDpgcG9vbHVzZXIke2luZGV4fUB1cGlgLAogICAgICAgIG1pbklucjoxLAogICAgICAgIG1heElucjo1MDAwMDAsCiAgICAgICAgZGFpbHlMaW1pdElucjo1MDAwMDAwLAogICAgICAgIGVuYWJsZWQ6dHJ1ZQogICAgICB9KQogICAgfSk7CiAgICBhc3NlcnQuZXF1YWwobWV0aG9kLnJlc3BvbnNlLnN0YXR1cywgMjAxKTsKCiAgICBjb25zdCBxdW90ZSA9IGF3YWl0IHJlcXVlc3QoJy9hcGkvZGlnaXJ1cGVlL3F1b3RlcycsIHsKICAgICAgbWV0aG9kOidQT1NUJywKICAgICAgaGVhZGVyczphdXRoSGVhZGVycywKICAgICAgYm9keTpKU09OLnN0cmluZ2lmeSh7CiAgICAgICAgcGF5b3V0VHlwZTonVVBJJywKICAgICAgICB1c2R0QW1vdW50OjEwMDAsCiAgICAgICAgcGF5b3V0TWV0aG9kSWRzOlttZXRob2QucGF5bG9hZC5wYXlvdXRNZXRob2QuaWRdCiAgICAgIH0pCiAgICB9KTsKICAgIGFzc2VydC5lcXVhbChxdW90ZS5yZXNwb25zZS5zdGF0dXMsIDIwMSk7CgogICAgY29uc3Qgb3JkZXIgPSBhd2FpdCByZXF1ZXN0KCcvYXBpL2RpZ2lydXBlZS9vcmRlcnMnLCB7CiAgICAgIG1ldGhvZDonUE9TVCcsCiAgICAgIGhlYWRlcnM6ewogICAgICAgIC4uLmF1dGhIZWFkZXJzLAogICAgICAgICdJZGVtcG90ZW5jeS1LZXknOmBwb29sLW9yZGVyLWtleS0ke2luZGV4fS0xMjM0NTY3ODlgCiAgICAgIH0sCiAgICAgIGJvZHk6SlNPTi5zdHJpbmdpZnkoeyBxdW90ZUlkOnF1b3RlLnBheWxvYWQucXVvdGUucXVvdGVJZCB9KQogICAgfSk7CiAgICBhc3NlcnQuZXF1YWwob3JkZXIucmVzcG9uc2Uuc3RhdHVzLCAyMDEpOwogICAgYXNzZXJ0Lm9rKHBvb2wuaW5jbHVkZXMob3JkZXIucGF5bG9hZC5vcmRlci5kZXBvc2l0QWRkcmVzcykpOwoKICAgIGNvbnN0IGNvbmZpcm1lZCA9IGF3YWl0IHdhaXRGb3JPcmRlcihiYXNlLCB0b2tlbiwgb3JkZXIucGF5bG9hZC5vcmRlci5pZCk7CiAgICBhc3NlcnQuZXF1YWwoY29uZmlybWVkLmNoYWluU3RhdHVzLCAndmFsaWRfZXhhY3QnKTsKICAgIGFzc2VydC5lcXVhbChjb25maXJtZWQudmVyaWZpY2F0aW9uU291cmNlLCAndHJvbmdyaWQnKTsKICAgIGFzc2VydC5vayhOdW1iZXIoY29uZmlybWVkLmNvbmZpcm1hdGlvbnMpID49IDEpOwoKICAgIGNvbnN0IGFkZHJlc3NlcyA9IGF3YWl0IHJlcXVlc3QoJy9hcGkvZGlnaXJ1cGVlL2FkbWluL3Ryb24tYWRkcmVzc2VzJywgewogICAgICBoZWFkZXJzOnsgQXV0aG9yaXphdGlvbjpgQmVhcmVyICR7YWRtaW5Mb2dpbi5wYXlsb2FkLnRva2VufWAgfQogICAgfSk7CiAgICBhc3NlcnQuZXF1YWwoYWRkcmVzc2VzLnJlc3BvbnNlLnN0YXR1cywgMjAwKTsKICAgIGNvbnN0IHVzZWQgPSBhZGRyZXNzZXMucGF5bG9hZC50cm9uQWRkcmVzc2VzLmZpbmQoaXRlbSA9PiBpdGVtLmlkID09PSBjb25maXJtZWQuZGVwb3NpdEFkZHJlc3NJZCk7CiAgICBhc3NlcnQub2sodXNlZCk7CiAgICBhc3NlcnQuZXF1YWwodXNlZC5hY3RpdmVPcmRlcklkLCBudWxsLCAnY29uZmlybWVkIGRlcG9zaXQgYWRkcmVzcyBzaG91bGQgaW1tZWRpYXRlbHkgcmV0dXJuIHRvIHRoZSBwb29sJyk7CgogICAgcmV0dXJuIGNvbmZpcm1lZDsKICB9CgogIGNvbnN0IGZpcnN0ID0gYXdhaXQgY3JlYXRlVXNlck9yZGVyKDEpOwogIGNvbnN0IHNlY29uZCA9IGF3YWl0IGNyZWF0ZVVzZXJPcmRlcigyKTsKICBjb25zdCB0aGlyZCA9IGF3YWl0IGNyZWF0ZVVzZXJPcmRlcigzKTsKICBjb25zdCBmb3VydGggPSBhd2FpdCBjcmVhdGVVc2VyT3JkZXIoNCk7CgogIGFzc2VydC5lcXVhbChuZXcgU2V0KFtmaXJzdC5kZXBvc2l0QWRkcmVzcywgc2Vjb25kLmRlcG9zaXRBZGRyZXNzLCB0aGlyZC5kZXBvc2l0QWRkcmVzc10pLnNpemUsIDMpOwogIGFzc2VydC5lcXVhbChmb3VydGguZGVwb3NpdEFkZHJlc3MsIGZpcnN0LmRlcG9zaXRBZGRyZXNzLCAnb2xkZXN0IGZyZWUgYWRkcmVzcyBzaG91bGQgcm90YXRlIGJhY2sgaW50byB1c2UnKTsKICBhc3NlcnQub2soYXBpS2V5cy5sZW5ndGggPiAwKTsKICBhc3NlcnQub2soYXBpS2V5cy5ldmVyeShrZXkgPT4ga2V5ID09PSAndGVzdC10cm9uZ3JpZC1hcGkta2V5JyksICdldmVyeSBwcm92aWRlciByZXF1ZXN0IG11c3Qgc2VuZCBUUk9OLVBSTy1BUEktS0VZJyk7Cn0pOwoKdGVzdCgnQW5kcm9pZCBhbmQgaG9zdGVkIFVJIGtlZXAgc3lzdGVtIGJhcnMgYW5kIGZvY3VzZWQgaW5wdXRzIHN0YWJsZScsIGFzeW5jICgpID0+IHsKICBjb25zdCBtYWluID0gYXdhaXQgcmVhZEZpbGUoam9pbihyb290LCAnYW5kcm9pZC9hcHAvc3JjL21haW4vamF2YS9jb20vbG9rdHJvbi90cm9ucGF5L01haW5BY3Rpdml0eS5qYXZhJyksICd1dGY4Jyk7CiAgY29uc3QgbWFuaWZlc3QgPSBhd2FpdCByZWFkRmlsZShqb2luKHJvb3QsICdhbmRyb2lkL2FwcC9zcmMvbWFpbi9BbmRyb2lkTWFuaWZlc3QueG1sJyksICd1dGY4Jyk7CiAgY29uc3QgbGF5b3V0ID0gYXdhaXQgcmVhZEZpbGUoam9pbihyb290LCAndWkvZGlnaXJ1cGVlLWxheW91dC12My5qcycpLCAndXRmOCcpOwoKICBhc3NlcnQubWF0Y2gobWFpbiwgL3NldERlY29yRml0c1N5c3RlbVdpbmRvd3NcKGZhbHNlXCkvKTsKICBhc3NlcnQubWF0Y2gobWFpbiwgL1dpbmRvd0luc2V0c1wuVHlwZVwuZGlzcGxheUN1dG91dFwoXCkvKTsKICBhc3NlcnQubWF0Y2gobWFpbiwgL0ZyYW1lTGF5b3V0IHJvb3RWaWV3Lyk7CiAgYXNzZXJ0Lm1hdGNoKG1hbmlmZXN0LCAvYW5kcm9pZDp3aW5kb3dTb2Z0SW5wdXRNb2RlPSJhZGp1c3RSZXNpemUiLyk7CiAgYXNzZXJ0Lm1hdGNoKGxheW91dCwgL2RvIG5vdCByZWJ1aWxkICN2NjFyb290IGhlcmUvKTsKICBhc3NlcnQubWF0Y2gobGF5b3V0LCAvQmFja2dyb3VuZCByZWZyZXNoIG11c3Qgbm90IHJlcGxhY2UgYSBmb2N1c2VkIGlucHV0Lyk7Cn0pOwo=', 'base64').toString('utf8');
await writeFile('tests/digirupee-pool-flow.test.mjs', testContent, 'utf8');

const server = await readFile(serverPath, 'utf8');
const main = await readFile(mainPath, 'utf8');
const manifest = await readFile('android/app/src/main/AndroidManifest.xml', 'utf8');
if (!server.includes('tron-address.released_after_confirmation')) throw new Error('confirmed-address release audit is missing');
if (!server.includes('digiOrderNeedsExclusiveAddress')) throw new Error('exclusive address helper is missing');
if (!server.includes("releaseDigiAddress(order, now, { confirmed: true })")) throw new Error('confirmation path does not release address');
if (!main.includes('setDecorFitsSystemWindows(false)')) throw new Error('Android decor inset handling is missing');
if (!main.includes('WindowInsets.Type.displayCutout()')) throw new Error('Android display cutout inset handling is missing');
if (!manifest.includes('android:windowSoftInputMode="adjustResize"')) throw new Error('Android adjustResize is missing');

console.log('V7 patch applied: confirmed deposits recycle the 3-address pool and Android safe insets are enforced.');
