# Sasori desktop BLE helper

For TV controls from your phone, use the separate [local TV companion guide](../docs/tv-remote.md). `sasori_hub.py` serves the shared device hub and fixed Roku/Home Assistant/learned-IR APIs, using only the Python standard library. Its optional localhost configuration screen keeps Home Assistant credentials on the companion computer. It does not change the BLE inspection tools described below.

The original `sasori_ble.py` is an owner-run Python/Bleak inspection tool. It uses your computer's Bluetooth adapter, asks you to select a nearby device, and creates a Sasori session JSON file. That inspection tool has no application-write API. A separate experimental `sasori_elmo.py` now offers the source-derived known-password Elmo check below. Neither tool runs an HTTP server or accepts remote commands.

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

Bluetooth connection/subscription is not Elmo authentication. A silent capture is inconclusive. Serial/USB/RF live adapters are not implemented; use offline Discovery for separately captured observations. Live learned IR is available separately through the TV companion and a configured physical Home Assistant IR hub.

## Tests

The experimental Elmo client has separate codec and fake-radio lifecycle tests in the same suite.

    python3 -m unittest discover -s desktop/tests -v

Fake clients cover teardown, cancellation, timing, metadata defaults, raw truncation, invalid profiles, missing endpoints, noisy devices, and exclusive exports. CI also installs/imports the pinned Bleak package. These tests do not access actual hardware.

API references: [Bleak client](https://bleak.readthedocs.io/en/latest/api/client.html) and [scanner](https://bleak.readthedocs.io/en/latest/api/scanner.html).

## Experimental Elmo known-password check

The [recovered source review](../experiments/001-elmo-l2l/recovered-source.md) documents the acquired app's exact hash, relevant methods, and the independently inspected community implementation. Source-derived software is now implemented; Jimmy's real Elmo has not yet been tested with it. This desktop workflow is separate from the browser/native inspection UI.

Practice with no Bluetooth access:

```sh
.venv/bin/python desktop/sasori_elmo.py --simulate --duration 0.1 --output /tmp/elmo-synthetic-check.json
```

For your Love2Learn Elmo, use an interactive terminal with Bluetooth permission:

```sh
.venv/bin/python desktop/sasori_elmo.py --authorize --output /tmp/elmo-first-check.json
```

The tool scans for five seconds, lists candidates without radio identifiers, and asks you to choose your toy. Enter its **known existing password** in the private prompt. There is no password command-line argument, persistent password storage, automatic enrollment, guessing, reset, or automatic reconnect. Keep another app disconnected from the toy. A missing/wrong password or unsupported challenge fails explicitly.

The helper observes the exact service/notify/write-without-response channels, answers one challenge, and requires a complete `40 01` response after its current challenge response. It then requests volume and input state and briefly monitors touch notifications. Missing query replies stay unknown; no guessed battery percentage or firmware value is produced. The session has a 30-second overall budget, finite operation/auth/query budgets, a 500-notification cap and bounded teardown. Backend cancellation still depends on the OS driver cooperating.

To request one source-catalogued greeting after the handshake, explicitly add `--hello`:

```sh
.venv/bin/python desktop/sasori_elmo.py --authorize --hello --output /tmp/elmo-greeting-check.json
```

Only built-in sound ID 9 is exposed, at the toy's existing volume. The request is queued once; no generic sound IDs, volume/settings changes, file/audio uploads, motor or firmware operations are offered. Disconnect is **not** a verified silence command, and a queued greeting does not establish that it played. Observe the actual toy and record the result/recovery before expanding controls.

The new receipt format is `sasori.elmo-check` v1, kept outside the repo with exclusive owner-only file creation. It contains only fixed diagnostic stages, timings, query results and separate untested physical-observation fields. It omits device IDs, passwords, digests, challenges, responses and raw packets. This receipt is **not** a research-session or web action-trial import; review it as its own JSON report. Synthetic runs remain explicitly synthetic. All independent hardware/authentication/physical-effect verification flags remain false, even when the current peer reports password acceptance.
