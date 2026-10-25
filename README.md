# Project Sasori — Animatronics & Reverse Engineering Laboratory

A mobile workbench for observing Bluetooth devices, preserving research, and developing animatronic behavior safely. Experiment 001 investigates a user-owned Hasbro Love2Learn Elmo B6572 advertising as Elmo L2L.

The device workspace connects saved identities, active connection status, notification timelines, Discovery analysis, and versioned research notes. Start with [Quick connections](docs/quick-connect.md): Elmo settings are included, and another BLE toy can expose its model/firmware without manual UUID entry. Native access is available as a buildable [iPhone app](native/ios/README.md) and a local [desktop BLE helper](desktop/README.md); real-device validation remains required.

**Open the [Device hub](https://jimedusot-beep.github.io/Project-sasori/hub.html) for remembered setups, Elmo sound/volume/touch controls and saved routines.** Use Bluefy on iPhone/iPad or a compatible Bluetooth browser. Bluetooth controls need no Python or Terminal. [Full phone directions](docs/device-hub.md) include demos, reconnection, password setup/recovery and cancellation. The simpler [Elmo Remote](https://jimedusot-beep.github.io/Project-sasori/elmo.html) remains available.

**The experimental hub supports Elmo, standard BLE, original MiP, Furby Connect and local TV adapters.** Elmo has twenty reviewed built-in sound IDs, repeated sound/volume requests in ten-minute Control sessions, live touch reactions and saved performances. A [local TV companion](docs/tv-remote.md) provides Roku, configured Home Assistant media-player and learned IR-remote controls through the same layout. TV control requires a computer running the helper; IR additionally requires a compatible physical hub.

**[Furby Connect and device identification](docs/furby-connect.md):** identify supported Bluetooth service/channel combinations before choosing an adapter. The experimental 2016 Furby adapter reads the GeneralPlus firmware byte, requests an undecoded presence reply and briefly requests a blue antenna light. It reuses setups, action receipts and routines. Use Bluefy or another Web Bluetooth browser; native Furby controls and physical verification remain unavailable.

**Experimental Pocket Remote:** [phone + ESP32 IR bridge](https://jimedusot-beep.github.io/Project-sasori/pocket-ir.html), with Samsung/LG community candidate profiles, five named buttons, saved setups, and an offline demo. Normal use is choose profile → connect → prepare → press. [Import existing Flipper .ir remote files](docs/flipper-ir-import.md) to build more named profiles without hex or JSON editing. No computer companion is needed after flashing the bridge. The [attributed MIT firmware/build kit](hardware/pocket-ir/README.md) includes exact source pins and wiring. Physical IR and appliance behavior remain unverified; a phone alone cannot emit IR. [Full directions and protocol limits](docs/pocket-ir-pilot.md).

[Universal controls](docs/universal-controls.md) provides one connection-and-action workspace, remembered local device references, and reusable setup backups across supported families. Select the protocol/model, try its offline demo, then connect your matching device. **Run connection check** records a repeatable Identify → Status → Find/LED trial with physical-effect/recovery observations. The [adapter and validation guide](docs/device-action-validation.md) explains exact MiP bytes, evidence limits, and private Elmo app-source intake. Custom Elmo authentication, movement and playback remain unverified.

The broader [community scan](docs/research/community-scan-2026-10-23.md) recovered the previously missing Elmo APK and found a newer standalone community client. [Direct method review](experiments/001-elmo-l2l/recovered-source.md) now establishes the implemented handshake subset. Use the [browser remote](docs/elmo-remote.md) or [experimental desktop Elmo procedure](desktop/README.md#experimental-elmo-known-password-check) with your known password; source-backed software and synthetic tests do not establish acceptance or physical effects on your particular unit.

## Offline Signal Atlas

[Open Signal Atlas](https://jimedusot-beep.github.io/Project-sasori/signal-atlas.html) to group and compare existing Discovery captures from the **same browser's local notebook**. Explore a synthetic demo, paste authorized bytes or infrared timings, opt in to raw-value retention, inspect stable/variable/missing indexes, import metadata-only backups and export identity-free aggregate findings. No Bluetooth or device actions occur in Atlas. Imported and synthetic claims never establish physical effects. See [Atlas documentation](docs/signal-atlas.md) for precise evidence and storage limits.

## Try Sasori

Open [Sasori Simple Mode](https://jimedusot-beep.github.io/Project-sasori/) to choose a device, connect or try an offline demo. Open the [full Research Lab](https://jimedusot-beep.github.io/Project-sasori/index.html) for inspection and engineering tools. HTTPS deployment and all 15 assets were verified on October 21, 2026. See [verification results](docs/verification.md) for the evidence and remaining hardware limits.

1. Open the site and turn on **Use simulation** to explore without hardware.
2. Tap **Run simulated inspection**. Three synthetic notifications appear; the finished session saves locally.
3. Open **Research records** to edit notes, search, compare captures, import JSON/TXT/CSV, or export a metadata backup.
4. For real inspection, open the HTTPS site in **Bluefy on iPhone** or a Bluetooth-capable desktop browser. Tap **Love2Learn Elmo**, confirm ownership, and **Connect & inspect**. Start with connection details, then choose an observed channel from the result card for a separate notification capture.
5. For another BLE toy, tap **Another Bluetooth toy**, supply its Bluetooth name or explicitly show all devices, and connect to read available model/firmware fields. **Save device setup** prepares a profile with those observations. **Devices** also accepts sourced custom service/notification UUIDs. See [Quick connections](docs/quick-connect.md) and the [multi-toy guide](docs/my-toys.md).
6. Open **Discovery workbench** to label and compare offline hex or infrared timing captures, inspect local PCM16 WAV files, and save discovery metadata. See the [Discovery guide](docs/discovery-workbench.md) for retention and evidence limits.

The published UUID profile is transcribed from [NonaSuomy's GATT table](https://github.com/NonaSuomy/Love2LearnElmo/blob/82fa312e06af1d8e549cec588856ebce227b5f77/README.md). It is community-reported evidence, not a recovery of the old V4 source or proof of compatibility with your firmware. If service discovery fails, follow the [iPhone UUID capture guide](experiments/001-elmo-l2l/iphone-uuid-capture-guide.md).

## What works in software

The [wider maker-research record](docs/research/resourceful-maker-research-2026-10-24.md) examines civilian open hardware from Ukraine, Gaza/Palestine, Tanzania, India, China and international communities, with source/license notes and concrete transfer decisions. Its next hardware candidate is a phone-to-IR pocket bridge; that transport remains research, while the Elmo reaction/performance engine is implemented.

- [Device hub](docs/device-hub.md): a shared Connect → Control → Routine experience across five families, restored browser grants where supported, useful fixed failure explanations, one-time migration of earlier control setups, private local bindings and portable backups. [Saved routines](docs/device-hub.md#save-and-run-a-routine) are explicit, cancellable and bounded to 32 steps/two minutes. Imports never run actions.
- [TV and universal remote](docs/tv-remote.md): an original Python standard-library companion with manual browser pairing, local Roku metadata/key mappings, Home Assistant capability-based media controls and named learned IR buttons. Optional Home Assistant configuration stays on the companion computer. No automatic network scan or physical IR emitter is present in the web page.
- [Elmo Remote](docs/elmo-remote.md): a standalone responsive HTML app with Connect, Read status, Play greeting, Disconnect, an isolated demo and private result download. Browser Bluetooth supports existing-password authentication and explicitly opted-in setup after the toy reports no password. In-page recovery instructions cite Hasbro's password display and physical reset. Secrets are never saved. Native Elmo writes and independent physical validation remain unavailable.

- [Experimental Elmo desktop client](desktop/README.md#experimental-elmo-known-password-check): privately prompted existing password, one bounded challenge/response, strict acceptance/rejection, volume/input queries, touch monitoring and an opt-in single greeting. No automatic enrollment, reset, raw commands or credential logging. The original inspection helper remains separate.

- [Universal controls](docs/universal-controls.md): reusable standard BLE and original MiP protocol families; Identify, Status, bounded Find/LED, Stop, saved reconnect references and private setup backups. Web and native iPhone share the same intents. [Action trials](docs/device-action-validation.md) record timings, outcomes and separate owner observations; only fresh local live checks can meet the ten-session review target. Unsupported controls remain unavailable.

- User-initiated, name-filtered discovery; service/characteristic metadata inspection; optional notification subscription.
- [Protocol recorder](docs/protocol-recorder.md): normalized TX/RX JSON/CSV import, observation markers, frame timelines, selected intervals, byte/timing comparisons, and reusable trace records with opt-in raw retention. Built-in source-linked adapter manifests include Elmo analysis and an original manufacturer-documented MiP offline codec. [Protocol sources and reuse decisions](docs/research/adapter-inspirations.md) are pinned and cited; the recorder sends no commands and Elmo authentication is not claimed.
- Quick Elmo/unknown-toy setups, bounded standard model/firmware reads on web and native iPhone, useful connection results, observed-channel shortcuts, and metadata connection reports. Identity reads finish as soon as the available fields have been read.
- Integrated browser/Bluefy setup, active-device status, per-profile recent sessions, physical-evidence collection checklist, notification timing, direct offline analysis handoff, and five previous title/note versions.
- A shared inspection adapter contract used by the web transport, native Core Bluetooth facade, and desktop Bleak helper. Imported profiles never execute or unlock commands.
- Persistent user-defined toy profiles with source notes, isolated name/UUID settings, profile backups/imports, and observed notification endpoint selection. Other built-in experiment slots remain scaffolds.
- Offline Discovery workbench: nine independent interface research plans, labeled byte/pulse comparisons, first-channel WAV waveform/spectrum inspection, bounded local capture storage, and metadata-only backups with imported-claim provenance.
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

Original [V4 probe](https://elmo-auth-probe-jimbo.jimmysoto1994.chatgpt.site) recovery was attempted through accessible page resources, connected Sites, and prior context. The URL returned HTTP 403, the connected Sites list was empty, and no original V4 source was recovered. The new desktop handshake instead follows directly inspected app-method facts and the newly found community implementation; it is not a recovered V4 routine.

**Real-unit Elmo authentication, audio/input behavior, motor control, and physical limits remain unverified.** Inspection transports have no application characteristic-write calls. Separate control adapters expose fixed reviewed commands; the experimental desktop Elmo client privately prompts for an existing password. There is no generic raw transmitter, firmware operation or automatic reconnect. Notification subscription changes the BLE subscription descriptor.

## Your data

Records belong to this browser and exact site origin. They do not synchronize across devices, browsers, or the old V4 site. iOS eviction, private browsing, clearing storage, or changing origins can remove or separate them. Export backups regularly.

Default saves and backups omit raw payload bytes and text. Engineering mode allows deliberate raw session export/storage, reset to off for each new session. Unknown binary secrets cannot be reliably sanitized; raw hex may reveal the original bytes even when text is redacted. Review raw captures privately. Never commit credentials or personal identifiers.

Limits: 50 records, 8 MB research-data budget, 250 KB per record, 13 MB per imported file, and 20,000 characters per note. Full notebooks export compact metadata backups that fit the import and native-share file budget. The storage, per-record, packet and note limits remain in effect during restoration. Bounded local IDs and import timestamps are accounted for separately so restoring a full notebook preserves its data. No browser GitHub-token synchronization is implemented.

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

- [Device hub: complete phone directions, remembered connections and routines](docs/device-hub.md)
- [TV companion: Roku, Home Assistant and learned IR setup](docs/tv-remote.md)
- [Architecture and module APIs](docs/architecture.md)
- [Supported control families, real-device check workflow and private Elmo source intake](docs/device-action-validation.md)
- [Protocol recorder, trace format, and adapter catalog](docs/protocol-recorder.md), [source implementation register](docs/research/adapter-inspirations.md)
- [October 23 code and reliability audit](docs/audit-2026-10-23.md)
- [Connected devices and evidence collection](docs/connected-devices.md), [device adapter contract](docs/adapter-contract.md)
- [Quick connections, model/firmware reads, and reusable setups](docs/quick-connect.md)
- [Native iPhone build/install](native/ios/README.md) and [desktop helper setup](desktop/README.md)
- [Discovery workbench: captures, comparisons, sound analysis, and backups](docs/discovery-workbench.md)
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
