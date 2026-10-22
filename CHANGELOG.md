# Changelog

## Unreleased

- Connect earlier Elmo app-protocol research to the current evidence assessment, label its unreproduced provenance, and document the first two labeled iPhone captures and their export requirements.
- Export only recognized metadata fields from nested diagnostic, service, characteristic, and statistics objects. Generic diagnostic details are omitted from session exports and backups; explicit raw export still includes packet hex/text.
- Serialize record deletions with pending saves so an earlier queued write cannot restore a deleted record in the same browser tab.
- Add regressions for nested backup payloads, large in-memory captures exported as metadata, and pending-save/deletion ordering in IndexedDB and temporary storage.

## 0.2.0 — October 21, 2026

- Replace the single script with isolated transport/profile/protocol/auth/guard/diagnostic/storage/simulation/UI modules.
- Add the attributed community Elmo UUID profile; preserve the unrecovered V4 source status.
- Bound connection operations, inspection duration, notifications, and retained packet bytes; distinguish stop reasons and stale callbacks.
- Add persistent research records, notes, search, comparisons, validated imports, migrations, and metadata backups.
- Add visible simulation, synthetic authentication outcomes, virtual sequences, and phone-local audio previews.
- Preserve the offline hex analyzer and historical inbound fixtures from the newer main-branch research work; integrate them into Protocol explorer.
- Add pinned tooling, fake GATT/IndexedDB integration tests, browser/accessibility checks, dependency/credential checks, verified Pages deployment, and experimental release automation.
- Add current architecture, protocol, research/license, troubleshooting, safety, interoperability, audit, and test documentation.

No hardware authentication, voice, motor, or firmware commands are enabled.

## 0.1.0

Initial inspection-only Elmo probe and historical research records. Physical reproduction remained pending.
