# Supabase security note

The currently visible Supabase project contains WPAY-looking tables, including
`payment_links`, `payment_orders`, `devices`, and related device and statement
tables. They are not proven to be the eMoney persistence project.

No schema, data, policies, or functions were changed during the eMoney
hardening work. In particular, the security advisor finding about mutable
`search_path` on `public.wpay_capture_location_history` remains an external
finding for that separate system.

Before any remediation, identify the owning application, document its access
paths and required policies, and obtain an explicit migration plan. The eMoney
service expects only `public.loktron_state` and `public.loktron_files` from its
repository migration, with RLS enabled, `anon` and `authenticated` revoked,
and `service_role` granted access.
