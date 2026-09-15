# LOKTRON + digiRupee monorepo

This repository contains **two separate products** that currently share one deployment/runtime:

- **LOKTRON** — web purchase platform and its operations console.
- **digiRupee** — separate sell-USDT product with its own hosted app UI, admin console, API namespace, state namespace and Android client.

Read `docs/PROJECT_BOUNDARIES.md` before changing either product.

## LOKTRON

Canonical LOKTRON files:

- `website/src/part-001.html` ... `website/src/part-011.html` — editable website/dashboard source.
- `website/assemble-src.mjs` — generates `website/index.html` from those source parts.
- `website/admin.html` — LOKTRON operations console.
- `website/assets/loktron-*` — LOKTRON assets.
- API: `/api/*` except `/api/digirupee/*`.
- Runtime state: root fields such as `db.config`, `db.users`, `db.orders`, `db.bankLedger`, `db.tickets` and `db.auditLog`.

Start the shared server with:

```bash
npm start
```

Local LOKTRON site: `http://localhost:3000/`

LOKTRON admin: `http://localhost:3000/admin.html`

The LOKTRON server flow includes signed sessions, scrypt password hashes, server-owned rates and bank details, idempotent orders, duplicate UTR protection, private proof access, controlled payment-review/settlement transitions, TRON transaction verification, audit events, request limits and optional Supabase-backed persistence.

## digiRupee

Canonical digiRupee files:

- `ui/digirupee-app.js` — digiRupee app/auth/UI behavior.
- `ui/digirupee-layout-v3.js` — digiRupee main layout.
- `ui/digirupee-rewards.js` — digiRupee rewards UI.
- `ui/digirupee-qr.js` — digiRupee QR rendering.
- `website/digirupee-admin.html` — digiRupee admin console.
- `android/` — digiRupee Android client.
- `scripts/prepare-assets.mjs` — prepares the hosted digiRupee assets at startup.
- API: `/api/digirupee/*`.
- Runtime state: `db.digirupee.*`.

The Android client is branded **digiRupee**. It does **not** load the LOKTRON homepage. `MainActivity` resolves the configured HTTPS root to:

```text
/digirupee-app.html
```

The hosted digiRupee app then uses `/api/digirupee/*` for its own auth, rates, payout methods, orders, rewards, referrals, support and admin operations.

The production Android host is `https://digirupee.loktron.com/`. The subdomain exposes only the APK download page and digiRupee admin login to normal browsers; the hosted app shell is accepted only from the digiRupee Android WebView. Override the target at build time with `-PwebAppUrl=<url>` or `DIGIRUPEE_WEB_APP_URL`.

The Android Java namespace/application ID still uses the legacy technical package `com.loktron.tronpay`. Do not rename it casually because changing the application ID changes Android app identity. Product branding and product logic remain digiRupee.

GitHub Actions builds:

- `app-debug.apk`
- `app-release-unsigned.apk`

To produce a signed release APK, configure the Android signing secrets used by `.github/workflows/android-apk.yml`.

## Shared infrastructure

These files are shared infrastructure, so changes require checking both products:

- `website/server.mjs`
- `package.json`
- `Dockerfile`
- `railway.json`
- persistence/runtime process

`website/server.mjs` contains both backends, but the request dispatcher keeps them separate: `/api/digirupee/*` is sent to the digiRupee API handler, while the remaining `/api/*` routes belong to LOKTRON.

A shared GitHub repo, Railway service, domain or public port does **not** make LOKTRON and digiRupee the same product.

## Production environment

Common/shared deployment variables include:

```text
NODE_ENV=production
SESSION_SECRET=<long random secret>
ADMIN_EMAIL=<private admin email>
ADMIN_PASSWORD=<strong secret>  # or ADMIN_PASSWORD_HASH=<scrypt$...>
ADMIN_MFA_CODE=<optional admin code>
ADMIN_ROLE=owner
PUBLIC_ORIGIN=https://loktron.com
SUPABASE_URL=<project URL>
SUPABASE_SECRET_KEY=<server-only secret key>
# Legacy compatibility names:
LOKTRON_SUPABASE_URL=<project URL>
LOKTRON_SUPABASE_KEY=<server-only secret/service key>
LOKTRON_PERSISTENCE_SECRET=<long random persistence secret>
TRON_VERIFY_MODE=required
TRONGRID_API_KEY=<server key>
DIGIRUPEE_2FA_ENCRYPTION_KEY=<server-only encryption key>
```

Never expose server-only persistence, admin, TRON provider or digiRupee 2FA secrets in browser or Android source. The backend accepts SUPABASE_URL and SUPABASE_SECRET_KEY, with the legacy LOKTRON_SUPABASE_URL and LOKTRON_SUPABASE_KEY names retained for migration compatibility. Apply the SQL migration in supabase/migrations/ to the production Supabase project before enabling persistence. The /health route remains public; /ready returns 503 until required production configuration is complete.

## Change safety rule

Before editing, classify the work as **LOKTRON ONLY**, **DIGIRUPEE ONLY**, or **SHARED INFRASTRUCTURE**. For product-only work, keep the other product out of the final diff. If `website/server.mjs` is touched, inspect both namespaces and run the relevant LOKTRON and digiRupee tests before deployment.
