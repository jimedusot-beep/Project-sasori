# Verification record

Software release candidate: v0.2.0. Reviewed October 21, 2026 (America/New_York).

## Confirmed software results

- Initial four starter checks passed before changes.
- First modular implementation: 63 Node unit/integration tests passed locally.
- ESLint, formatting, typed-core TypeScript checks, recognized credential-pattern scan passed.
- npm audit reported zero known vulnerabilities in the locked development dependency tree.
- GitHub Actions run [39528645659](https://github.com/jimedusot-beep/Project-sasori/actions/runs/39528645659) passed, including all 10 initial desktop Chromium/iPhone-sized WebKit checks and axe checks across the five main screens.
- Interactive browser QA reproduced synthetic capture, automatic IndexedDB save, persisted notes, routing, and local record editing.

The combined suite passes all 74 Node tests, including the preserved historical-byte regressions, explicit show-all fallback, and concurrent-tab storage-capacity checks. GitHub Actions run [39583697956](https://github.com/jimedusot-beep/Project-sasori/actions/runs/39583697956), commit 9c8c1baa5a650b0e1118baffa167933af7bc19bf, also passed all 12 desktop Chromium/iPhone-sized WebKit workflow tests. Axe checks cover all five primary screens; browser layout checks found no horizontal overflow.

That run reports zero npm vulnerabilities, successful lint/format/type checks, 74 passing Node tests, and 12 passing browser tests. Browser screenshots and reports are retained as Actions artifacts. Later metadata/documentation-only changes do not claim additional hardware results.

## Hardware boundary

No new physical Elmo observations have been made by this implementation. V4 observations remain historical user-reported evidence; the published GATT table remains community-reported. Synthetic auth outcomes and virtual control/audio previews do not establish Elmo functionality.

## Deployment

GitHub repository metadata reports has_pages: false. The latest completed deployment at audit time, [39534715267](https://github.com/jimedusot-beep/Project-sasori/actions/runs/39534715267), passed its verification job, then failed to create the initial Pages site with **Resource not accessible by integration**. The Actions token has Pages write permission but cannot perform that initial owner setup.

Owner action: repository Settings → Pages → Build and deployment → Source: GitHub Actions. Then rerun the failed Deploy Pages job. No live website is claimed until the workflow's HTTPS HTML/module/CSS/icon verification succeeds.

Code releases and milestones publish after successful software verification independently of Pages configuration. The experimental release is not a claim that the website or hardware controls are live.
