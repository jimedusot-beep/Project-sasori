# M1 — Original Elmo, five physical read-only inspections

**Status: NOT TESTED on the owner's actual toy and iPhone.** This checklist is the real-hardware gate for [issue #4](https://github.com/jimedusot-beep/Project-sasori/issues/4). Simulator, WebKit, desktop, historical packets and demo runs **do not** count. This is not an authentication or sound-control trial.

## 0. Safety and equipment

- Your own, intact original Love2Learn Elmo, its normal power source, and an unlocked iPhone with Bluetooth and [Bluefy](https://pnnsoft.com/portfolio/detail/bluefy-web-bluetooth-api-solution-for-ios-devices).
- Close other apps connected to the toy. Keep moving parts clear. Stop immediately for heat, unexpected movement or unusual sound.
- Open the **deployed HTTPS** [Sasori Research Lab](https://jimedusot-beep.github.io/Project-sasori/) inside Bluefy. Ordinary iPhone Safari may not expose the necessary Web Bluetooth interface.
- Run **Use simulation** first and confirm its outcome is labeled simulated. That is a UI rehearsal, **not** one of the five physical sessions.
- No credential entry, challenge response, password setup, motor control, firmware update, audio request or arbitrary characteristic write. Reading BLE service metadata is the first gate. Enabling notifications can write the Bluetooth-standard CCCD descriptor; it does **not** authenticate or authorize the toy.

## 1. Baseline identification — fill in privately before testing

| Field                                                         | Actual observation                                                                |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Date and time zone                                            | NOT RECORDED                                                                      |
| iPhone model and iOS version                                  | NOT RECORDED                                                                      |
| Bluefy version                                                | NOT RECORDED                                                                      |
| Elmo exact name, model/revision, source of identification     | UNKNOWN                                                                           |
| Elmo firmware (if safely readable)                            | UNKNOWN                                                                           |
| Sasori deployment revision / page refresh time                | UNKNOWN                                                                           |
| Radio conditions / nearby competing apps                      | NOT RECORDED                                                                      |
| Candidate service UUID and provenance                         | `dab91435-b5a1-e29c-b041-bcd562613bdf` — community-reported; **NOT YET VERIFIED** |
| Candidate notification UUID and provenance                    | `dab91382-b5a1-e29c-b041-bcd562613bdf` — community-reported; **NOT YET VERIFIED** |
| Actually observed service UUID and characteristics/properties | NOT OBSERVED                                                                      |
| Owner consent to inspect this toy                             | NOT RECORDED                                                                      |

Never publish the device's private Bluetooth identifier, raw addresses, passwords, credential traffic, or raw notification payloads. Use metadata-only exports by default.

## 2. Choose one repeatable inspection profile

1. Open **Love2Learn Elmo** quick setup and select **Find connection details**. Confirm ownership. Tap **Connect & inspect** _once_, choose only your own toy, and let its 15-second deadline end. The metadata-only inspection need not receive any notifications.
2. In the saved session's **Protocol explorer**, record the service and characteristic map and actual `notify`/`indicate` properties. **Do not assume the candidate UUIDs match the toy.**
3. If and only if the expected notification characteristic exists with the correct property, you may explicitly switch to **Capture from Data notifications** for the repeatable baseline. A silent notification stream is inconclusive, not an authentication failure.
4. For the five baseline runs, **hold the same selected profile, channel, toy power and physical conditions**. Start each connection with a new manual tap. Never queue automatic reconnections. Wait the full 15-second inspection limit each time.
5. Save each finished session, using the labels below. Record exact observed counts, stages, disconnect reasons and errors. Export the regular metadata-only JSON after each run.

If metadata discovery never succeeds, stop at that gate, record the errors and mark M1 **INCONCLUSIVE / BLOCKED**, rather than inventing five equivalent successful inspections or trying writes.

## 3. Five 15-second foreground inspections — actual observations only

| Session | 15 s foreground completed? | Stage reached | Service / notify properties observed | Notifications / bytes | Final disconnect reason | Status     |
| ------- | -------------------------- | ------------- | ------------------------------------ | --------------------- | ----------------------- | ---------- |
| E001-01 | NOT TESTED                 | UNKNOWN       | UNKNOWN                              | UNKNOWN               | UNKNOWN                 | NOT TESTED |
| E001-02 | NOT TESTED                 | UNKNOWN       | UNKNOWN                              | UNKNOWN               | UNKNOWN                 | NOT TESTED |
| E001-03 | NOT TESTED                 | UNKNOWN       | UNKNOWN                              | UNKNOWN               | UNKNOWN                 | NOT TESTED |
| E001-04 | NOT TESTED                 | UNKNOWN       | UNKNOWN                              | UNKNOWN               | UNKNOWN                 | NOT TESTED |
| E001-05 | NOT TESTED                 | UNKNOWN       | UNKNOWN                              | UNKNOWN               | UNKNOWN                 | NOT TESTED |

**For each row**, also retain: exact start/end time and time zone, confirmed inspection mode, selected service/notify UUID, observed properties, link or local name of the saved metadata-only export, any permission prompt, unexpected toy behavior and exact error stage. Mark a run **PASS** only if it actually reaches its chosen inspection stage, remains in the foreground for the intended 15 seconds, ends safely, and has an independently saved record with counts and reason. A zero-notification result may be a valid quiet inspection, but is not proof of toy interaction or authentication. Use **FAIL** or **INCONCLUSIVE** with a reason for every unsuccessful or interrupted attempt.

## 4. Separate Stop and background-interruption trials

These **do not replace** any of the five 15-second baseline runs.

| Trial               | What to do after explicitly connecting                                  | Actual disconnect reason | New/unexpected requests after Stop? | Saved evidence | Status     |
| ------------------- | ----------------------------------------------------------------------- | ------------------------ | ----------------------------------- | -------------- | ---------- |
| E001-06-manual-stop | Tap Sasori's visible **Stop** before the deadline                       | UNKNOWN                  | UNKNOWN                             | NOT SAVED      | NOT TESTED |
| E001-07-page-hidden | Move Bluefy to the background or switch apps while connected; reopen it | UNKNOWN                  | UNKNOWN                             | NOT SAVED      | NOT TESTED |

Record whether the link disconnected and whether any **new** Bluetooth discovery or connection occurred without a fresh tap. Do not assume a BLE disconnect immediately stops an already-running physical toy action; this trial sends no toy action. If the browser closes before data saves, document that explicitly rather than inventing a report.

## 5. Release decision

- **PASS** only when the model and actual UUID/properties are recorded; all five comparable, real 15-second foreground runs have their own evidence and safe ending; both separate interruption trials behave as intended; and **no unintended automatic reconnection or application-level hardware command** is observed.
- **FAIL** for a reproducible safety breach, unexpected writes/commands, unsafe physical behavior or uncontrolled reconnect; stop experiments and open a bug with private/redacted evidence.
- **INCONCLUSIVE / BLOCKED** for permission problems, unavailable toy, missing profile evidence, incomplete records, or a quiet stream that cannot support an attempted interpretation.
- **NOT TESTED** until owner-run device results are supplied. The automation must not promote this status to PASS.

Final result: **NOT TESTED**

Reviewed by: NOT RECORDED

Repository revision: NOT RECORDED

Evidence location (private): NOT RECORDED

**Next gate:** Issue #5 (authorized protocol and authentication specification) may be evaluated _only after_ issue #4 passes. M1 establishes repeatable, read-only inspection—not authentication, observed speech, movement or command execution.

Related references: [iPhone setup](iphone-setup.md), [testing and release gates](testing.md), [later greeting trial](iphone-elmo-acceptance.md).
