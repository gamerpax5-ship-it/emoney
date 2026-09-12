# Production checklist

The UI and prototype logic are packaged as approved. Before real-money launch, implement and test these server-side controls:

1. Authenticated user sessions with secure password hashing / MFA options.
2. Server-owned rates, bank-account configuration, wallet/address configuration and campaign settings.
3. Server-owned order state machine and immutable audit history.
4. Bank receipt verification before crypto delivery.
5. Blockchain transaction monitoring and confirmation policy.
6. Idempotent reward/referral claims; never trust client-side counters.
7. File upload malware/content checks and private object storage for payment proof.
8. Role-based administrator access, admin action audit logs and alert delivery.
9. Rate limits, abuse controls, CSRF/XSS review and security headers.
10. Database backups, reconciliation, observability and incident procedures.
11. Legal/compliance review for the jurisdictions and payment providers actually used.
12. Signed Android release build with a protected signing key and Play/App Store review preparation.
