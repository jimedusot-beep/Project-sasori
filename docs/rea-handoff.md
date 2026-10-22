# Private Sasori → REA capture handoff

This is an optional **offline, owner-run analysis path**. It does not add live Bluetooth writes, password handling, firmware flashing or remote device access to the web application.

## What you can do now

1. In [the Sasori laboratory](https://jimedusot-beep.github.io/Project-sasori/) run simulation or a permitted foreground inspection, and save your record locally.
2. Export a **metadata-only** session or backup to review counts safely. A backup does not contain the original notification bytes.
3. On your own computer with Node 22+, clone or open your Sasori repository. To inspect an export without revealing payloads, run:

    node scripts/rea-handoff.mjs /private/path/sasori-session.json

The result has only claimed source labels and counts, complete/missing-packet totals, import status and consistency checks. It excludes record IDs, names, service UUIDs, free text, full hex and byte sequences. Neither this script nor the file's source label confirms physical hardware observation.

## Optional sensitive trace

Only if you deliberately exported a **complete raw live session** from Sasori, and have reviewed its contents privately, run:

    node scripts/rea-handoff.mjs /private/path/live-session.json --trace /private/path/elmo-rea-trace.jsonl --acknowledge-sensitive

The output directory must be outside the Git repository. Existing outputs are never overwritten. The private file is created with owner-only permissions where supported by the OS, but filesystem permissions are not a substitute for securing backups. Do **not** run this with a simulated, imported or metadata-only capture: the tool rejects it.

Now from a separate local REA-Recovery-Kit checkout:

    python protocol_capture.py /private/path/elmo-rea-trace.jsonl --output /private/path/elmo-trace-report.json

REA expects one JSONL object per line with transport, direction and hex. Sasori's incoming notification packets are mapped to **BLE RX**, never guessed TX commands. The adapter refuses truncated, malformed, incomplete or contradictory-length captures and discloses no raw payload on its console. It does **not** establish that any byte is an authenticated response, a motor command, or a valid checksum.

## Reproducible checks

    node --test tests/rea-handoff.test.mjs
    npm run check

The isolated adapter tests validate count-only output, synthetic/imported exclusion, complete raw mapping, malformed input rejection, and exclusive output creation. The existing full Sasori check additionally covers lint, format, static typing, regression tests and security scan. Neither test validates actual Elmo hardware.

## Research intake

REA's [reuse candidate registry](https://github.com/jimedusot-beep/REA-Recovery-Kit/blob/main/research/reuse-candidates.json) and [source-scouting guide](https://github.com/jimedusot-beep/REA-Recovery-Kit/blob/main/research/REUSE-SCOUT.md) track BLE, serial, binary parsing, logic-analysis and animatronics leads with source hashes and license boundaries. Import algorithms and validated interface patterns, **never other toys' command bytes**.

### Current experiment gate

Before considering Elmo control, complete the five authentic inspection sessions in [M1](../docs/roadmap.md) and confirm the actual unit's UUIDs and firmware behavior. Independent BLE authentication needs full verified app-message evidence and the owner's known credential retained only in a private runner. A separate replacement-controller track requires identifying the exact electrical loads, voltages, motor driver and safe physical movement ranges first.

No source file, simulated exchange, or packet fingerprint constitutes permission to energize hardware.
