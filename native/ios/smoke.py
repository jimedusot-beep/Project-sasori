"""Launch the unsigned simulator app and verify the rendered native workspace."""
import json
from pathlib import Path
import subprocess
import time


def command(*args, timeout=120):
    return subprocess.check_output(args, text=True, timeout=timeout).strip()


def install_with_evidence(
    device, run=command, pause=time.sleep,
    bundle="org.sasori.laboratory",
    application="build/Build/Products/Debug-iphonesimulator/App.app",
):
    """Require installed bundle evidence, even when simctl install returns success.

    A fresh simulator is created by main(). A timed-out simctl request may still
    install the app; get_app_container independently checks installation before
    one bounded retry. Neither a timeout nor a 0 exit code alone is acceptance.
    """
    for attempt in range(2):
        try:
            run("xcrun", "simctl", "install", device, application, timeout=180)
        except (subprocess.TimeoutExpired, subprocess.CalledProcessError):
            print("Simulator install did not confirm; inspecting installed app container.", flush=True)
        try:
            installed = run(
                "xcrun", "simctl", "get_app_container", device, bundle, "app", timeout=30
            )
            directory = Path(installed.strip())
            if directory.suffix == ".app" and directory.is_dir():
                print("Fresh simulator app container verified.", flush=True)
                return directory
        except (subprocess.TimeoutExpired, subprocess.CalledProcessError, OSError):
            pass
        if attempt == 0:
            print("No confirmed app installation; retrying once.", flush=True)
            pause(5)
    raise RuntimeError("Simulator app installation unverified after two bounded attempts.")


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
                       "--style", "json", "--predicate", 'process == "App" AND eventMessage BEGINSWITH "Sasori native"')
        try:
            entries = json.loads(logs)
            seen = {entry["eventMessage"].strip() for entry in entries
                    if isinstance(entry, dict)
                    and str(entry.get("processImagePath", "")).endswith("/App")
                    and isinstance(entry.get("eventMessage"), str)}
        except (ValueError, TypeError):
            seen = set()
        if marker in seen:
            break
    else:
        print("Native readiness diagnostics:\n" + logs, flush=True)
        Path(screenshot).parent.mkdir(parents=True, exist_ok=True)
        try:
            run("xcrun", "simctl", "io", device, "screenshot", screenshot)
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
            print("Diagnostic screenshot unavailable.", flush=True)
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
        install_with_evidence(device)
        verify_workspace(device)
    finally:
        subprocess.run(["xcrun", "simctl", "shutdown", device], check=False)
        subprocess.run(["xcrun", "simctl", "delete", device], check=False)


if __name__ == "__main__":
    main()
