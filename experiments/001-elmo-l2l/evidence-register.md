# Experiment 001 — Evidence Register

Historical register reviewed 2026-10-20; original-BLE source addendum reviewed 2026-10-21.

Current update: a [published candidate GATT table](https://github.com/NonaSuomy/Love2LearnElmo/blob/82fa312e06af1d8e549cec588856ebce227b5f77/README.md) is now available. Its status is COMMUNITY-REPORTED, not independently hardware-verified. Original V4 source remains unrecovered. Historical rows below retain their provenance; see docs/protocol.md for the current implementation boundary.

| Claim                                                                           | Status                                    | Evidence                                                     | Required next test                                            |
| ------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------- |
| Hasbro B6572 model exists; owner's exact unit identity still needs confirmation | PRIMARY MODEL REFERENCE / UNIT UNVERIFIED | https://fccid.io/RS4-B6572                                   | Owner-observed product marking and revision                   |
| Uses BLE with official companion app                                            | PRIMARY                                   | https://hasbro-new.custhelp.com/app/answers/detail/a_id/348/ | Already observed in Bluefy                                    |
| Hasbro app used user-selected password for syncing                              | PRIMARY                                   | https://docs.hasbro.com/en-us/legal/app-terms?ID=108         | Verify actual authentication without sharing password         |
| Elmo L2L discovered in Bluefy                                                   | USER-OBSERVED                             | 2026-10-20 V4 diagnostic log                                 | Reproduce on Sasori                                           |
| Custom GATT service discovered                                                  | USER-OBSERVED                             | V4 diagnostic log                                            | Obtain exact service UUID                                     |
| Write without response and notify discovered                                    | USER-OBSERVED                             | V4 diagnostic log                                            | Obtain UUIDs and verify characteristic properties             |
| Subscription produced RX data                                                   | USER-OBSERVED                             | V4 log, payloads recorded in protocol-notifications.md       | Repeat 5 read-only sessions                                   |
| NewModeIdx:12 means operating mode 12                                           | UNKNOWN                                   | Text exists but semantics unknown                            | Correlate with authorized documented app behavior             |
| Start:LowPowerSleep equals Hasbro's Lullaby mode                                | UNKNOWN                                   | No link established to app's 10-hour Lullaby behavior        | Do not assume these are the same                              |
| V4 authenticated successfully                                                   | NOT DEMONSTRATED                          | Screenshots show MODE inspect                                | Bounded authorized auth test after source verification        |
| Motor movement can be commanded by BLE                                          | NOT DEMONSTRATED                          | No validated command or safe envelope                        | Do not attempt until protocol and mechanical evidence         |
| Elmo PCB uses a particular Nordic chipset                                       | UNVERIFIED                                | FCC closeups exist but marking not authoritatively matched   | Obtain crisp macro of radio IC and datasheet                  |
| Original official app is still distributed                                      | FALSE                                     | https://apps.hasbro.com/en-US/love2learn-elmo                | Preserve only legitimately held app evidence; beware archives |

No secret challenge/response or password data should be committed to this public repository.

## October 21 original-BLE source review

The [new source-verification register](source-verification.md) records PR #11's exact revision, a fresh reading of the earlier app-analysis report, direct community-notebook and V5 source inspection, licensing limits and the APK acquisition failure. The report's application definitions remain prior-report claims; the notebook and V5 do not supply the missing authentication methods. The [historical RX corpus](fixtures/historical-v4.json) preserves the three public observations with provenance and integrity hashes, not a new hardware capture.

The [live draft](live-experiment.md) remains gated on source reproduction, exact vectors, current-unit characteristics and known private credential availability. No live traffic, guessed command, reset or credential collection occurred in this review.
