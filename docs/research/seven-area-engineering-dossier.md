# Project Sasori — Seven-Area Engineering Dossier
Research date: 2026-10-20. Experiment: 001 — Love2Learn Elmo, Hasbro B6572.
Status: evidence-backed planning and implementation; real-device authentication and actuation not demonstrated.

## How to read this document
PRIMARY = original manufacturer, regulator, specification or official tool documentation.
SECONDARY = community reproduction or engineering notes, still requiring validation.
OBSERVATION = user-provided Elmo logs from the earlier V4 Bluefy probe.
HYPOTHESIS = useful explanation without enough evidence for acceptance.

Do not confuse a capability of BLE/GATT with a capability supported by Elmo's application protocol. Do not copy packets from an unrelated toy to Elmo.

## 1 — Repository and reusable-code survey

### Verified sources
- MDN Web Bluetooth API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API (PRIMARY API reference)
- MDN characteristic API: https://developer.mozilla.org/en-US/docs/Web/API/BluetoothRemoteGATTCharacteristic (PRIMARY API reference)
- Web Bluetooth CG specification: https://webbluetoothcg.github.io/web-bluetooth/ (PRIMARY specification)
- Chrome live notifications demo: https://googlechrome.github.io/samples/web-bluetooth/notifications-async-await.html (PRIMARY sample)
- Bleak: https://github.com/hbldh/bleak (open-source Python BLE client for a future host, not an iPhone Web Bluetooth replacement)
- nRF Connect: https://www.nordicsemi.com/Products/Development-tools/nRF-Connect-for-mobile (official scanner/documentation)

### Technical extraction
Web Bluetooth requires a supporting browser and secure context; it cannot be assumed available from Safari. The device chooser is triggered from a user gesture. When acceptAllDevices is used, requestDevice optionalServices must include the non-standard service later accessed through getPrimaryService. The GATT connection alone does not authorize any toy action. Characteristics expose permissions; a notify property allows subscribing with startNotifications. The browser receives characteristicvaluechanged events containing a DataView. stopNotifications and gatt.disconnect permit local cleanup. Physical radio disconnections are asynchronous.

The current Sasori Web BLE app uses HTML/JS deployed as static GitHub Pages. Avoid copying a large React/Node BLE desktop stack for this problem: it would add dependencies without solving access to the iPhone's Bluetooth hardware. Use browser-native Web Bluetooth, pure protocol parsing modules and test fakes. Maintain a second transport adapter for Python Bleak only when a computer host is needed.

### Implemented in research branch
- Offline Elmo notification parser and seven regression cases.
- Defensive session management and automatic 15-second read-only inspection stop.
- Dedicated identification of manual, timed, and unexpected disconnects.
- Node tests using an emulated BLE GATT client.
- No application writes, commands, authentication, firmware update, or motor actions.

### Acceptance
Node tests pass and Bluefy can repeatedly connect using verified UUIDs while raw notifications are logged. Until live testing, report simulated connection tests separately from the user's earlier V4 results.

## 2 — Elmo-specific BLE and authentication

### Manufacturer and regulatory evidence
- FCC ID RS4-B6572: https://fccid.io/RS4-B6572 (PRIMARY filing metadata; application 2016-03-07, radio band 2402–2480 MHz).
- Hasbro original connection FAQ: https://hasbro-new.custhelp.com/app/answers/detail/a_id/348/ (PRIMARY: BLE and original app workflow).
- Hasbro app terms: https://docs.hasbro.com/en-us/legal/app-terms?ID=108 (PRIMARY: user-selected app-toy password; customized settings).
- Hasbro app setting FAQ: https://hasbro-new.custhelp.com/app/answers/detail/a_id/353/ (PRIMARY: password visible in legacy app settings).
- Hasbro application archive: https://apps.hasbro.com/en-US/love2learn-elmo (PRIMARY: app discontinued; page contains inconsistent discontinuation dates).
- Archived APK catalog entries: https://apkpure.net/love2learn-elmo/com.hasbro.ElmoLove2Learn/download/1.5 (THIRD PARTY; metadata only unless publisher signature and provenance are independently verified; do NOT automatically install).

### What is observed, not assumed
V4 Bluefy log on 2026-10-20: device name Elmo L2L, GATT connection, custom service, write-without-response plus notify characteristics, notification subscription, payloads 604e65774d6f64654964783a313200 and 6153746172743a4c6f77506f776572536c656570 and 6100. The payloads display text NewModeIdx:12 and Start:LowPowerSleep after omitting their respective first bytes. Those leading bytes (0x60/0x61) have unknown meaning; NewModeIdx number 12 is not independently mapped to a physical operating mode. The V4 read-only inspection ended deliberately after about 15 seconds. Later screenshots show MODE inspect rather than an authentication run.

