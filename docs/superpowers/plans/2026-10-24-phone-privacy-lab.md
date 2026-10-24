# Phone Privacy Lab Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Execution is authorized in this session.

**Goal:** Add phone-only optical measurements, a native BLE advertisement survey and a private notebook to Sasori.

**Architecture:** Isolated modules for optical analysis, camera lifecycle, notebook storage and native survey lifecycle. A standalone page combines them without altering toy adapters.

**Tech Stack:** Existing JavaScript/IndexedDB, Node tests, Playwright and Swift/Core Bluetooth; no new runtime dependencies.

**Spec:** ../specs/2026-10-24-phone-privacy-lab.md

## Global Constraints

- Phone only; no microphone, external hardware or cloud endpoint.
- Camera 120 seconds; frames maximum 320×240; grid 16×12.
- BLE 30 seconds, 60 devices, 2,000 observations; no peripheral connections.
- Notebook 30 observations / 5 MB; explicit photo retention; metadata export by default.
- Synthetic results stay synthetic; measurements do not certify hidden-device detection.

## Review Focus

- Late camera/native permission results after Stop must not revive collection.
- Browser camera ending or backgrounding must remove active tracks and torch.
- Concurrent notebook writes and capacity failures must preserve earlier records.
- Malformed native data and hostile notes must not leak identifiers or inject markup.
- Native packaging must load the plugin on the new page without changing existing inspection.

### Task 1: Measurement and camera lifecycle

- [ ] Add failing tests in `tests/privacy.test.mjs` for pure frame comparison and `PrivacyCamera.start()/stop()` lifecycle.
- [ ] Implement `site/lib/privacy-optics.js` and `site/lib/privacy-camera.js` against the tests, then run `node --test tests/privacy.test.mjs`.

### Task 2: Notebook and native survey

- [ ] Add failing tests for `PrivacyNotebook` persistence, limits, exports and native `PrivacySurvey` cancellation/generation handling.
- [ ] Implement `site/lib/privacy-notebook.js`, `site/lib/privacy-survey.js` and `native/ios/Sources/SasoriSurveyPlugin.swift`; register and package the bridge.
- [ ] Run the complete Node suite; native build is verified by GitHub Actions.

### Task 3: Integrated UI and release checks

- [ ] Add browser tests for `privacy.html`: deliberate camera start/Stop, synthetic demo, comparisons, notebook, exports and accessibility.
- [ ] Implement `site/privacy.html`, `site/privacy.css`, `site/privacy-ui.js`; link from hub/index, include deployed asset verification and native packaging.
- [ ] Document capability boundaries and actual owner acceptance trials in `docs/privacy-lab.md`, README and changelog.
- [ ] Run `npm run check`, desktop Python tests, audit and hosted browser/native checks. Obtain a fresh whole-branch review, address substantive findings, commit and open a focused PR.
