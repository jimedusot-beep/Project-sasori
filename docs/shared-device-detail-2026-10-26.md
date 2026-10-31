# Shared device-detail presentation — implementation slice

This PR is stacked on [navigation PR #51](https://github.com/jimedusot-beep/Project-sasori/pull/51). Do not merge it before #51 passes native iOS verification and is integrated.

## Implemented

- Added a shared pure `deviceDetailModel()` for connection progress, compatibility on this host, last action, software outcome, physical-verification boundary and an explicit next step.
- Added `mountDeviceDetail()` rendering into the **existing** Device Hub and Elmo Remote control panels. No new application/router or separate persisted state.
- Added a sticky `Stop & disconnect` on the original Elmo Remote which delegates directly to its existing `runner.stop()` cancellation path, rather than creating another transport controller.
- Mark demo outcomes as software only; live command receipts are **not** physical verification.
- Keep existing HubSession, ElmoRemote, Bluetooth chooser, password lifecycle, permissions, finite budgets, storage and existing deep links untouched.

## Proof and next steps

- Unit tests cover demo-only receipts, live-command uncertainty, unsupported native capabilities, failed connections and unknown actions.
- Browser tests cover Hub and Elmo demo, sticky Stop, no Bluetooth permission on load and axe accessibility; screenshots captured as CI artifacts.
- Full `npm run check`, Playwright Chromium / iPhone WebKit and native iOS jobs must pass before review.
- **Not yet included**: fully merging legacy Elmo UI into the Hub, universal device-detail coverage for Pocket IR and companion, real device action tests, native Elmo control parity, or human usability verification. These remain issue #52/#43 follow-ups.

See also `docs/unified-interface-audit-2026-10-26.md` and the source/reuse matrix. All code is original; no external GPL/EUPL components were copied.