### Critical gaps
Verified service UUID, write and notify characteristic UUIDs, original V4 source, complete message framing, authentication challenge format, algorithm, confirmation packet, legitimate app-command mapping, motor safety envelope and audio capability remain unknown. Recover V4 source only from a source you control or are authorized to access. App package name reported by third-party archives is com.hasbro.ElmoLove2Learn; do not treat a repackaged APK as authentic without validation. Hasbro documents that factory reset erases customization; do not reset for a communication troubleshooting shortcut.

### Decision gates
Gate A: Source UUIDs from original V4 code or read-only nRF Connect discovery and record their provenance. Gate B: Repeat five read-only Bluefy sessions and record outcomes. Gate C: Study lawfully obtained original app materials and verified traces for authentication; never derive commands solely from text strings or logs. Gate D: Only with stable, correctly bounded controls consider any actuation experiment.

## 3 — Community and comparative reverse engineering

### Sources
- Jeija bluefluff, Furby Connect protocol research: https://github.com/Jeija/bluefluff (SECONDARY: different toy with different protocol).
- Reddit WHOOP BLE case study: https://www.reddit.com/r/developersIndia/comments/1s8tahx/i_reverseengineered_the_whoop_40s_bluetooth/ (SECONDARY: author's reproducible workflow, device-specific packet parsing).
- Nordic nRF Connect official functions: https://www.nordicsemi.com/Products/Development-tools/nRF-Connect-for-mobile (PRIMARY).
- Nordic BLE Sniffer setup/behavior: https://docs.nordicsemi.com/r/bundle/nrfutil/page/nrfutil-ble-sniffer/guides/overview.html (PRIMARY; requires appropriate sniffer hardware and host).

### Reusable method
Collect multiple consented communication samples with a written hypothesis, change only one input at a time, align notifications by relative timestamps, compare packet lengths and repeated fields, then label conclusions as observed, hypothesis, or reproduced. Build an immutable sample register with test ID and provenance. Analyze offline before ever replaying a packet. Packet content can contain password-related or personal information: redact before committing publicly. A Bluetooth sniffer observes radio traffic but does not magically decrypt encrypted application payloads; hardware and pairing constraints apply.

### Non-transferable material
Furby-specific bytecodes, action lists, and update processes are NOT compatible with Elmo by virtue of both being Hasbro toys. WHOOP frame checksums do not establish Elmo's checksum choice. Use their documentation templates and laboratory method, not raw commands.

### Acceptance
A Sasori protocol hypothesis must have at least one cited raw observation, a competing explanation, and an explicit test that could disprove it. Mark unsupported cases UNKNOWN.

## 4 — Hardware identification and engineering

### Sources
- FCC internal photography (9 pages): https://fccid.io/RS4-B6572/Internal-Photos/Internal-Photos-2921152.pdf (PRIMARY).
- Official Hasbro product instructions: https://instructions.hasbro.com/en-us/instruction/playskool-friends-sesame-street-love2learn-elmo (PRIMARY).
- Project Herbie Salvage Compatibility & Testing Manual (local project engineering reference).

### Facts and limits
The exact B6572 toy uses four 1.5 V AA alkaline cells according to Hasbro instructions. This is a battery arrangement, NOT a verified logic power rail, motor terminal voltage, or permission to connect an external 6 V supply. FCC photo pages 5–7 show a larger PCB, a small daughterboard/radio module and interconnecting pads/connectors. Component markings are not sufficiently verified from available image quality to approve a specific radio SoC or obtain an electrical pinout. The small radio module looks detachable in filing photography; its mounting or connector type must be confirmed from the actual unit.

### Test/inventory checklist
Record visible PCB silkscreen, full photo of both sides, chip top markings with focus and scale, battery compartment, wire connector positions, speaker part number/impedance marking, motor actuator markings, gear travel and any sharp or exposed elements. Do NOT reverse-engineer a pinout by wire colors or continuity alone. Do NOT power detached boards from random adapters. Working toy's BLE read-only diagnostics do not require additional teardown.

### Acceptance
A component candidate gets VERIFIED only after exact model+revision, electrical ratings, circuit/interface documentation and conservative tests. Until then label UNKNOWN and keep motors under toy's own intended power configuration.

## 5 — Independent software audit

### Repository inspected
https://github.com/jimedusot-beep/Project-sasori
Review the live file at site/app.js and tests at tests/.

### Main risks found on the starter branch
- One timeout-driven disconnect could be confused with Elmo spontaneously dropping the connection.
- A stale disconnection callback from an older session could affect the current UI if not scoped to a unique session.
- Subscription callbacks must be detached on teardown; otherwise repeated connection cycles may duplicate notifications.
- Clipboard API can fail on an iPhone browser; an export alternative must remain available.
- Raw logs can include personal data. There is no secure private sync backend; local browser storage may be cleared.
- The original V4 source and UUIDs are missing, so a new site's success cannot be claimed based on V4 screenshots.

