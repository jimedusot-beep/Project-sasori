"""Owner-run local BLE inspection and portable Sasori session export. No server or writes."""
import argparse
import asyncio
import json
import os
from pathlib import Path
import re
import time
import uuid
from datetime import datetime, timezone

ELMO_SERVICE = "dab91435-b5a1-e29c-b041-bcd562613bdf"
ELMO_NOTIFY = "dab91382-b5a1-e29c-b041-bcd562613bdf"
PROPERTIES = {"read", "write", "write-without-response", "notify", "indicate"}
ROOT = Path(__file__).resolve().parents[1]


def stamp():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def normalize_uuid(value):
    value = value.strip().lower()
    if not re.fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", value):
        raise ValueError("Use a full sourced service/notification UUID.")
    if "-1212-efde-1523-785feabcd123" in value:
        raise ValueError("Firmware services are excluded.")
    return value


def session_for(config, source="live"):
    duration = config["duration"]
    if not isinstance(duration, (int, float)) or not 0.1 <= duration <= 30:
        raise ValueError("Duration must be 0.1–30 seconds.")
    service = normalize_uuid(config["service"])
    notify = normalize_uuid(config["notify"]) if config["notify"] else ""
    model = config.get("model", "Love2Learn Elmo · B6572")
    revision, firmware = config.get("revision", "unknown"), config.get("firmware", "unknown")
    for value, limit in [(model, 160), (revision, 60), (firmware, 60)]:
        if not isinstance(value, str) or not value.strip() or len(value) > limit:
            raise ValueError("Invalid device identity.")
    return {
        "format": "sasori.session", "schemaVersion": 2, "id": str(uuid.uuid4()),
        "source": source, "profileId": config.get("profile_id", "001"), "importedAt": None,
        "title": model[:140] + (" · simulated inspection" if source == "simulated" else " · desktop inspection"),
        "startedAt": stamp(), "endedAt": None, "outcome": "active", "notes": "",
        "packets": [], "events": [], "services": [],
        "stats": {"packets": 0, "bytes": 0, "malformed": 0, "truncated": 0},
        "payloadsIncluded": config.get("retain_payloads", False) is True,
        "inspection": {"adapterId": "ble-inspection/v1", "transport": "simulation" if source == "simulated" else "bleak",
            "model": model.strip(), "revision": revision.strip(), "firmware": firmware.strip(),
            "service": service, "notify": notify, "requestedDurationMs": round(duration * 1000), "gattDurationMs": 0},
    }


async def inspect_device(device, config, client_factory, stop_event=None):
    """Testable finite inspection. Caller explicitly selects a discovered BLEDevice."""
    record = session_for(config)
    stop = stop_event or asyncio.Event()
    reason = "inspection-complete"
    connected_at = None
    accepting = True
    stage = "gatt-connection"

    def event(level, message):
        record["events"].append({"timestamp": stamp(), "level": level, "message": message})

    def disconnected(_client):
        nonlocal reason
        if accepting:
            reason = "unexpected"
            stop.set()

    client = client_factory(device, disconnected_callback=disconnected,
                            services=[record["inspection"]["service"]], timeout=6, pair=False)

    def received(characteristic, data):
        nonlocal reason
        if not accepting:
            return
        if len(record["packets"]) >= 500:
            reason = "packet-limit"
            stop.set()
            return
        length = len(data)
        raw = bytes(data[:1024])
        packet = {"timestamp": stamp(), "characteristic": str(characteristic.uuid).lower(),
                  "length": length, "kind": "unknown", "truncated": length > 1024, "malformed": False}
        if record["payloadsIncluded"]:
            packet.update(hex=raw[:1024].hex(" "), text="")
        record["packets"].append(packet)
        record["stats"]["packets"] += 1
        record["stats"]["bytes"] += length
        record["stats"]["truncated"] += int(packet["truncated"])

    try:
        event("stage", stage)
        await asyncio.wait_for(client.connect(), timeout=6)
        connected_at = time.monotonic()
        deadline = connected_at + config["duration"]

        async def bounded(awaitable):
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                if hasattr(awaitable, "close"):
                    awaitable.close()
                raise asyncio.TimeoutError
            return await asyncio.wait_for(awaitable, timeout=min(6, remaining))

        stage = "service-discovery"
        event("stage", stage)
        service = next((s for s in client.services if str(s.uuid).lower() == record["inspection"]["service"]), None)
        if service is None or len(service.characteristics) > 128:
            raise ValueError("Configured service was not observed or exceeds metadata limits.")
        record["services"] = [{"uuid": str(service.uuid).lower(), "evidence": "observed-this-session",
                              "characteristics": [{"uuid": str(c.uuid).lower(),
                                "properties": ["writeWithoutResponse" if p == "write-without-response" else p
                                               for p in c.properties if p in PROPERTIES],
                                "evidence": "observed-this-session"} for c in service.characteristics]}]
        if record["inspection"]["notify"]:
            stage = "notification-subscription"
            event("stage", stage)
            characteristic = next((c for c in service.characteristics
                                   if str(c.uuid).lower() == record["inspection"]["notify"]), None)
            if characteristic is None or not ({"notify", "indicate"} & set(characteristic.properties)):
                raise ValueError("Configured notification endpoint is absent or cannot notify.")
            await bounded(client.start_notify(characteristic, received))
        stage = "inspection-ready"
        event("stage", stage)
        try:
            await asyncio.wait_for(stop.wait(), timeout=max(0, deadline - time.monotonic()))
            if reason == "inspection-complete":
                reason = "user"
        except asyncio.TimeoutError:
            pass
    except asyncio.CancelledError:
        reason = "user"
    except asyncio.TimeoutError:
        reason = "operation-timeout"
        event("error", "Operation timed out at " + stage)
    except Exception:
        reason = "operation-error"
        event("error", "Operation failed at " + stage)
    finally:
        accepting = False
        event("stage", "teardown")
        if connected_at is not None:
            record["inspection"]["gattDurationMs"] = max(0, round((time.monotonic() - connected_at) * 1000))
        try:
            await asyncio.wait_for(client.disconnect(), timeout=6)
        except Exception:
            reason = "teardown-error"
        record["endedAt"] = stamp()
        record["outcome"] = ("inconclusive-no-notifications"
                             if reason == "inspection-complete" and not record["stats"]["packets"] else reason)
    return record


