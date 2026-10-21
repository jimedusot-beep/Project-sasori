# Implementation audit — v0.2.0

## Starting state

Initial head: 74bbe0ddbd2a7c5b5303658e90b329e115bfbb99. The repository had a single imperative BLE script, a small static UI, four text-based checks, historical notes, and separate Verify/Pages workflows. All four baseline checks passed.

Pages run 39525582537 failed at configure-pages: Get Pages site failed / Not Found, with enablement false. The starter had no persistent sessions, operation deadlines, imported-file validation, comparison workflow, or modular physical-control boundary.

## Preserved concurrent work

During implementation, main advanced to f062fba2071755f3496efe4ee3a15cb9bfbe1a1b through the earlier research pull request. The branch was explicitly merged rather than overwritten.

While the chat was paused, PR #2 was merged at 4a4c4e993a87bf040348b5577f005320d3c5dea1 with additional audits. This follow-up preserves its deliberate Show all Bluetooth devices fallback and historical-byte regressions. Legacy UI test sources remain in docs/archived-tests; current functional regressions run under tests/.

Preserved: seven-area engineering dossier, technology reuse matrix, evidence register, iPhone UUID capture guide, historical inbound bytes, offline packet module, and its seven parser regressions. Offline analysis is integrated into Protocol explorer. The old imperative UI controller and its VM-based tests are superseded by the modular controller and broader fake-GATT lifecycle regressions, covering the same stop/listener/notification cases.

The newly available historical bytes informed candidate-prefix matching without assigning an opcode meaning. No historical packet became a transmit command.

## Repairs and additions

- Transport generation guards, cancellation, chooser/operation/inspection budgets, packet caps, explicit stop reasons, and listener cleanup.
- Source-attributed Elmo candidate UUIDs with explicit loading and no automatic connection.
- Separate transport, profiles, protocol, auth fixture, command guard, diagnostics, storage, simulator, and UI modules.
- IndexedDB records/settings and migrations; whole-batch validation; no overwrite-on-import; visible provenance and temporary fallback.
- Payload omission by default, pattern sanitization, inert imported markup, CSP, local-only operation, and no runtime network senders.
- Mobile UI with accessible labels, notes, search, comparison, backups, offline analysis, guided errors, and simulation.
- Locked physical capabilities and finite local virtual/audio previews.
- CI checks and browser/accessibility gates before Pages; experimental releases after successful publishing.

## Verification findings corrected during development

1. Missing synthetic label on the simulator's service event: fixed and covered by regression.
2. crypto.randomUUID unavailable on insecure HTTP previews: added local-record ID fallback; no credential role.
3. Virtual slider reset before its value was read: capture input before stopping the sequence.
4. Section navigation retained a previous scroll position: sections now open at the top.
5. Storage capacity checks could race across tabs: check and writes now share one IndexedDB transaction.
6. Imported live claims needed an explicit imported marker: added importedAt provenance and visible labels.
7. Earlier raw prefixed notifications were not recognized by text-only parsing: preserve bytes and label the historical candidate view.

## Current limits

No physical Elmo is accessible from the build environment. Native Bluefy Bluetooth support, firmware-specific UUIDs, repeatability, authentication framing/algorithm/success markers, Elmo voice, sensor meanings, motor limits, and hardware stops still require physical evidence.

No V4 source was recovered. No secure cloud/GitHub synchronization is implemented. Browser records can be evicted. Raw binary captures cannot be guaranteed secret-free. The local pattern scanner is narrower than a comprehensive secret-scanning service.

## Readiness assessment

Scores are engineering judgments, not product certification.

| Area                | Score / 10 | Basis                                                                                                              |
| ------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------ |
| Reliability         | 8          | Bounded lifecycle, cleanup and persistence regressions; real radio/OS behavior pending.                            |
| Safety              | 8          | No live command sender, opt-in inspection, budgets, no firmware operations; physical safeguards still external.    |
| Usability           | 8          | Mobile layouts, guided errors, accessible workflows and browser tests; actual iPhone/Bluefy session still needed.  |
| Bluetooth readiness | 6          | Concrete attributed candidate profile and tested transport; no independent real-device reproduction.               |
| Architecture        | 8          | Isolated adapters, versioned records, typed core and fail-closed future capabilities.                              |
| Testing             | 8          | Behavioral unit/integration, Chromium/WebKit and axe gates; no physical hardware coverage.                         |
| Documentation       | 8          | Setup, evidence, protocol unknowns, licensing, safety, recovery, and roadmap; hardware findings remain incomplete. |
