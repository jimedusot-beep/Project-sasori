# Project Sasori — Crimson puppet-lab theme

## Intent
An **original Sasori-inspired** visual language: charcoal-black lacquer, vivid crimson, bone-colored lettering, fine puppet threads and abstract ink clouds. No Naruto character art, franchise marks, official Akatsuki crest, copied illustration or third-party image is included. The existing faceted Sasori icon is recolored with an original thread detail.

## Architecture
- `site/tokens.css` is the **single source of truth** for colors, status tokens, type and shadows.
- `site/sasori-theme.css` is a purely presentational stylesheet imported after the existing page CSS and shared four-destination navigation on every page. It imports the shared tokens for legacy standalone tools.
- `site/puppet-clouds.svg` is a locally authored abstract decorative background; it is never interactive or part of a status message.
- No tool JavaScript, Bluetooth native bridge, storage serialization, permissions, adapters or routing is modified.

## Palette and accessible meaning
| Purpose | Token | Color |
|---|---|---|
| Background | `--bg` | `#0d0a0a` |
| Elevated surface | `--panel` | `#211616` |
| Borders | `--line` | `#503038` |
| Bone text | `--text` | `#f3ece8` |
| Muted text | `--muted` | `#cbb9b9` |
| Accessible links and focus text | `--accent` | `#ff9099` |
| Branding crimson / decorative use | `--accent-fill` | `#a3141f` |
| Action buttons | `--accent-action` | `#b62937` |
| Hover/selection | `--accent-strong` | `#d32b36` |
| Puppet wood/brass | `--wood`, `--mechanical` | `#8d6b4f`, `#a57c52` |
| Success | `--success` | `#70c38e` |
| Warning | `--warning` | `#e7b981` |
| Failure | `--error` | `#f38b89` |
| Information | `--info` | `#9ab9f0` |

**Contrast design:** the deep brand crimson is not used as small text against black. Links, current-page navigation and text accents use bright crimson-pink and bone; buttons use ivory text on a brighter crimson fill. Axe tests must pass.

**Semantics are preserved:** DEMO remains synthetic; “command sent” is not independent physical verification; Experimental retains its caution; real connected state and hardware safety checks remain controlled by the original code. Warning and success signals are not globally recolored red.

## Scope
- **Everyday:** Hub, Explore, Saved, unified navigation, buttons, cards, details panels, forms and decorative headers
- **Advanced:** Research Lab, Elmo Remote, Signal Atlas, Privacy Lab, Pocket IR, Key-Fob Audio Lab and local companion
- No separate mini-application, sign-in, auto-connection, or theme toggle is introduced.
- Motion only runs for hover-capable devices that do not request reduced motion. All geometry is constrained on 390px phones.

## Before/after evidence
**Before**: pre-theme GitHub Actions `browser-verification` artifacts from navigation PR #51, device-detail PR #55 and Saved PR #56. Filenames include `simple-mode-390.png`, `simple-mode-1440.png`, `unified-explore-phone.png` and `projects` screenshots.

**After**: `tests/browser/sasori-theme.spec.js` captures `crimson-{hub,explore,saved}-{phone,desktop}.png` in desktop Chromium and iPhone WebKit, producing 12 screenshots when both projects complete. Review these alongside the baseline artifacts before merging.

## Release checklist
- [ ] Format, lint, TypeScript, JS/Python tests and security audits green
- [ ] Browser tests in Chromium and mobile WebKit; no horizontal overflow
- [ ] Keyboard focus and axe checked on Hub, Explore and Saved
- [ ] No Bluetooth request during load on any existing page
- [ ] Native iOS simulator smoke tests green (same bridge/permissions)
- [ ] Human visual comparison of screenshots
- [ ] Merge PR only after required checks; confirm published Pages assets and links
- [ ] Later, verify perceived legibility and usability with actual users/devices; simulator results do not verify hardware effects
