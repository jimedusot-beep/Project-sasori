# Gated live experiment: known credential, then one status query

**Historical draft:** the October 23 [recovered-source review](recovered-source.md) and [experimental desktop procedure](../../desktop/README.md#experimental-elmo-known-password-check) now supersede this document's missing-artifact/construction prerequisites for that bounded client. The original draft below remains unchanged as a preparation record; it is not the new client's runbook or evidence of a real hardware result.

**DRAFT / NOT READY / NO APPLICATION WRITES AUTHORIZED BY THIS DOCUMENT.** Prepared October 21, 2026 (America/New_York). [Source verification](source-verification.md) leaves G1–G8 open. This is a preparation record, not an executable sequence or a claim that the complete protocol or unit characteristics are confirmed.

## Question and prerequisites

Question: after source and unit validation, does this owned unit accept the owner's known credential and return a valid, current response to one verified non-actuating status query?

| Gate                       | Required evidence before a live application exchange                                                                                                                                                                                 | Present status                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Unit identity              | Owner-observed model/revision, original power arrangement, firmware if obtainable without reset, exact observed service and authentication/status endpoint properties                                                                | Not supplied by this review; public B6572 documents do not identify the owner's unit |
| Baseline                   | Five labeled foreground inspections with metadata and raw evidence retained privately as appropriate, actual iOS/Bluefy versions, selected channels, counts and precise failure stages; manual stop and background stop demonstrated | Historical V4 summaries only                                                         |
| Complete relevant protocol | Full source-traced framing, lengths, write method, checksum/digest construction, receive parsing/correlation, sequence, error and timing behavior for authentication and the status query; all G1–G6 closed                          | Missing; no constructor, MD5/Fletcher32 variant or response marker selected          |
| Offline vectors            | Independent original implementation matches source-derived synthetic vectors for construction, acceptance, rejection, malformed/truncated/stale data and timeouts; exact provenance retained                                         | Only historical RX display/envelope tests exist                                      |
| Known credential           | Owner privately confirms the current password, with no reset, guessing, derivation from someone else's toy, or capture replay                                                                                                        | Not collected; do not post it in GitHub or chat logs                                 |
| Reviewed runner            | Separate implementation review establishes finite budgets, foreground cancellation, manual stop, late-callback handling, secret exclusion and teardown; physical mechanism secured with accessible normal power switch               | Current Sasori transport intentionally cannot send application messages              |

Completeness is required for every operation admitted to this experiment. Other report message families remain unresolved and excluded; do not describe the entire Elmo protocol as complete on the strength of one successful exchange.

## Proposed upper bounds for the future runner

These are conservative engineering ceilings, not timings or lengths recovered from Elmo. Before enabling anything, replace the candidate transcript with a fully sourced exact frame/length/characteristic sequence that fits within these ceilings. If verified behavior needs more traffic, revise and review the plan first; do not truncate the protocol or improvise retries.

| Resource            | Ceiling per manually started trial                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Connections         | One owned device, one connection; no reconnect                                                                                                    |
| Chooser time        | 45 seconds, before any credential acquisition                                                                                                     |
| Connected trial     | 30 seconds maximum, with 6 seconds maximum for each awaited operation and the overall deadline taking precedence                                  |
| Credential attempts | One attempt using the one known current credential; zero guesses and zero automatic retries                                                       |
| Application TX      | At most four source-defined frames and 64 total bytes, including the single status query; exact count and lengths must be fixed before the trial  |
| Application RX      | At most 32 notifications, 1,024 bytes per notification and 8,192 total bytes; overflow stops the trial as inconclusive                            |
| Status operations   | One verified query after explicit current-session authentication acceptance; no setter, playback, upload, firmware action, reset or motor command |

Subscription descriptor operations and GATT discovery must be enumerated separately in the runner review; they are not application messages or authentication proof. Stop on a deadline, rejection, disconnect, owner stop, page backgrounding, unexpected response or unexpected physical behavior. Never extend a budget automatically. No background run is permitted.

## Sequence after every gate is closed

1. Retain the unchanged original assembly and intended power arrangement; secure the mechanism, keep the normal power switch accessible, disconnect competing BLE apps. Record a private local trial ID, model/revision, firmware, software versions and selected profile. Do not publish unique identifiers.
2. On one deliberate owner action, open the chooser, connect to the identified unit, verify the observed service/properties and subscribe in the source-proven order. A mismatch ends the trial without application writes.
3. Obtain the known credential only in the separately reviewed private runner. Keep it and its digest/challenge/response out of storage, diagnostics, exports, command arguments, screenshots and crash reports. Release references on every exit; do not claim JavaScript can guarantee memory zeroization.
4. Follow only the exact reviewed authentication transcript. An unfamiliar frame, missing challenge, non-current response or unexpected status ends the trial; do not try a second interpretation or password.
5. Only an exact, fresh, source-defined acceptance response permits the one verified status query. The current candidate lead is a volume read from the report; its request, framing, characteristic, write method, response and units remain unspecified here. It must be source-verified before selection. A query is still an application write.
6. Parse and correlate its response using the verified specification; compare against an independently available unchanged status value if the original app legitimately exposes it. If the value cannot be corroborated, report that limit. Close listeners/subscriptions, disconnect and discard credential-related data on every exit. No playback or settings change follows automatically, even after success.

No command bytes, real password, digest, challenge or response belong in this draft. The reported password-status values in the source review are not sufficient to implement steps 4–5.

## Explicit outcomes

| Outcome          | Required evidence                                                                                                                                                                                                                                         | Consequence                                                                                                                                     |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Accepted**     | Source-defined complete acceptance frame, appropriate stage and fresh request correlation in this connection, followed by a complete correlated response to the verified status query with valid encoding/range and documented corroboration or its limit | Conclude only that this credential/query worked for this unit and firmware in this trial. Stop; playback/settings require later verified plans. |
| **Rejected**     | Complete, source-defined and current-session credential rejection, or an explicit source-defined query rejection after accepted authentication                                                                                                            | Stop immediately. Report rejection stage without publishing private bytes. No retry, alternative credential or reset.                           |
| **Inconclusive** | Any prerequisite missing; silence, timeout, disconnect, overflow, malformed/partial/unexpected/stale/unsolicited data, unknown response semantics, cancellation or physical stop; authentication acceptance with no validated query response              | Stop. Preserve private evidence if appropriate; record the failed stage and missing fact. Never label this rejection or acceptance.             |

Do not deliberately send an incorrect password to force the rejected branch. Test that branch offline against non-secret, source-established vectors. Neither BLE connection, subscription completion, `NewModeIdx:12`, `Start:LowPowerSleep`, an isolated `01`, the imported outcome string nor synthetic UI success is authentication evidence.

## Record and continuation

The private result records prerequisite evidence references, exact reviewed software/source revision, planned/actual byte and time budgets, stage sequence, outcome and reason, response-validation result, interruption and teardown. Raw authentication data stays private and out of shared artifacts. Public results can report outcome/stage/counts/limitations after review; they must not include the credential, its digest or challenge-response material.

Today's result: **inconclusive before connection; source/unit prerequisites unavailable; zero live traffic from this review.** This draft does not block replacement-controller simulations, wiring identification, actuator characterization or measured mechanical work. Those retain their own electrical/mechanical acceptance criteria and do not depend on original BLE authentication.
