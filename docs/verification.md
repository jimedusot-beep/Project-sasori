# Verification record

Published experimental release: [v0.2.0](https://github.com/jimedusot-beep/Project-sasori/releases/tag/v0.2.0). Status rechecked October 21, 2026 (UTC).

Release commit: 636c60ed64362b9c370c729640e20b7d0865ec0c. The release was published at 10:29:44 UTC. The website was subsequently deployed from main commit 12d3964bcd4de71befa516d678582284bf3cc0f5.

## Confirmed software results

- Initial four starter checks passed before changes.
- First modular implementation: 63 Node unit/integration tests passed locally.
- ESLint, formatting, typed-core TypeScript checks, recognized credential-pattern scan passed.
- npm audit reported zero known vulnerabilities in the locked development dependency tree.
- GitHub Actions run [39528645659](https://github.com/jimedusot-beep/Project-sasori/actions/runs/39528645659) passed, including all 10 initial desktop Chromium/iPhone-sized WebKit checks and axe checks across the five main screens.
- Interactive browser QA reproduced synthetic capture, automatic IndexedDB save, persisted notes, routing, and local record editing.

The combined suite passes all 74 Node tests, including the preserved historical-byte regressions, explicit show-all fallback, and concurrent-tab storage-capacity checks. GitHub Actions run [39583697956](https://github.com/jimedusot-beep/Project-sasori/actions/runs/39583697956), commit 9c8c1baa5a650b0e1118baffa167933af7bc19bf, also passed all 12 desktop Chromium/iPhone-sized WebKit workflow tests. Axe checks cover all five primary screens; browser layout checks found no horizontal overflow.

That run reports zero npm vulnerabilities, successful lint/format/type checks, 74 passing Node tests, and 12 passing browser tests. Browser screenshots and reports are retained as Actions artifacts. Later metadata/documentation-only changes do not claim additional hardware results.

The merged release's [Deploy Pages run 39584798655](https://github.com/jimedusot-beep/Project-sasori/actions/runs/39584798655) also passed its `verify / checks` job and `release-metadata` job. Its separate `deploy` job failed during initial Pages setup. A failed deployment therefore does not indicate a failing software test suite.

## Maintenance regressions

The subsequent storage/export review reproduced two defects: unexpected nested imported fields could survive metadata-only backup export, and a queued save could complete after deletion and restore the record in the same tab. Exports now retain recognized metadata only and omit generic diagnostic details. Deletion shares the save queue. User-authored notes and log messages remain included and should still be reviewed before sharing.

The local maintenance suite passes 77 Node tests, including the two defect reproductions and a large-capture regression confirming that payload omission happens before the persisted-record size limit. Browser coverage also exercises JSON import followed by downloaded metadata backup inspection on Chromium and iPhone-sized WebKit.

## Hardware boundary

No new physical Elmo observations have been made by this implementation. V4 observations remain historical user-reported evidence; the published GATT table remains community-reported. Synthetic auth outcomes and virtual control/audio previews do not establish Elmo functionality.

## Deployment

Live URL: https://jimedusot-beep.github.io/Project-sasori/

After the owner enabled Pages, repository metadata reported has_pages: true. [Deploy Pages run 39587740888, attempt 2](https://github.com/jimedusot-beep/Project-sasori/actions/runs/39587740888/attempts/2) passed all three jobs: software verification, deployment, and release metadata. At 10:54:55 UTC, the deployment verifier confirmed the HTTPS page and all 15 module/CSS/icon assets. Earlier initial-setup failures remain historical evidence rather than the current status.

The deployed overview rendered successfully in the browser, including the connection manager, profile selection, IndexedDB status, unsupported-Bluetooth guidance, and locked hardware controls. [Live overview screenshot](images/sasori-live-20261021.jpg). This cloud-browser check does not validate Bluefy or real Elmo hardware.

A production-origin synthetic inspection completed with 3 notifications / 54 bytes, labeled SIMULATED, and saved a metadata-only record. After reloading the page, Research records still showed that simulated session with 3 notifications and the simulation-complete reason. No Bluetooth connection or physical command was attempted.

Code releases and milestones publish after successful software verification independently of Pages configuration. The experimental release is not a claim that the website or hardware controls are live.
