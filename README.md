# Project Sasori — Animatronics & Reverse Engineering Laboratory

A mobile workbench for observing Bluetooth devices, preserving research, and developing animatronic behavior safely. Experiment 001 investigates a user-owned Hasbro Love2Learn Elmo B6572 advertising as Elmo L2L.

**v0.2.0 is an experimental, inspection-only release. Real iPhone/Bluefy/Elmo validation is still required.** Independent fan research; no affiliation with Hasbro or Naruto.

## Try the laboratory

Open the [live laboratory](https://jimedusot-beep.github.io/Project-sasori/). HTTPS deployment and all 15 assets were verified on October 21, 2026. See [verification results](docs/verification.md) for the evidence and remaining hardware limits.

1. Open the site and turn on **Use simulation** to explore without hardware.
2. Tap **Run simulated inspection**. Three synthetic notifications appear; the finished session saves locally.
3. Open **Research records** to edit notes, search, compare captures, import JSON/TXT/CSV, or export a metadata backup.
4. For real inspection, open the HTTPS site in **Bluefy on iPhone**, turn simulation off, load the published Elmo profile, review its source, confirm authorization, and tap **Connect & inspect**.
5. For another BLE toy you own, open **My toys** to save a sourced service UUID and that toy's Bluetooth name prefix. Leave Notify blank for metadata-only inspection, then select an observed notification endpoint in Protocol explorer for the next manual session. See the [multi-toy guide](docs/my-toys.md).

The published UUID profile is transcribed from [NonaSuomy's GATT table](https://github.com/NonaSuomy/Love2LearnElmo/blob/82fa312e06af1d8e549cec588856ebce227b5f77/README.md). It is community-reported evidence, not a recovery of the old V4 source or proof of compatibility with your firmware. If service discovery fails, follow the [iPhone UUID capture guide](experiments/001-elmo-l2l/iphone-uuid-capture-guide.md).

## What works in software

- User-initiated, name-filtered discovery; service/characteristic metadata inspection; optional notification subscription.
- Persistent user-defined toy profiles with source notes, isolated name/UUID settings, profile backups/imports, and observed notification endpoint selection. Other built-in experiment slots remain scaffolds.
- State tracking, duplicate-attempt prevention, 45-second chooser budget, 6-second operation budgets, 15-second inspection deadline, 500-notification cap, manual reconnect, late-connection cleanup, and foreground-only inspection.
- Packet timestamps, byte counts, hex/text views, malformed/oversized flags, historical-pattern descriptions, and the preserved offline hex analyzer.
- IndexedDB records and settings, explicit memory fallback, notes, search, comparisons, JSON/TXT/CSV imports, metadata backups, v1 migration, corruption detection, and bounded storage.
- Synthetic transport scenarios and authentication outcomes; normalized virtual movement sequences; optional phone-local speech and tone previews.
- Beginner/engineering modes, large controls, accessible labels, diagnostic copying, JSON/TXT reports, and guided troubleshooting.

## Evidence boundaries

| Evidence class                                 | What it establishes                                                                                                                |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Historical V4, user-reported, October 20, 2026 | Discovery, GATT, custom service, notify subscription, and incoming NewModeIdx:12 / Start:LowPowerSleep text were observed earlier. |
| Community-reported                             | The cited researcher's GATT UUID table exists. The identifiers still need confirmation on this unit.                               |
| New live session                               | Only metadata and notifications captured during that particular inspection.                                                        |
| Synthetic                                      | Software lifecycle and UI behavior only. Never hardware compatibility or successful Elmo authentication.                           |
| Imported                                       | Source claims are retained and visibly marked as imported; they are not independently verified.                                    |

Original [V4 probe](https://elmo-auth-probe-jimbo.jimmysoto1994.chatgpt.site) recovery was attempted through accessible page resources, connected Sites, and prior context. The URL returned HTTP 403, the connected Sites list was empty, and no original source was recovered. This release contains no reconstructed authentication routine.

**Authentication, Elmo audio, sensor semantics, motor control, and safe physical limits remain unverified.** The live transport has no application characteristic-write calls, firmware operation, raw transmitter, automatic reconnect, or credential input. Notification subscription changes the BLE subscription descriptor.

## Your data

Records belong to this browser and exact site origin. They do not synchronize across devices, browsers, or the old V4 site. iOS eviction, private browsing, clearing storage, or changing origins can remove or separate them. Export backups regularly.

Default saves and backups omit raw payload bytes and text. Engineering mode allows deliberate raw session export/storage, reset to off for each new session. Unknown binary secrets cannot be reliably sanitized; raw hex may reveal the original bytes even when text is redacted. Review raw captures privately. Never commit credentials or personal identifiers.

Limits: 50 records, 8 MB application budget, 250 KB per record, 2 MB per imported file, and 20,000 characters per note. Larger research collections should use multiple metadata backups. No browser GitHub-token synchronization is implemented.

## Development and checks

Use Node 22 or later; CI uses Node 24. No runtime dependencies or build step are required.

```sh
npm ci
npm run check
npm audit --audit-level=high
npx playwright install --with-deps chromium webkit
npm run test:browser
npm run dev
```

The site serves on port 4173. Live Web Bluetooth requires HTTPS or an eligible localhost secure context. Simulation also works on HTTP previews. GitHub Pages publishes the site directory with relative asset paths.

[Testing details](docs/testing.md) explain fake GATT devices, IndexedDB integration, lifecycle regressions, Chromium/WebKit browser checks, accessibility, and what automation cannot prove.

## Documentation

- [Architecture and module APIs](docs/architecture.md)
- [Protocol specification and unknowns](docs/protocol.md)
- [Experiment 001](experiments/001-elmo-l2l/README.md), [evidence register](experiments/001-elmo-l2l/evidence-register.md), and [historical inbound bytes](experiments/001-elmo-l2l/protocol-notifications.md)
- Independent original-BLE track: [source verification and exact gaps](experiments/001-elmo-l2l/source-verification.md), [offline capture review](experiments/001-elmo-l2l/offline-review.md), and [gated live experiment draft](experiments/001-elmo-l2l/live-experiment.md). Authentication construction remains unverified; replacement-controller work can proceed independently.
- [iPhone setup](docs/iphone-setup.md), [troubleshooting](docs/troubleshooting.md), and [safety](docs/safety.md)
- [Current research/source/license register](docs/research/source-register.md)
- [Preserved seven-area engineering dossier](docs/research/seven-area-engineering-dossier.md) and [technology reuse matrix](docs/research/reuse-matrix.md)
- [Session format and Python interoperability](docs/interoperability.md), [JSON schema](schemas/session-v2.schema.json)
- [Audit](docs/audit.md), [verification](docs/verification.md), [roadmap](docs/roadmap.md), [changelog](CHANGELOG.md), [release notes](docs/release-notes.md)
- [Contributing](CONTRIBUTING.md), [security reporting](SECURITY.md), [MIT license](LICENSE)

The earlier dossier is preserved as a dated research record. The current source register and protocol document supersede its statements that no published Elmo UUID table has been found.
