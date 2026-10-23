"""Launch the unsigned simulator app and verify the rendered native workspace."""
import json
from pathlib import Path
import subprocess
import time


def command(*args, timeout=120):
    return subprocess.check_output(args, text=True, timeout=timeout).strip()


runtimes = json.loads(command("xcrun", "simctl", "list", "runtimes", "--json"))["runtimes"]
available = [r for r in runtimes if r.get("isAvailable") and r["identifier"].startswith("com.apple.CoreSimulator.SimRuntime.iOS-")]
if not available:
    raise RuntimeError("An available iOS simulator runtime is required for the launch check.")
runtime = sorted(available, key=lambda r: tuple(int(part) for part in r["version"].split(".")))[-1]
device = command("xcrun", "simctl", "create", "SasoriCI", "com.apple.CoreSimulator.SimDeviceType.iPhone-16", runtime["identifier"])
try:
    print("Booting the iPhone simulator.", flush=True)
    command("xcrun", "simctl", "boot", device)
    command("xcrun", "simctl", "bootstatus", device, "-b", timeout=600)
    print("Installing and launching Sasori.", flush=True)
    command("xcrun", "simctl", "install", device, "build/Build/Products/Debug-iphonesimulator/App.app")
    command("xcrun", "simctl", "launch", device, "org.sasori.laboratory")
    marker = "Sasori native interface ready"
    print("Waiting for the native Bluetooth workspace to render.", flush=True)
    for attempt in range(40):
        time.sleep(2)
        logs = command("xcrun", "simctl", "spawn", device, "log", "show", "--last", "2m",
                       "--style", "compact", "--predicate", 'eventMessage CONTAINS "' + marker + '"')
        if marker in logs:
            break
    else:
        raise RuntimeError("App launched but the native Bluetooth workspace did not render.")
    time.sleep(2)
    Path("build").mkdir(exist_ok=True)
    command("xcrun", "simctl", "io", device, "screenshot", "build/sasori-iphone.png")
    print("Sasori simulator app rendered the native Bluetooth workspace. No BLE device was accessed.")
finally:
    subprocess.run(["xcrun", "simctl", "shutdown", device], check=False)
    subprocess.run(["xcrun", "simctl", "delete", device], check=False)
