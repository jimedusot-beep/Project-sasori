# Elmo BLE protocol: facts, candidates, and unknowns

Status: the experimental [browser remote](elmo-remote.md) and desktop client implement a known-password handshake, input/volume queries and one greeting request. The browser additionally supports [explicit first-time password setup and guided owner recovery](elmo-password-recovery.md). Native Elmo inspection remains separate. Relevant app-method facts are now established; real-unit compatibility, password persistence and physical effects remain unverified. See [recovered source and current gaps](../experiments/001-elmo-l2l/recovered-source.md).

## Provenance

Historical inbound bytes originate from the earlier V4 user-reported test, preserved in [protocol-notifications.md](../experiments/001-elmo-l2l/protocol-notifications.md). They are not a new capture from Sasori v0.2.

The GATT identifiers in site/lib/profiles.js are transcribed facts from [NonaSuomy/Love2LearnElmo at commit 82fa312e06af1d8e549cec588856ebce227b5f77](https://github.com/NonaSuomy/Love2LearnElmo/blob/82fa312e06af1d8e549cec588856ebce227b5f77/README.md), section ELMO_SERVICE_UUID. The original source blob is 5cbdcf5272a25ee4c17235b16570895b8bf2bf13. This single research notebook is not a manufacturer protocol document, and its results have not been independently reproduced on Jimmy's unit.

The app exposes that source and requires deliberate profile loading. It requests only the chosen service; Web Bluetooth cannot enumerate arbitrary ungranted services. Characteristic property names describe GATT capabilities, not valid Elmo commands, permissions at every security level, or safe physical actions.

## Inspection behavior

The default candidate profile uses the reported custom service and data-notify characteristic. Users may enter independently observed identifiers. An empty notify identifier performs metadata-only inspection. Subscription can change the GATT client-characteristic configuration descriptor, but no application characteristic writes are implemented.

The registry also records other reported notify/write characteristics for comparison, with every write entry explicitly blocked. Firmware services are excluded. No serial number, device address, password, or device identifier is intentionally read.

## Inbound interpretation

One notification is retained as one observation. This does not prove one notification equals one protocol frame. There is no speculative reassembly, checksum, packet replay, or generated command.

Known historical text patterns are NewModeIdx followed by digits and Start:LowPowerSleep. Their values and operational meanings remain unknown. In the recorded examples, candidate text begins after 0x60 or 0x61 and may end with null. The decoder preserves all received hex and raw display text, labels matching candidate text, and explicitly leaves prefix meaning unknown. An arbitrary joined or fragmented text sequence is not promoted to a known message.

Binary input is shown in hex with a malformed/non-UTF-8 flag where applicable. Live retention is capped at 1,024 bytes per notification; the original length is reported. Offline pasted-hex analysis accepts at most 4,096 bytes. Oversized input is not used to infer semantics.

## Authentication assessment

Hasbro's historical app terms and the older community notebook alone did not establish an algorithm. The broader October 23 search recovered the previously reported app archive and a newer community implementation. Direct managed-method inspection now establishes the source-derived subset in [the method register](../experiments/001-elmo-l2l/recovered-source.md): password-byte conversion, MD5, folded Fletcher-32 construction, byte serialization, status framing and selected query/playback writers.

The separate `desktop/sasori_elmo.py` client prompts privately for a known existing password and answers one received challenge. It accepts only explicit status 1 after its current response, rejects malformed/unknown status, and does not enroll passwords, reset, guess, log raw authentication material or retry automatically. Its source-derived synthetic vectors are not real radio captures. The laboratory Authentication Experiment remains synthetic. The separate [browser remote](elmo-remote.md) runs an original JavaScript port of this algorithm and the same fixed query/greeting subset. It also offers off-by-default password setup: only an exact `40 00` report in an eligible authentication phase permits a single `40` + digest write; acceptance still requires exact `40 01` after the current setup or challenge write. Unknown, rejected, repeated-unset and unsolicited acceptance responses cannot unlock controls or trigger an overwrite. Native Elmo writes remain unavailable.

### Earlier app-side research found during the October 21 review

The owner's October 18 teardown report, pages 17–20, supplied the earlier app-side leads. The October 21 review read that report but could not reproduce its binary analysis. That acquisition limit is now superseded by the October 23 direct inspection. The [historical lead register](../experiments/001-elmo-l2l/app-protocol-leads.md) and [current method evidence](../experiments/001-elmo-l2l/recovered-source.md) remain distinct from owner-device observations.

Before marking an adapter hardware-verified or expanding its commands, collect repeatable owner-device traces/results, confirm actual framing and rejection/recovery behavior, and record model/firmware and finite traffic budgets. Keep legitimate credentials in private local memory, outside public source and diagnostics. The source-derived desktop subset is ready for an explicit experimental owner-run trial.

## Command registry

| Category                                  | Current entries                                                 | Transmission                                                                    |
| ----------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Passive inspection                        | Service metadata and configured notifications                   | Explicit connection only; bounded                                               |
| Experimental browser/desktop Elmo clients | Known-password handshake, volume/input queries, greeting ID 9   | Explicit owner-run browser/CLI; hardware validation pending                     |
| Browser Elmo password setup               | New password after exact unset report; guided physical recovery | Explicit opt-in, one setup write, exact acceptance; real persistence unverified |
| Verified application commands             | None established                                                | Unavailable                                                                     |
| Native Elmo physical controls             | Native Elmo facade remains inspection-only                      | Unavailable                                                                     |
| Simulation                                | Synthetic lifecycle, outcomes, movement, phone-local audio      | No Bluetooth traffic                                                            |

## Independent source-verification track

The October 21 [source review](../experiments/001-elmo-l2l/source-verification.md) preserves its historical acquisition failure and lead classifications. The [October 23 recovered-source record](../experiments/001-elmo-l2l/recovered-source.md) supersedes those missing-artifact/construction statements for the new desktop subset. The remaining gate is real-unit validation, including supported challenge framing, acceptance, query replies, physical greeting behavior and recovery.

The [offline capture reviewer](../experiments/001-elmo-l2l/offline-review.md) still handles historical session envelopes only and returns an inconclusive protocol verdict. The old [live experiment draft](../experiments/001-elmo-l2l/live-experiment.md) preserves its earlier prerequisites; the new [desktop procedure](../desktop/README.md#experimental-elmo-known-password-check) separately supplies the current bounded trial. Neither source-derived calculations nor imported reports count as actual acceptance on this unit. Replacement-controller development remains independent.
