# TRONPAY / LOKTRON

This repository contains the two approved front-end products:

- **`android/`** — buildable Android WebView APK project bundling the approved WTRON P2P mobile HTML UI and its local application logic.
- **`website/`** — the approved LOKTRON premium-wave website and buyer dashboard.

## Website

```bash
npm start
```

Open `http://localhost:3000`. Health check: `GET /health`.

The same site can also be opened directly from `website/index.html`, but serving it through HTTP is recommended.

## Android APK

The Android project uses a local WebView asset bundle, so the approved UI does not depend on a remote website. It supports JavaScript, localStorage/DOM storage, navigation, and HTML file inputs for payment-proof selection.

GitHub Actions automatically builds:

- `app-debug.apk`
- `app-release-unsigned.apk`

from `.github/workflows/android-apk.yml`.

## Important production note

The current approved HTML products contain prototype/local browser state for user/order/reward data. Real authentication, administrator alerts, bank verification, user balances, reward authorization, blockchain monitoring, rate management, and irreversible payment/crypto settlement must be moved to an authenticated server/API before handling real funds. Do not treat browser `localStorage` as a production ledger.
