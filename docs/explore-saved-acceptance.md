# Explore and Saved — acceptance review

Scope: the existing `explore.html` and `projects.html` pages, with no new Bluetooth access, storage format or sync implementation.

## Workflow comparison and visual evidence

The historical before/after screenshots in [Simple Mode release review](simple-mode-release-2026-10-25.md#before-and-after) compare the previous research-first homepage with the newer device-first homepage. **They are not a same-page screenshot comparison for Explore or Saved.** Do not present them as one.

For the current Explore/Saved screens, GitHub Actions stores actual browser screenshots from:
- `tests/browser/unified-navigation.spec.js`: `unified-explore-phone.png` and `explore.html-360-after.png`, `explore.html-390-after.png`.
- `tests/browser/projects.spec.js`: `my-projects.png`.
- `tests/browser/unified-navigation.spec.js`: `projects.html-360-after.png`, `projects.html-390-after.png`.

These current-release screenshots are CI artifacts with finite retention, not permanent embedded assets. A same-page historical before screenshot has **not** been recovered; avoid claiming otherwise.

## Acceptance evidence

| Requirement | Implementation and test | Evidence scope |
| --- | --- | --- |
| Existing tools grouped with explicit experiment warnings | `site/explore.html`, `tests/browser/unified-navigation.spec.js` | Source and automated browser |
| Consistent saved workspace summaries with deep links to original backups | `site/lib/projects.js`, `site/projects.html`, `tests/browser/projects.spec.js` | Existing local formats, no migration |
| Empty and populated stores, search, persistent reload | `tests/browser/projects.spec.js`, `tests/projects.test.mjs` | Fake and browser fixture data |
| Invalid import cannot erase a valid setup | `tests/browser/projects.spec.js`, plus storage import tests | Browser-fixture validation |
| Corrupt local section does not hide healthy other records | `tests/browser/projects.spec.js` | Browser-fixture validation |
| 360/390-pixel width, keyboard focus and axe accessibility | `tests/browser/unified-navigation.spec.js` | Chromium and emulated iPhone WebKit; not a physical phone |
| Preserved legacy deep links | `tests/browser/unified-navigation.spec.js` | Browser-fixture navigation |
| Origin and sync limits | `site/projects.html`, `site/projects-ui.js` | Pages, native app, Safari/Bluefy can have separate stores |

## Owner-facing constraints

The Saved page reads existing local workspaces; it never merges incompatible backup types, moves files between origins, imports on its own, or silently repairs corrupt records. Browser-only settings and private credentials are not transferred by exporting an unrelated backup.

A completed browser test is not proof that a user can restore data across different physical phones. Verify real cross-origin imports by manually exporting a specific backup, opening the **same** workspace in the destination origin and importing the matching format. Track any failures as actual recorded bugs rather than as automatic synchronization.
