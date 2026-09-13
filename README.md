# TRONPAY / LOKTRON

This repository contains the LOKTRON web platform and digiRupee Android client:

- **`website/`** — the approved LOKTRON premium-wave website, buyer dashboard, authenticated API and operations console.
- **`android/`** — the digiRupee Android client project.

## Website

```bash
npm start
```

Open `http://localhost:3000`. Health check: `GET /health`.

Admin console: `http://localhost:3000/admin.html`.

The implemented server flow includes:

- signed HttpOnly user sessions and scrypt password hashes;
- server-owned rates, bank details, wallets and order calculations;
- idempotent order submission and duplicate UTR protection;
- private payment-proof access for authenticated administrators;
- controlled `Under Review → Payment Verified → USDT Sent` transitions;
- a unique confirmed TRON USDT transaction matching the exact wallet and amount before completion in production;
- tamper-evident chained audit events, request limits and same-origin checks;
- optional Supabase-backed runtime persistence.

Production environment variables:

```text
NODE_ENV=production
SESSION_SECRET=<long random secret>
ADMIN_EMAIL=<private admin email>
ADMIN_PASSWORD=<strong secret>  # or ADMIN_PASSWORD_HASH=<scrypt$...>
ADMIN_MFA_CODE=<optional admin one-time/shared code>
ADMIN_ROLE=owner
ALERT_WEBHOOK_URL=<optional admin alert webhook>
PUBLIC_ORIGIN=https://your-domain.example
LOKTRON_SUPABASE_URL=<project URL>
LOKTRON_SUPABASE_KEY=<server-only secret/service key>
LOKTRON_PERSISTENCE_SECRET=<long random persistence secret>
TRON_VERIFY_MODE=required
TRONGRID_API_KEY=<recommended TronGrid server key>
```

Never expose `LOKTRON_SUPABASE_KEY` to browser or Android code. The `/health` route returns `503` in production when a required production setting is missing.

For multiple administrators, set `ADMIN_USERS` to a JSON array such as:

```json
[{"email":"owner@example.com","password":"...","role":"owner","mfaCode":"123456"},{"email":"ops@example.com","password":"...","role":"ops"}]
```

Admin roles are `owner`, `ops`, and `support`. The admin console also supports bank-ledger CSV import for UTR/amount reconciliation and JSON backup export.

The same site can also be opened directly from `website/index.html`, but serving it through HTTP is recommended.

## Android APK

The Android project is branded as **digiRupee** and loads the live LOKTRON website in a secure WebView:

```text
https://tronpay-production.up.railway.app/
```

That keeps Android on the same production UI and backend logic as the website. It supports JavaScript, HttpOnly session cookies, localStorage/DOM storage, navigation, and HTML file inputs for payment-proof selection. Override the target site at build time with `-PwebAppUrl=<url>` or `DIGIRUPEE_WEB_APP_URL`.

GitHub Actions automatically builds:

- `app-debug.apk`
- `app-release-unsigned.apk`

To produce `digiRupee-release-signed.apk`, add these GitHub Actions secrets:

```text
ANDROID_KEYSTORE_BASE64
ANDROID_KEY_ALIAS
ANDROID_KEY_PASSWORD
ANDROID_STORE_PASSWORD
```

from `.github/workflows/android-apk.yml`.

## Important production note

The browser is no longer the source of truth for user, wallet or order state. Bank receipt verification can be done manually or by importing a bank ledger for UTR/amount reconciliation. In production, a confirmed TRON USDT transfer must match the order's contract, destination wallet and exact amount before completion. Direct bank API verification, automated wallet signing, user account recovery delivery, private Supabase Storage and store-review preparation are still separate production integrations; see `docs/PRODUCTION_CHECKLIST.md`.
