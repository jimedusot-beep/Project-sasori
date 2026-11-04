# Issue #52 — device-detail accessibility acceptance worksheet

This worksheet is for the **remaining human checks** before closing [issue #52](https://github.com/jimedusot-beep/Project-sasori/issues/52). It complements the browser regression test `tests/browser/device-detail-mobile-keyboard.spec.js`; it is **not** evidence of a completed physical VoiceOver test.

## Record test environment

- Tester:
- Date/time:
- Entry: Hub / Elmo Remote / Pocket IR / Companion settings
- Host: hosted Safari / desktop browser / native iPhone shell / local companion
- Device and iOS/browser/app version:
- Layout width or Display Zoom/text size:
- Screen reader and keyboard configuration:
- Git commit/build tested:
- Evidence link (optional; no credentials or private BLE payloads):

Use **Pass**, **Fail**, **Not tested**, or **Not applicable** for each item. Describe observed behavior, not expected behavior.

## Repeat for each relevant entry and host

| Check | Result | Observation / evidence |
| --- | --- | --- |
| Initial page loads without a Bluetooth permission prompt | Not tested | |
| Selected device/family is labeled; unknown model or revision is not presented as physically verified | Not tested | |
| Compatibility and available live controls reflect this host, including a disabled unsupported path | Not tested | |
| At 360px, no horizontal overflow or obscured Connect/Demo/Stop | Not tested | |
| At 390px, no horizontal overflow or obscured Connect/Demo/Stop | Not tested | |
| With keyboard or external switch, focus order is understandable and focus remains visible | Not tested | |
| VoiceOver announces Connect, Demo, result/status and Stop with meaningful names | Not tested | |
| VoiceOver can reach and activate Stop during a demo and when connecting (where available) | Not tested | |
| Demo remains labeled simulated and never triggers a Bluetooth permission request | Not tested | |
| Stop cancels current session; re-entry is predictable and does not silently reconnect | Not tested | |
| Last action/result does not imply physical movement, sound, IR emission or verification | Not tested | |
| Large Text / Display Zoom does not cover actions or obscure recovery guidance | Not tested | |

### Entry-specific checks

- **Hub:** Switch to a family unsupported by the current native adapter. Live Connect must remain unavailable while Demo is usable. Confirm that switching families does not turn an earlier saved setup into a live connection.
- **Elmo Remote:** Verify the sticky Stop remains reachable while the page is scrolled and that Demo's greeting never claims physical playback. Do not use real hardware commands for this worksheet.
- **Pocket IR:** Require the ownership/permission checkbox for live connections. Stop must remain reachable after Demo/Prepare. A simulator receipt is not physical IR emission.
- **Companion settings:** This page is **not** a device controller. Hosted settings must remain disabled; credentials can only be configured on the authorized local companion. Never photograph or publish tokens or pairing codes.

## Decision

- **Automated software test**: Record exact PR, commit and browser/CI job after it finishes; do not prefill this as passed.
- **Human phone accessibility checks**: Mark separately by device, host, and build. A simulator or automated axe result does **not** equal a physical VoiceOver pass.
- **Issue #52 closure**: Close only when required host-specific negative cases, 360/390px focus/navigation, a real screen-reader session and the four-entry matrix have recorded results. Link failures to a narrow follow-up issue only when the failure is reproduced.
- **Out of scope**: Real Elmo service UUIDs and five read-only sessions remain under [#4](https://github.com/jimedusot-beep/Project-sasori/issues/4); physical IR bridge identity and emission remain under [#35](https://github.com/jimedusot-beep/Project-sasori/issues/35). Do not publish BLE identifiers, packets, device secrets, or credentials.
