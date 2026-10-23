# Testing and release gates

## Local checks

```sh
npm ci
npm run check
npm audit --audit-level=high
```

The check script runs ESLint, Prettier verification, TypeScript checking for the typed core boundary, Node tests, Python standard-library tests, and recognized credential-pattern scanning. Use Python 3.9 or later. Browser-runtime source has no third-party dependencies.

Node tests exercise chooser gesture ordering, duplicate connects, cancelled selection, late GATT completion, operation deadlines, discovery/subscription failure, explicit/unexpected disconnects, listener cleanup, reconnects, the 500-notification budget, and malformed DataViews.

Protocol tests cover UTF-8 errors, byte offsets, size caps, unknown/fragmented messages, the historical prefixed notifications, and the preserved offline hex parser. None of these convert inbound data to commands.

Storage tests use fake-indexeddb to test actual object-store transactions, reloads, deletion, v1 migration, corruption, capacity, import atomicity, new import IDs, settings, and simultaneous writes. The memory fallback and metadata-only export policy are tested separately.

Synthetic authentication tests cover success, rejection, timeout, cancellation, inconclusive results, duplicate runs, explicit consent, and packet/time budget limits. These fixtures implement no Elmo handshake.

Control-family tests cover strict MiP ASCII-hex replies and binary queries, wrong/unsolicited/malformed response rejection, pending-query cancellation across reconnect, fixed blue/off writes and failed cleanup receipts. Trial tests exercise distinct-session counting, changed/unknown identity, failures, synthetic/imported exclusions, atomic storage limits and deletion. Python tests use synthetic APK ZIPs to check source-intake bounds, hashes, private exclusive outputs and explicit unverified provenance; simulator-smoke tests require render proof after a launch timeout.

## Browser checks

```sh
npx playwright install --with-deps chromium webkit
npm run test:browser
```

The same suite runs in desktop Chromium and iPhone 13-sized WebKit. Tests exercise synthetic session completion and persistence after reload, local note editing/search, downloads/imports, inert imported markup, invalid JSON, authentication fixtures, virtual controls, offline analysis, accessibility via axe, and horizontal-overflow checks across all five primary screens.

MiP fixtures exercise selected-family persistence, saved reconnects, the complete shared check recipe on web/native facades, observation editing/reload, export/import provenance, trial removal and responsive accessible UI. They use synthetic radio callbacks, including tests labeled live within their isolated test database; no fixture output is physical-device evidence.

For an already-running server, set SASORI_TEST_URL to its base URL. Remote Pages paths must retain the repository prefix. Test artifacts and traces are retained for seven days in GitHub Actions; fixtures contain no live hardware identifiers.

Internal implementation QA also exercised the running UI through the browser: simulation, saved records, notes, routing, offline analysis, and control fixtures. Browser preview HTTP origins cannot access live Bluetooth.

## Workflow gates

- Verify laboratory runs on feature branches, pull requests, and reusable calls.
- Deploy Pages runs the same verification first, then configures Pages, uploads site/, deploys, and fetches the published HTML and every imported module plus CSS/icon assets.
- Release metadata and milestones publish after successful software checks even if Pages setup is blocked; version-tag releases also run their own verification. No credential is exposed in shipped JavaScript.
- Direct action dependencies are pinned to inspected immutable SHAs. npm dependencies are lockfile-pinned.

The credential-pattern scanner detects common token/private-key forms in current text files. It is not a complete secret-scanning service and cannot recognize every binary or custom secret. Raw payloads must be reviewed privately before sharing.

## Hardware acceptance

Repeat five 15-second foreground inspections on the actual iPhone/Bluefy/Elmo combination with the same physical setup. Record date, app/OS versions, selected profile and provenance, observed properties, notification counts, error stage, and disconnect reason. Stop for unsafe physical behavior. Five clean runs are an engineering acceptance target, not a manufacturer specification.

Then test one deliberate manual stop and one page-background stop. Do not induce hardware power faults or mechanical binding. Keep credentials and private data out of public logs.

Passing Node, Chromium, or emulated WebKit does **not** prove the native Bluefy Bluetooth bridge, real radio reliability, Elmo authentication, or any physical command.

For supported controls use the [real-device trial procedure](device-action-validation.md#record-an-actual-check). Its ten fresh-connection review target adds owner-observed effect/recovery results; it does not replace Elmo's five inspection baselines or independently verify hardware.

## Original-BLE offline evidence checks

Packet-flag regressions reject strings, numbers, nulls, arrays and objects for optional `truncated`/`malformed` fields. Tests retain valid booleans and missing fields across v1/v2 imports and verify raw/metadata-only offline review rejects invalid flags. A browser regression imports a mixed backup with one invalid flag and confirms no record is saved, including after reload.

The [capture reviewer](../experiments/001-elmo-l2l/offline-review.md) runs locally with `npm run review:elmo -- /absolute/path/to/private-session.json`. Its count-only report does not echo private filenames, free text, arbitrary identifiers or payloads. Tests check metadata-only and deliberately raw exports, partial/contradictory retention, forged outcome/kind claims, unrelated service inventories, invalid envelopes, private error handling and CLI behavior. Synthetic session envelopes stay synthetic even when they contain historical example bytes.

The provenance-linked historical corpus has three RX vectors. Tests check byte lengths, SHA-256 integrity, exact text views and DataView offsets against the existing conservative decoder. These checks require no hardware, source archive or credentials and do not gate replacement-controller hardware development.

Following the October 23 source recovery, `desktop/tests/test_elmo_client.py` tests source-derived credential bytes/checksum/response vectors, explicit acceptance after a current response, malformed/unknown/early status rejection, no enrollment, no retries, channel/property checks, bounded operations, stop/disconnect cleanup, private diagnostics and an opt-in single greeting. CLI simulation requires no Bleak import or radio. Tests use synthetic credentials and fake notifications; they do not establish actual hardware acceptance or observed playback. See [the recovered-source record](../experiments/001-elmo-l2l/recovered-source.md).
