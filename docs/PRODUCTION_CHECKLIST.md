# Production checklist

The UI and prototype logic are packaged as approved. Before real-money launch, implement and test these server-side controls:

- [x] Authenticated user sessions with secure password hashing.
- [x] Admin MFA hook and role-separated admin sessions.
- [ ] User account recovery delivery channel.
- [x] Server-owned rates, bank-account configuration, wallet configuration and order calculations.
- [x] Server-owned order state machine and tamper-evident chained audit history.
- [x] Explicit administrator bank-receipt verification gate before settlement.
- [x] Manual bank-ledger import and automatic UTR/amount reconciliation.
- [ ] Direct bank/API receipt feed integration.
- [x] Unique TRON transaction ID required before an order can be marked sent.
- [x] Confirmed on-chain USDT contract, recipient and exact amount verification at settlement.
- [ ] Background re-checks, reorg policy and independent reconciliation provider.
- [x] Idempotent order submission; browser counters are not trusted.
- [x] Image signature/size checks and authenticated payment-proof retrieval.
- [ ] Antivirus/content scanning and dedicated private Supabase Storage bucket.
- [x] Administrator action audit events.
- [x] Multiple administrator roles, optional admin MFA and optional alert webhook delivery.
- [x] Basic rate limits, same-origin mutation checks and security headers.
- [x] Admin runtime backup export and health/ready reporting.
- [ ] Distributed abuse controls, backup restore drill, observability and incident procedures.
- [ ] Legal/compliance review for the jurisdictions and payment providers actually used.
- [x] Android workflow supports signed release when protected signing secrets are configured.
- [ ] Store-review preparation and upload.
