# Elmo app-protocol leads and validation order

Reviewed October 21, 2026 (America/New_York).

## What this adds

The earlier project report, **Elmo_B6572_Teardown_Research_and_Disassembly_Guide.pdf**, revision dated October 18, 2026, pages 17–20 and 32, contains app-side protocol findings that were missing from Sasori's current assessment. This register preserves those findings as **PRIOR-REPORT / NOT INDEPENDENTLY REPRODUCED**. The PDF was read during this review; the archived APK, its signature, its hash, and its method bodies were not independently checked in this session.

The existing community GATT table independently reports the same UUID strings. Agreement between documents helps select inspection targets; it does not demonstrate authentication or successful commands on this toy.

## Reported source provenance

| Item              | Earlier report's claim                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| Package           | `com.hasbro.ElmoLove2Learn`                                                                       |
| Version           | `1.5.1`, manifest version code `39366`                                                            |
| Archive           | Source S17: `https://d.apkpure.com/b/APK/com.hasbro.ElmoLove2Learn?versionCode=39366`             |
| Reported APK size | 66,327,311 bytes                                                                                  |
| Reported SHA-256  | `5bf060fc681ece7746a9ced0b1ed6fc0ae9167c4c5c1b79bdb9eee1e05df4118`                                |
| Logic location    | Unity managed assembly `Assembly-CSharp.dll`                                                      |
| Current evidence  | Project PDF summary; no independently inspected binary or disassembly attached to this repository |

The archive is a provenance reference, not an installation recommendation or authenticated publisher distribution. No APK, recovered code, firmware, credentials, or audio is included here.

## Candidate application messages

These are reported **app-side** layouts from page 19, not a verified wire specification. DATA and CTRL refer to the candidate write characteristics in the [protocol assessment](../../docs/protocol.md). Even a query requires an application write; the current laboratory cannot send these messages.

| Reported purpose      | Candidate channel | Reported payload                                               | Evidence still needed                                                   |
| --------------------- | ----------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Firmware request      | CTRL              | `01`                                                           | Exact writer, response framing, and effect on this unit                 |
| Input-state request   | DATA              | `20`                                                           | Exact writer, response length, and repeatable input correlation         |
| Battery request       | DATA              | `21`                                                           | Exact writer, response encoding and units                               |
| Volume request        | DATA              | `22`                                                           | Exact writer and response encoding                                      |
| Set volume            | DATA              | `23 vv`, app range 1–15                                        | Actual device range and behavior; later milestone                       |
| Stored-audio playback | DATA              | `10 ll hh`, reported 16-bit sentence ID in little-endian order | Valid ID, prerequisites, and associated physical behavior               |
| Password message      | DATA              | `40 …`, reported 16-byte MD5 result                            | Password encoding, complete packet layout, and acceptance rules         |
| Security challenge    | DATA              | `41 …`                                                         | Challenge layout, digest combination, Fletcher32 variant and byte order |

The report also lists settings and file-transfer definitions. Those are deferred until basic protocol exchanges and recovery behavior are established. A sentence ID does not provide text-to-speech or live audio streaming.

## Authentication: useful lead, incomplete algorithm

Page 20 reports password-status values `0 = needed`, `1 = accepted`, `2 = failed`, an MD5-derived password value, and a challenge response combining that value with a received challenge before Fletcher32. This is enough to guide a source review, but not enough to implement an interoperable handshake.

Before implementation, recover and verify the complete source behavior: text encoding and normalization, concatenation order, checksum variant, initialization, padding, endianness, message framing, timing, and bounded retry behavior. Establish which received frame carries the status and how to distinguish a stale or unsolicited message from acceptance of the current exchange. An isolated `01`, a BLE connection, or a notification subscription must never be classified as authentication success.

Use a legitimately known password when that stage is reached. No password guessing, reset, or replay is part of the first inspection.

## Next experiment and order of work

1. Use the existing [iPhone first-capture sequence](../../docs/iphone-setup.md#first-two-live-captures) to establish metadata and a data-notification baseline on this unit. Collect source, software version, selected UUID, stage, outcome, and byte counts.
2. Reproduce relevant app method bodies against a legitimately obtained archival package, verifying provenance and complete packet construction. Record negative findings and unresolved details.
3. Correlate received data with the source definitions. Silence does not establish that a password is required or that a characteristic is wrong. Do not infer frame boundaries from a single notification.
4. Design a separately reviewed, finite authentication experiment only after its construction and success/rejection criteria are established.
5. Validate one documented status query before playback or settings changes. A status query is a write and is not enabled by the current inspection release.
6. Evaluate physical behavior and recovery before audio uploads, actuator commands, or firmware changes.

Success for the present milestone is a reproducible, labeled live capture, or a precise failed stage that narrows the next investigation. It is not yet a speaking or moving Elmo.

## References

- Project report: **Elmo_B6572_Teardown_Research_and_Disassembly_Guide.pdf**, October 18, 2026 revision, pages 17–20 and 32; retrieved from the owner's existing project files on October 21, 2026. Its app-side analysis claims remain unverified by this review. The report is not bundled or publicly linked here.
- [NonaSuomy/Love2LearnElmo, README at commit 82fa312e06af1d8e549cec588856ebce227b5f77](https://github.com/NonaSuomy/Love2LearnElmo/blob/82fa312e06af1d8e549cec588856ebce227b5f77/README.md): firsthand community notebook and GATT table. No license was found in the previously inspected tree; no implementation copied.
- [Hasbro historical app terms](https://docs.hasbro.com/en-us/legal/app-terms?ID=108): password context, not a wire specification.
- [Current evidence register](evidence-register.md) and [historical inbound examples](protocol-notifications.md): preserve the distinction between prior observations and new hardware tests.
