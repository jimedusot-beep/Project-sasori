# Issue #52: device-detail accessibility acceptance

This worksheet records the human checks still needed before issue #52 can close.
The browser regression test is in `tests/browser/device-detail-mobile-keyboard.spec.js`.
Neither fixture tests nor automated axe scans establish a real iPhone VoiceOver pass.

## Test environment

- Tester:
- Date/time:
- Entry: Hub / Elmo Remote / Pocket IR / Companion settings
- Host: hosted Safari / desktop browser / native iPhone shell / local companion
- Device and iOS/browser/app version:
- Layout width, Display Zoom and text size:
- Screen reader and keyboard configuration:
- Git commit/build tested:
- Evidence link (do not publish credentials or private Bluetooth payloads):

## Repeat for each entry and relevant host

Record **Pass**, **Fail**, **Not tested** or **Not applicable** for each check.
Include what you actually observed and any reproduction steps.

- [ ] Loading the page never requests Bluetooth permission.
- [ ] The selected family is labeled; unknown models remain unverified.
- [ ] Live controls reflect this host's supported capabilities.
- [ ] An unsupported native live control is disabled, while Demo remains usable.
- [ ] At 360px, Connect, Demo and Stop are visible with no horizontal overflow.
- [ ] At 390px, Connect, Demo and Stop are visible with no horizontal overflow.
- [ ] Keyboard or external-switch focus has a logical order and visible indicator.
- [ ] VoiceOver announces Connect, Demo, progress/status, result and Stop clearly.
- [ ] VoiceOver reaches and activates Stop in Demo and during connection.
- [ ] Demo remains simulated and does not request a Bluetooth device.
- [ ] Stop cancels the session without unexplained reconnects.
- [ ] Action receipts never claim physical playback, movement or IR emission.
- [ ] Large Text and Display Zoom preserve actions and recovery guidance.

## Entry-specific checks

### Hub

Switch to a family unavailable through the current native adapter.
Live Connect must remain unavailable; Demo must still work.
Switching families must not turn a saved setup into a live connection.

### Elmo Remote

Check sticky Stop while scrolled and while Demo is active.
Demo greetings must not claim physical playback.
Do not send actual toy commands for this worksheet.

### Pocket IR

Check the owner-permission gate before live connection.
After Demo and Prepare, Stop must remain reachable.
A software receipt is not proof of physical IR emission.

### Companion settings

This page configures credentials; it is not a hardware controller.
Hosted credential fields must stay disabled.
Only the authorized local companion can accept credentials.
Do not include tokens or pairing codes in screenshots or reports.

## Closure decision

- Automated checks: link the exact commit and completed CI result.
- Human checks: record the phone, host, build and screen-reader results separately.
- Leave #52 open until narrow-screen focus, host-specific negative cases and
  the four-entry acceptance matrix are documented.
- Keep real Elmo inspections in #4 and actual IR bridge verification in #35.
- Do not publish BLE identifiers, raw packets, passwords or credentials.

## Physical iPhone keyboard and Stop

Record the commit, iPhone model, iOS version, browser and orientation. Disconnect any external keyboard. Start the offline demo and focus an editable field on the same screen as Stop. Record the field label and confirm the software keyboard is visible. With the keyboard still open, locate Stop, tap it once and record the resulting demo status. Repeat with VoiceOver and in landscape. Record any scrolling, keyboard dismissal, obscured control or unexpected activation. If the surface has no editable field in this state, record that observation and the route. Leave the result blank until tested on the phone.
