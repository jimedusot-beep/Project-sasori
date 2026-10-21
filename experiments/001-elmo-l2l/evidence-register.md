# Experiment 001 — Evidence Register

Last reviewed 2026-10-20.

Current update: a [published candidate GATT table](https://github.com/NonaSuomy/Love2LearnElmo/blob/82fa312e06af1d8e549cec588856ebce227b5f77/README.md) is now available. Its status is COMMUNITY-REPORTED, not independently hardware-verified. Original V4 source remains unrecovered. Historical rows below retain their provenance; see docs/protocol.md for the current implementation boundary.

| Claim                                              | Status           | Evidence                                                     | Required next test                                            |
| -------------------------------------------------- | ---------------- | ------------------------------------------------------------ | ------------------------------------------------------------- |
| Hasbro B6572 is the exact toy model                | PRIMARY          | https://fccid.io/RS4-B6572                                   | Photograph own unit product marking                           |
| Uses BLE with official companion app               | PRIMARY          | https://hasbro-new.custhelp.com/app/answers/detail/a_id/348/ | Already observed in Bluefy                                    |
| Hasbro app used user-selected password for syncing | PRIMARY          | https://docs.hasbro.com/en-us/legal/app-terms?ID=108         | Verify actual authentication without sharing password         |
| Elmo L2L discovered in Bluefy                      | USER-OBSERVED    | 2026-10-20 V4 diagnostic log                                 | Reproduce on Sasori                                           |
| Custom GATT service discovered                     | USER-OBSERVED    | V4 diagnostic log                                            | Obtain exact service UUID                                     |
| Write without response and notify discovered       | USER-OBSERVED    | V4 diagnostic log                                            | Obtain UUIDs and verify characteristic properties             |
| Subscription produced RX data                      | USER-OBSERVED    | V4 log, payloads recorded in protocol-notifications.md       | Repeat 5 read-only sessions                                   |
| NewModeIdx:12 means operating mode 12              | UNKNOWN          | Text exists but semantics unknown                            | Correlate with authorized documented app behavior             |
| Start:LowPowerSleep equals Hasbro's Lullaby mode   | UNKNOWN          | No link established to app's 10-hour Lullaby behavior        | Do not assume these are the same                              |
| V4 authenticated successfully                      | NOT DEMONSTRATED | Screenshots show MODE inspect                                | Bounded authorized auth test after source verification        |
| Motor movement can be commanded by BLE             | NOT DEMONSTRATED | No validated command or safe envelope                        | Do not attempt until protocol and mechanical evidence         |
| Elmo PCB uses a particular Nordic chipset          | UNVERIFIED       | FCC closeups exist but marking not authoritatively matched   | Obtain crisp macro of radio IC and datasheet                  |
| Original official app is still distributed         | FALSE            | https://apps.hasbro.com/en-US/love2learn-elmo                | Preserve only legitimately held app evidence; beware archives |

No secret challenge/response or password data should be committed to this public repository.
