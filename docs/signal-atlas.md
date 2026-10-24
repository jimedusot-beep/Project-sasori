# Signal Atlas — read-only multi-capture analysis

**Sasori release candidate, October 24, 2026.** Open `signal-atlas.html` at the hosted Sasori origin. This is an original, offline, mobile-friendly workbench that uses the **existing Discovery IndexedDB v4 store**. It does not attempt to connect to Bluetooth, a server, a microphone, an IR emitter or other radios. The protocol recorder and existing nine Discovery research methods remain unchanged.

## Useful actions

1. **Try synthetic comparison:** The button creates three explicitly synthetic recordings in memory, with stable, variable and partially covered byte positions. It does not write to IndexedDB or test electronics.
2. **Reload saved captures:** The Atlas lists existing Discovery records, groups them by normalized exact model/revision + method + representation and preserves all evidence labels. It does not modify existing records or upgrade reported evidence.
3. **Add a capture:** Paste valid hex bytes or positive integer IR timing values and record the exact model, labeled evidence class, method and private source notes. Use Save to add a new record to the **same** Discovery notebook. Raw-value retention is opt-in and off by default; metadata-only captures cannot be compared again after reload.
4. **Compare a group:** Two or more retained captures enable a 64-index status map. A byte index is stable only if every retained capture has it and all values are equal. An IR timing index is stable if its complete-coverage range is within the selected integer tolerance (0–1,000,000 microseconds). Missing indexes display partial coverage. A variable index means the values differ, not that a device command or protocol field has been identified.
5. **Compare A and B:** Shows aligned index counts and positional changes using the existing Discovery comparator. No field semantics are guessed; no raw payload bytes are included in the comparison report.
6. **Import a Discovery backup:** Chooses a local `sasori.discoveries` v1 JSON metadata backup, validates the full batch before writing, creates fresh IDs and retains `importedAt` provenance. Backup files never reconstruct missing raw signals. 1 MB maximum; combined notebook cap of 50 captures and 2 MB still applies.
7. **Export a sanitized aggregate:** Produces `sasori.signal-atlas-summary` v1, without raw bytes, timings, model names, capture labels/IDs, source notes, or endpoints. The summary is aggregate-only and is **not** accepted as an executable protocol profile or verified physical result.

## Engineering boundaries

- Uses `site/lib/signal-atlas.js` for grouping, index-wise consensus, and an allowlisted aggregate export. Reuses `site/lib/discovery.js` parsing/validation and `site/lib/storage.js` for persistence. No duplicated SQLite schema, cloud service, or raw packet sending.
- Exact device identity is normalized only for outer whitespace/casing and repeated whitespace. Another model, method or capture kind never enters the same group. Audio summaries are counted but not byte/pulse compared; use the existing WAV inspector for sound.
- Imported claims, owner-labeled reports, community research and synthetic fixtures remain distinct and explicitly non-verifying. A matched byte is not proof of successful authentication, meaningful commands, a safe electrical interface, or hardware compatibility.
- Alignment is position-based, not a cryptographic classification algorithm, real-time decoder, or machine-learning model. Shifted sequences can create many different positions. Pulse timings do not capture carrier frequency unless documented separately.
- Data is tied to the current origin/browser. If browser storage is unavailable, the underlying ResearchStore warns that captures are temporary. Data from another origin is imported explicitly rather than silently synchronized.
- The page's CSP disallows network connections (`connect-src 'none'`) and uses local scripts only. It never executes any imported content. Untrusted strings go through `textContent`; no `innerHTML`, `eval`, or dynamic module imports.

## Research-to-development progression

The aim is to turn evidence gathering into actionable, reproducible work without claiming automatic device support.

| Stage                               | Deliverable                                                                           | What counts as proof                                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Implemented in Atlas v1             | Reusable groups, private stored captures, comparison map and safe summaries           | Unit tests, simulated-browser tests, persistence tests, manual mobile review                            |
| Next: structured signal annotations | Hypothesis/reason/source, protocol bit-width and known repeating fields               | Repeat independent observations with one changed input; preserve competing explanations                 |
| Next: safer hardware inputs         | Owner-approved logic/serial analyzer and documented IR receiver imports               | Passive known-good traces with calibrated sample rate, pin/electrical identity and reproducible parsing |
| Next: model-specific profiles       | Exact firmware/revision, vetted opcode meaning and action/receipt model               | Physical observed effects and recovery tests, not just matching synthetic frames                        |
| Next: repair/salvage integration    | Components catalog, board photographs, continuity/voltage notes and local BOM         | Independently verified electrical ratings; no speculative battery or motor wiring                       |
| Next: Pocket IR handoff             | Only named, reviewed consumer IR commands, supervised tests and secure board identity | Firmware authentication, verified IR output on a known model, and physical outcome receipts             |

## Sources / engineering inspiration

This original software uses Sasori's own source-backed Discovery record schema, not foreign protocol bytes. Low-cost maker guidance and project links are already recorded in [resourceful maker research](research/resourceful-maker-research-2026-10-24.md) and [pocket IR pilot](https://github.com/jimedusot-beep/Project-sasori/pull/31). Useful open analysis ecosystems include [sigrok/PulseView](https://sigrok.org/wiki/PulseView), [IRremoteESP8266](https://github.com/crankyoldgit/IRremoteESP8266), [rtl_433](https://github.com/merbanan/rtl_433) and [OpenFlexure](https://openflexure.org/about/). Any future importer needs format/version-specific fixtures, licensing review and safe receive-only defaults.
