"""Launch the unsigned simulator app and verify actual native bridge registration."""
import json
from pathlib import Path
import subprocess
import time


def command(*args):
    return subprocess.check_output(args, text=True).strip()


runtimes = json.loads(command("xcrun", "simctl", "list", "runtimes", "--json"))["runtimes"]
available = [r for r in runtimes if r.get("isAvailable") and r["identifier"].startswith("com.apple.CoreSimulator.SimRuntime.iOS-")]
if not available:
    raise RuntimeError("An available iOS simulator runtime is required for the launch check.")
runtime = sorted(available, key=lambda r: tuple(int(part) for part in r["version"].split(".")))[-1]
device = command("xcrun", "simctl", "create", "SasoriCI", "com.apple.CoreSimulator.SimDeviceType.iPhone-16", runtime["identifier"])
try:
    command("xcrun", "simctl", "boot", device)
    command("xcrun", "simctl", "bootstatus", device, "-b")
    command("xcrun", "simctl", "install", device, "build/Build/Products/Debug-iphonesimulator/App.app")
    command("xcrun", "simctl", "launch", device, "org.sasori.laboratory")
    marker = "Sasori native inspection bridge registered"
    for attempt in range(10):
        time.sleep(2)
        logs = command("xcrun", "simctl", "spawn", device, "log", "show", "--last", "2m",
                       "--style", "compact", "--predicate", 'eventMessage CONTAINS "' + marker + '"')
        if marker in logs:
            break
    else:
        raise RuntimeError("App launched but did not register the native inspection bridge.")
    Path("build").mkdir(exist_ok=True)
    command("xcrun", "simctl", "io", device, "screenshot", "build/sasori-iphone.png")
    print("Sasori simulator app launched and registered the native inspection bridge. No BLE device was accessed.")
finally:
    subprocess.run(["xcrun", "simctl", "shutdown", device], check=False)
    subprocess.run(["xcrun", "simctl", "delete", device], check=False)
