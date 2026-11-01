# Sasori: 10 upstream engineering references (November 1, 2026)

**Status:** Evidence-backed review, not ten installed dependencies or ten tested physical integrations. The first executable adoption is an independently written synthetic native-BLE failure/retry fixture and clearer Hub error vocabulary; keep `#43`, `#53`, and `#4` open until owner measurements support closure.

## Selection and decisions

| #   | Upstream project (verified GitHub repository)                                    | License      | Relevance to Sasori                                                                 | Current decision / validation gate                                                                                                                                              |
| --- | -------------------------------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | [Capacitor Community BLE](https://github.com/capacitor-community/bluetooth-le)   | MIT          | Native CoreBluetooth, device chooser, GATT connection and permission lifecycle      | **Evaluate, do not install yet.** Compare against Sasori's fixed-command Swift bridge; an adapter must retain native Elmo/Furby unsupported status and no generic write surface |
| 2   | [Nordic iOS BLE Library](https://github.com/nordicsemi/IOS-BLE-Library)          | BSD-3-Clause | Reliable Swift BLE operation queues, disconnect and event handling                  | Study timeout/cancellation architecture; adopt specific concepts only with native tests                                                                                         |
| 3   | [Nordic CoreBluetoothMock](https://github.com/nordicsemi/IOS-CoreBluetooth-Mock) | BSD-3-Clause | Mock peripherals, failure states, background disconnect and explicit scan lifecycle | **Adopt testing method now:** synthetic scenarios in `tests/native-ble-recovery.test.mjs`; not vendor-copy of any upstream code                                                 |
| 4   | [Ionic Capacitor](https://github.com/ionic-team/capacitor)                       | MIT          | Native JS bridge and lifecycle integration                                          | Already installed in native build; inspect lifecycle, do not replace current bridge                                                                                             |
| 5   | [Bleak](https://github.com/hbldh/bleak)                                          | MIT          | Independent laptop BLE validation and evidence collection                           | Future optional **owner-controlled** test harness; no import to iPhone or extra network service now                                                                             |
| 6   | [Bluefluff](https://github.com/Jeija/bluefluff)                                  | MIT          | Furby Connect protocol and command references                                       | Reconcile against the existing Furby adapter; no native writes without an explicit allowlist and real owner proof                                                               |
| 7   | [FurBLE](https://github.com/pdjstone/furby-web-bluetooth)                        | MIT          | Web Bluetooth toy-controller experience                                             | Historical browser reference, last pushed 2017; do not assume iPhone parity                                                                                                     |
| 8   | [WowWee MiP iOS SDK](https://github.com/WowWeeLabs/MiP-iOS-SDK)                  | Apache-2.0   | Manufacturer SDK examples for the original MiP                                      | Cross-check command bytes, characteristics, and real-unit behavior before expanding native actions                                                                              |
| 9   | [Playwright](https://github.com/microsoft/playwright)                            | Apache-2.0   | Chromium and WebKit UI regression testing                                           | **Already adopted:** extend synthetic permission, timeout, recovery, and small-screen checks; browser WebKit ≠ physical iPhone                                                  |
| 10  | [axe-core](https://github.com/dequelabs/axe-core)                                | MPL-2.0      | Accessible controls and actionable error states                                     | **Already adopted:** retain contrast/focus/labels in every new phone-facing workflow                                                                                            |

Licenses here reflect upstream GitHub's reported repository-level SPDX metadata on November 1, 2026; check the actual LICENSE and per-file notices before copying, modifying or distributing upstream code. This sprint does **not** copy upstream source, bundle a GPL library, install ten packages or make a new unrestricted Bluetooth writer.

## Strict priority order

### #43: iPhone reliability

- [x] PR #58: native Device Hub gives live buttons only to supported standard BLE / MiP and keeps Elmo/Furby as Demo-only
- [x] PR #58: native Hub loads the allowlisted existing Bluetooth bridge before its UI module
- [x] This change: fixture covers **denied, cancelled, timed out, unsupported, lost, and retry after failure** against Sasori's actual native JS facade
- [ ] Owner physical iPhone: test launch, Connect, Stop, re-open, background/foreground, and VoiceOver; record device/iOS, screen, permission and exact result

### #53: beginner feedback

- [x] Separate known browser/device limitations from timeouts and link loss instead of showing `Connection failed` for all
- [ ] On-device screenshots and VoiceOver validation for action descriptions, permission recovery and persistent Stop
- [ ] Never show `verified` for a command receipt without a real observed effect

### #4: initial physical Elmo inspection (read-only)

- [x] Owner worksheet: [iPhone inspection setup and repeatable captures](iphone-setup.md)
- [ ] In Bluefy on an owned Elmo, record exact model/iOS/Bluefy version and verify observed service and notification properties
- [ ] Complete **five** foreground, 15-second inspection sessions, with saved private records
- [ ] Separately test one explicit Stop and one background/foreground interruption; record disconnect reasons and notification counts
- [ ] No password authentication, firmware, motor or audio application writes in these first five trials
- [ ] Mark each attempt pass, fail, or inconclusive from physical owner evidence only

### #5 and later: authentication and greeting (not initial acceptance)

- [ ] After #4 passes, independently establish authorized characteristic roles, framing, and success/rejection evidence under #5
- [ ] Only after those gates, consider the separate [hosted Elmo greeting worksheet](iphone-elmo-acceptance.md); a queued sound request is **not** observed playback
- [ ] Keep credentials, raw authentication data and device identifiers private

## Why we are not cloning all ten

A complete BLE stack, a protocol research reference, an iPhone native framework and a browser test library serve different purposes. Replacing Sasori's existing allowlisted bridge with multiple overlapping implementations increases failure modes and the risk of accidental general-purpose toy writes. Treat upstream sources as design evidence, benchmark a narrow behavior, then integrate **one reviewed abstraction at a time** after tests and licensing review.

**Next engineering acceptance criterion:** on one actual iPhone, a beginner can identify unsupported controls before pressing Connect, connect to an owned device that the bridge actually supports, run one supported action, disconnect, and recover after interruption. Elmo's physical acceptance is a separate test and remains unverified.
