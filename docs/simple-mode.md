# Sasori Simple Mode — October 25, 2026

## What's different

For the published GitHub Pages site, the bare project URL opens **Device Hub** (the beginner view). Visiting `/index.html` explicitly, or using an existing laboratory section bookmark such as `/index.html#protocol`, still opens the complete engineering interface. The native iPhone build and localhost are not redirected. No device connection or command occurs from routing.

The everyday entry sequence is now:

1. Choose a device family. It changes only the current setup; it does not search for or connect to nearby equipment.
2. Enter an existing Elmo password **only for Elmo live use**. It is never stored. Other device families do not show this credential field.
3. Choose **Connect device** (requires the right browser and, for a TV, a local companion) or **Try offline demo**. Demo is immediately available without Bluetooth.
4. On connection or demo readiness, the page scrolls to relevant controls. The **Stop & disconnect** bar remains at the top while a session is active or connecting, even if you scroll.
5. Use available actions, confirm the actual outcome on owned hardware, then stop. A software acknowledgment is not physical-effect verification.

Phone layouts keep all three first-use actions in the initial viewport at the tested 360 × 740 and 390 × 844 sizes. Empty saved-setup selectors are hidden; returning users see them near the top. After connection, keyboard focus moves to the controls heading without a second scroll.

The top navigation has four everyday destinations: **Devices**, **Automations**, **Discovery**, **Projects**. Discovery links to the Signal Atlas, Projects to the consolidated local-work overview; the complete engineering laboratory stays one explicit link away. Direct Elmo and Pocket Remote pages are preserved for expert users.

### More connection options

Bluetooth name prefixes, Show all Bluetooth devices, Elmo session length, and explicit password creation (only when the toy reports none) live behind **More connection options**. Existing saved setups, device labels, TV companion fields, backups, adapter selection and original routines still work. Opening the disclosure does not connect or alter a device. TV companion configuration still requires its own described hardware and setup.

If browser Bluetooth is unavailable, **Connect device** is disabled with an explanation; Bluefy on iPhone or a compatible Web Bluetooth browser is needed. An offline demo remains usable. On supported devices, Connect still requires a direct user press and a browser chooser. No credentials are put into local setup backups.

## Regression and hardware boundaries

- The product uses existing HubSession, routine budgets, whitelist adapters, cancellation and results. Simple Mode moves and groups controls but adds no new device command, RF replay or hardware capability.
- Stored setups remain browser-and-origin local; hosted Pages and a local TV companion keep separate stores. This release does **not** implement authenticated sync.
- A successful simulated session verifies navigation/controls in software only. Actual Elmo, Furby, MiP, TV and ESP32 behaviors still require user-owned hardware observation.
- Existing `/#overview` and `index.html#protocol` browser navigation remains available for legacy links, and direct `index.html` never redirects.
- Stop prevents additional queued operations and closes live sessions. It cannot undo a signal already sent.
- The expanded setup is still available if a device requires special configuration; Simple Mode must not silently guess a PIN, device target, or electrical behavior.

## P2 usability validation — five tasks

Test with a first-time participant on a real iPhone and on desktop. Start with an empty browser profile and record each task independently; do not disclose the solution before they try. Use **a demo** when hardware is unavailable and mark it simulated. Tests with actual electronics require exact model and owner authorization.

| Task                    | Starting state                                      | Success criterion                                                                                  | Evidence to record                                             |
| ----------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 1. Try an Elmo demo     | Open the public Sasori homepage                     | Choose Elmo, start demo and understand no real device was contacted                                | Tap count, time, hint consulted, wrong turns                   |
| 2. Connect owned device | No live session, correct browser/hardware available | Manually connect only the selected device with correct local credentials                           | Chooser behavior, failures, retry, confirmation                |
| 3. Perform one action   | Active demo or live session                         | Select one enabled control and distinguish request from physical outcome                           | Tap count, action result, physical confirmation separately     |
| 4. Save a result        | Ended session                                       | Export a connection receipt without secrets                                                        | File downloaded, whether user understood its purpose           |
| 5. Restore local setup  | Prior exported hub backup                           | Import backup on a new blank origin/browser and see the saved profile without automatic connection | Import success, any missing credentials, recovery instructions |

For each task record: success (yes/assisted/no), duration in seconds, taps/clicks, scroll distance, wrong turns, spoken confusion, device/browser and exact code version. **No fabricated measurements.** Note accessibility settings: VoiceOver, large text, reduced motion and portrait landscape. Do not mix software test completions with physical device validation.

### Promotion threshold (proposed)

Run at least five participants on each platform, identify every task with fewer than four independent completions, and address recurring navigation blockers before promoting the UI as beginner-validated. Repeat the five tasks after modifications and preserve anonymous aggregate findings. This is a proposed acceptance target, not existing user testing.

## Release review scope

PR #40 is the focused hosted-web Simple Mode release. Native iOS keeps its working
bundled Research Lab entry and fixed Core Bluetooth capabilities. The browser Device
Hub currently uses Web Bluetooth and its Elmo/Furby controls are not supported by the
native allowlist. Routing the native app to that Hub without a capability-aware native
adapter would remove working native inspection. That migration is a separate follow-up;
the simulator smoke test must continue to verify the existing native workspace.

The five-task human protocol above remains unexecuted unless actual participant and
physical-device evidence is supplied. Screenshots and Playwright checks measure software
layout and behavior only. Experimental Pocket IR remains owner-built, unverified hardware.
