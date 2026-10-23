"""Launch the unsigned simulator app and verify the rendered native workspace."""
import json
from pathlib import Path
import subprocess
import time


def command(*args, timeout=120):
    return subprocess.check_output(args, text=True, timeout=timeout).strip()


def verify_workspace(device, run=command, pause=time.sleep, screenshot="build/sasori-iphone.png"):
    # simctl sometimes hangs after launching successfully. A timeout is not success:
    # the fresh simulator must still supply the app's readiness marker and a screenshot.
    try:
        run("xcrun", "simctl", "launch", device, "org.sasori.laboratory")
    except subprocess.TimeoutExpired:
        print("simctl launch timed out; checking independent app-render evidence.", flush=True)
    marker = "Sasori native interface ready"
    print("Waiting for the native Bluetooth workspace to render.", flush=True)
    for attempt in range(40):
        pause(2)
        logs = run("xcrun", "simctl", "spawn", device, "log", "show", "--last", "10m",
                       "--style", "compact", "--predicate", 'eventMessage CONTAINS "' + marker + '"')
        if marker in logs:
            break
    else:
        raise RuntimeError("The native Bluetooth workspace did not supply render evidence.")
    pause(2)
    Path(screenshot).parent.mkdir(parents=True, exist_ok=True)
    run("xcrun", "simctl", "io", device, "screenshot", screenshot)
    print("Sasori simulator app rendered the native Bluetooth workspace. No BLE device was accessed.")

def main():
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
        verify_workspace(device)
    finally:
        subprocess.run(["xcrun", "simctl", "shutdown", device], check=False)
        subprocess.run(["xcrun", "simctl", "delete", device], check=False)


if __name__ == "__main__":
    main()
