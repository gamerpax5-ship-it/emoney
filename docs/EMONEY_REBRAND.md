# eMoney mobile presentation layer

Scope: digiRupee client rebrand to eMoney, plus presentation build ordering. The LOKTRON product, server APIs, persistence and payment rules remain unchanged.

Canonical mobile source: `ui/emoney/index.html`, `style.css`, `app.js`, `qr-code.js` and `assets/`. The approved source artwork hashes are in `ui/emoney/asset-sha256.json`.

The final build runs `buildEMoney()` from `scripts/prepare-emoney.mjs` AFTER the existing `persistent-start.mjs` transformations and BEFORE loading `server-runtime.mjs`. Do not move it earlier: existing transformation scripts expect their legacy HTML/script hooks to still exist while they run. The final build writes only `website/digirupee-app.html`.

Internal compatibility identifiers remain `/api/digirupee/*`, `/digirupee-app.html`, `digirupee_session`, `DGR...` referral codes, the `DigiAndroid` bridge and the legacy digiRupee User-Agent token. Android application ID remains `com.loktron.tronpay` and the host remains the existing configured HTTPS endpoint.

No prototype credentials or sample transaction logic is included in the production client. Do not add mock accounts to `ui/emoney/app.js`; put fixtures only in development tests.

The approved design's sample amounts and promotional promises are not payment logic: always display server-supplied balances, quotes and eligibility. Rewards remain denominated in the server's USDT unit. The home summary is paid-out activity, not an invented custodial wallet balance.

Run `npm test`, then verify the actual Android build and real staging API flows before publishing. The package's standalone verification uses mocked API responses; it is not proof of live backend E2E success.
