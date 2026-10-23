# Sasori desktop BLE helper

A local, owner-run Python/Bleak inspection tool. It uses your computer's Bluetooth adapter, asks you to select a nearby device, and creates a Sasori session JSON file. It runs no HTTP server, accepts no remote commands, and has no application-write API.

Use Python 3.12+ with platform Bluetooth support:

    python3 -m venv .venv
    .venv/bin/python -m pip install -r desktop/requirements.txt

On Windows use the virtual environment's Scripts/python.exe path instead. OS Bluetooth permissions/drivers are still required for a real capture. Bleak is pinned to 3.0.2.

## Practice without hardware

Choose a private output directory outside the repository. On macOS/Linux, for example:

    .venv/bin/python desktop/sasori_ble.py --simulate --output /tmp/sasori-practice.json

Simulation does not import Bleak or access a radio. The export remains explicitly synthetic.

## Inspect your owned Elmo

Begin with metadata only:

    .venv/bin/python desktop/sasori_ble.py --authorize --output /tmp/elmo-metadata.json

The service/name defaults are the same community-reported Elmo candidates as the website. The helper scans for five seconds, lists matching device names without Bluetooth identifiers, and asks for a device number. Only select your own device. Keep the exact model/revision/firmware in the record; unknown is a valid explicit value.

Only after metadata confirms the notify endpoint, run a separate capture:

    .venv/bin/python desktop/sasori_ble.py --authorize --notify dab91382-b5a1-e29c-b041-bcd562613bdf --output /tmp/elmo-notifications.json

For another profile, provide sourced --service, optional --notify, --name-prefix, --model, --revision, --firmware, and --profile-id values. Blank notifications mean metadata only. An unknown name requires explicit --show-all. Full 128-bit UUIDs are required; firmware-update services are excluded.

Duration defaults to 15 seconds and is bounded to 0.1–30 seconds. Ctrl+C requests teardown and retains a user-stop record when possible. Driver operations and teardown have finite budgets. Capture is capped at 500 notifications. Explicit raw retention keeps at most the first 1,024 bytes per packet and 40 KB across the session, so the result fits the shared 250 KB record limit, including a full 128-characteristic service map. After that raw budget is exhausted, metadata is still captured; original lengths and truncation statistics remain available. Identity and title bounds use the shared format's UTF-16 units so Unicode exports remain importable.

## Import and privacy

In Sasori open **Research records → Import research file** and choose the JSON. It receives a fresh ID and an imported-claim label. Import never connects to a device or counts as independently verified hardware evidence.

Exports omit raw bytes by default. Explicit --retain-payloads retains private packet hex; review and secure that file yourself. Output must be outside the repository and is created exclusively with owner-only permissions where supported. Existing files and symlink targets are never overwritten. Regular Sasori metadata backups omit raw values again.

Bluetooth connection/subscription is not Elmo authentication. A silent capture is inconclusive. Serial/USB/IR/RF live adapters are not implemented; use offline Discovery for separately captured observations.

## Tests

    python3 -m unittest discover -s desktop/tests -v

Fake clients cover teardown, cancellation, timing, metadata defaults, raw truncation, invalid profiles, missing endpoints, noisy devices, and exclusive exports. CI also installs/imports the pinned Bleak package. These tests do not access actual hardware.

API references: [Bleak client](https://bleak.readthedocs.io/en/latest/api/client.html) and [scanner](https://bleak.readthedocs.io/en/latest/api/scanner.html).