### Changes in the research branch
Session IDs, explicit stop reasons, scoped callbacks, listener cleanup, best-effort stopNotifications, safe disconnects, timeout cancellation, and simulated tests for success, manual stop, physical-link loss, invalid UUID and notification reception. No user-facing write endpoint.

### Remaining audit gates
Run GitHub CI; test Bluefy with the real toy; verify behavior when app backgrounds, device chooser cancels, GATT discovery fails, duplicate button presses occur or service UUID is wrong. Check all warnings without claiming 'failproof' reliability. Unit tests cannot reproduce radio interference, hardware power issues or iOS browser peculiarities.

## 6 — Controlled physical experiments

### Baseline — INSPECT-001
Precondition: Elmo uses intact recommended batteries, wiring isolated from gears, nRF Connect disconnected/closed, Bluefy on HTTPS site, known UUIDs from credible evidence.
Procedure: tap Connect & inspect once, select only Elmo L2L, leave app foreground until session times out. Save locally sanitized record: UTC start time, device/user-approved nickname, page version, connection stage, notification count, disconnect reason. Repeat five times with the same physical setup.
Expected: no application command writes, explicit timed-inspection reason, no crash, and no stale connection UI.
Pass for software acceptance: 5/5 cleanly terminated sessions and five records; this threshold is a proposed test target, not a manufacturer performance specification.
If it fails: isolate picker, link, service, characteristic, notification, or teardown stage. Never respond by guessing packets.

### DIAG-002 — Error recovery
Use synthetic BLE mocks for canceled picker, unsupported browser, non-notify characteristic, connection rejection, unexpected disconnect and stale callbacks; assert the user gets an accurate reason and can start a later session. Test raw strings separately.

### DEC-003 — Parser integrity
Decode three historical sample payloads, preserve original hex, remove only terminator bytes from presentation, never infer motor capability. Test invalid UTF-8, empty payload, 4097-byte oversized input, unpaired hex digits and strings containing HTML; all rendered output must use textContent.

### FUTURE GATES
Only after verified UUIDs: read-only 5-run baseline. Only after lawful protocol evidence: limited authentication experiment with a confirmed password and bounded time. Only after independent power/mechanical evidence: guarded motion; read-only software alone is not a movement safety system.

## 7 — Expansion architecture and interoperable animatronics

### Sources
- Bottango driver APIs: https://github.com/EvanBottango/Bottango (BSD-3-Clause licensed drivers, desktop application communicates with Arduino driver via USB or network driver via WebSocket).
- Adafruit CircuitPython BLE: https://github.com/adafruit/Adafruit_CircuitPython_BLE (future embedded examples; verify exact hardware compatibility).
- Python Bleak: https://github.com/hbldh/bleak (future host BLE adapter).
- NASA Systems Engineering Handbook: https://www.nasa.gov/reference/systems-engineering-handbook/ (systems verification framework).

### Architecture recommendation
Use a core experiment registry: experiment ID, device profile, transport, allowed capabilities, observed evidence, risk classification, acceptance tests and source links. Each device adapter describes what it can actually prove. Simulator emits an explicit SIMULATED tag, and no simulator result counts as physical verification. Never let a UI feature (a motor slider) imply it can reach real motors.

Boundary 1 (current): Browser -> Web Bluetooth -> owned toy read-only notifications.
Boundary 2 (future): Laptop Python -> Bleak -> verified toy characteristics, authenticated and guarded.
Boundary 3 (future): Animation timeline -> safe actuator adapter -> measured independent microcontroller. This is where Bottango methods may inform puppet motion, not on the unknown Elmo BLE channel.
Boundary 4 (future): H.E.R.B.I.E. consumes published, versioned and explicitly verified device-capability contracts only.

### Priority
Prioritize Elmo read-only reliability and evidence first, offline packet research second, authenticated observations third, new animatronic devices later. Installing an elaborate animation engine before verifying a command pathway would produce a decorative prototype, not robotic capability.

## Priority decision register (at publication)
P0 — Confirm missing BLE UUIDs / recover original V4 source (BLOCKED: external user evidence needed).
P0 — Repeat clean Bluefy read-only inspections on deployed Sasori site (BLOCKED: merge + physical device).
P1 — Run parser and session test suites; review browser compatibility (IMPLEMENTED on research branch, CI unverified).
P1 — Build redacted evidence log / reproducible test register (DOCUMENTED).
P2 — Investigate legitimately sourced, verified original app versions (RESEARCH ONLY; third-party archives untrusted).
P2 — Identify actual PCB markings using focused photos, no power modifications.
P3 — Add authenticated protocol operations only after documented safety and correctness gates.
P4 — Integrate animation/physical controls only after independent characterization.
