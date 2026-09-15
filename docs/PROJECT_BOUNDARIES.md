# Project boundaries: LOKTRON vs digiRupee

LOKTRON and digiRupee are separate products that currently live in one repository and share one Node/Railway runtime. Shared hosting does **not** mean shared product UI or product state.

## LOKTRON

Canonical product files:

- `website/src/part-001.html` ... `website/src/part-011.html` — editable LOKTRON website/dashboard source.
- `website/assemble-src.mjs` — assembles the LOKTRON source parts into `website/index.html` at startup.
- `website/admin.html` — LOKTRON operations/admin console.
- `website/assets/loktron-*` — LOKTRON visual assets.
- LOKTRON API namespace — `/api/*`, except `/api/digirupee/*`.
- LOKTRON runtime state — root database fields such as `db.config`, `db.users`, `db.orders`, `db.bankLedger`, `db.tickets`, `db.auditLog`.

LOKTRON-only work must not modify `ui/digirupee-*`, `website/digirupee-admin.html`, `android/`, or `db.digirupee` behavior.

## digiRupee

Canonical product files:

- `ui/digirupee-app.js` — digiRupee app behavior/auth/UI.
- `ui/digirupee-layout-v3.js` — digiRupee main app layout/presentation.
- `ui/digirupee-rewards.js` — digiRupee rewards presentation.
- `ui/digirupee-qr.js` — digiRupee QR rendering.
- `website/digirupee-admin.html` — digiRupee admin console.
- `android/` — digiRupee Android project.
- `scripts/prepare-assets.mjs` — generates hosted digiRupee assets such as `/digirupee-app.html` from the canonical digiRupee sources.
- digiRupee API namespace — `/api/digirupee/*`.
- digiRupee runtime state — `db.digirupee.*`.

The Android client does **not** use the LOKTRON homepage. `MainActivity` resolves the configured HTTPS root to `/digirupee-app.html` and the web app calls `/api/digirupee/*`.

The Android Java namespace/application ID still contains the legacy technical package `com.loktron.tronpay`. Do not rename it casually: changing an Android application ID creates a different app identity for installs/signing. Product branding remains digiRupee.

## Shared infrastructure

The following are intentionally shared infrastructure and require extra care:

- `website/server.mjs` — one HTTP process contains both product backends. LOKTRON routes use the normal `/api/*` branch; digiRupee is dispatched first from `/api/digirupee/*` into `digirupeeApi()`.
- `package.json`, `Dockerfile`, `railway.json` — common deployment/runtime.
- persistence and server process — currently shared physically, while product state is separated logically.
- admin credentials/helpers may be reused by both consoles, but each console operates on its own product data paths.

## Change rule

Before every change, classify it as one of:

1. `LOKTRON ONLY`
2. `DIGIRUPEE ONLY`
3. `SHARED INFRASTRUCTURE`

For LOKTRON-only changes, verify the final diff contains no digiRupee UI/Android files and no intentional changes to `db.digirupee` logic. For digiRupee-only changes, verify the LOKTRON source parts/admin flow are unchanged. If `website/server.mjs` must be edited, inspect both namespaces and run both relevant tests before deployment.

Do not treat a shared domain, repository, port, or server process as evidence that the two products are the same application.
