# Production configuration checklist

The `/ready` endpoint is the production gate. Railway must use `/ready` as
its health check so a process with incomplete configuration cannot be marked
healthy.

Required in `NODE_ENV=production`:

- `SESSION_SECRET`
- Either `ADMIN_USERS` containing at least one valid email and password or
  password hash, or `ADMIN_EMAIL` plus `ADMIN_PASSWORD` or
  `ADMIN_PASSWORD_HASH`
- `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (or the retained
  `LOKTRON_SUPABASE_URL` and `LOKTRON_SUPABASE_KEY` names), plus
  `LOKTRON_PERSISTENCE_SECRET`
- `TRON_VERIFY_MODE=required`, `TRONGRID_API_KEY`, and a valid
  `TRON_USDT_CONTRACT`
- `DIGIRUPEE_2FA_ENCRYPTION_KEY` for production two-factor setup

The persistence migration is repository-owned at
`supabase/migrations/20260915000100_loktron_persistence.sql`. Apply it only to
the Supabase project dedicated to this service. The Node backend uses the
service role; browser clients must not receive these credentials.

`health` remains a diagnostic endpoint. `ready` must return HTTP 503 until all
required production checks pass.

Use Node 20.20.2 for local verification. The repository records that version
in `.nvmrc`, and CI pins the same release.