def private_output_path(output):
    path = Path(output).expanduser()
    parent = path.parent.resolve(strict=True)
    if parent == ROOT or ROOT in parent.parents:
        raise ValueError("Keep session exports outside the Git repository.")
    path = parent / path.name
    if path.exists() or path.is_symlink():
        raise FileExistsError("Output already exists.")
    return path


def write_private(record, output):
    path = private_output_path(output)
    # Exclusive creation also refuses existing files and symbolic-link targets.
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf8") as handle:
        json.dump(record, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


async def run(args):
    config = {"service": args.service, "notify": args.notify or "", "duration": args.duration,
              "model": args.model, "revision": args.revision, "firmware": args.firmware,
              "retain_payloads": args.retain_payloads, "profile_id": args.profile_id}
    # Validate before importing a driver or accessing any radio.
    record = session_for(config, "simulated" if args.simulate else "live")
    private_output_path(args.output)
    if args.simulate:
        record["endedAt"] = stamp()
        record["outcome"] = "synthetic-metadata"
        record["notes"] = "Synthetic desktop fixture. No Bluetooth hardware was accessed."
    else:
        if not args.authorize:
            raise ValueError("Use --authorize only for a device you own or are authorized to inspect.")
        if not args.name_prefix.strip() and not args.show_all:
            raise ValueError("Choose a name prefix or explicitly use --show-all.")
        from bleak import BleakClient, BleakScanner
        discoveries = await BleakScanner.discover(timeout=5, return_adv=True)
        candidates = [device for device, advertisement in discoveries.values()
                      if args.show_all or (advertisement.local_name or device.name or "").startswith(args.name_prefix)]
        candidates = candidates[:30]
        if not candidates:
            raise ValueError("No matching devices found. Check power, range, and other connected apps.")
        for index, device in enumerate(candidates, 1):
            print(str(index) + " · " + (device.name or "Unnamed device")[:80])
        selection = int(input("Choose your device number (0 cancels): "))
        if not 1 <= selection <= len(candidates):
            raise ValueError("Selection cancelled.")
        record = await inspect_device(candidates[selection - 1], config, BleakClient)
    write_private(record, args.output)
    print("Saved " + record["source"] + " session: " + record["outcome"] + ", " +
          str(record["stats"]["packets"]) + " notifications. " +
          ("RAW PAYLOADS RETAINED; keep private." if record["payloadsIncluded"] else "Metadata only."))
    print("In Sasori, open Research records and import this JSON. Imported source claims remain marked as imported.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--simulate", action="store_true")
    parser.add_argument("--authorize", action="store_true")
    parser.add_argument("--service", default=ELMO_SERVICE)
    parser.add_argument("--notify", default="", help="Blank means metadata only; use an observed Notify/Indicate UUID.")
    parser.add_argument("--name-prefix", default="Elmo")
    parser.add_argument("--show-all", action="store_true")
    parser.add_argument("--duration", type=float, default=15)
    parser.add_argument("--retain-payloads", action="store_true")
    parser.add_argument("--model", default="Love2Learn Elmo · B6572")
    parser.add_argument("--revision", default="unknown")
    parser.add_argument("--firmware", default="unknown")
    parser.add_argument("--profile-id", default="001")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    if not re.fullmatch(r"[a-zA-Z0-9_-]{1,40}", args.profile_id):
        parser.error("Profile identifier must be 1–40 letters, digits, underscores or dashes.")
    try:
        asyncio.run(run(args))
    except (KeyboardInterrupt, asyncio.CancelledError):
        parser.exit(1, "Inspection stopped; Bluetooth teardown was requested.\n")
    except Exception as error:
        message = str(error) if isinstance(error, ValueError) else "Check local Bluetooth permissions, drivers, dependencies, and output path."
        parser.exit(1, "Inspection failed: " + message + "\n")


if __name__ == "__main__":
    main()
