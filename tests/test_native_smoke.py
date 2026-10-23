"""The simulator-launch fallback requires render proof; timeout alone must fail."""
import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location(
    "native_smoke", Path(__file__).resolve().parents[1] / "native/ios/smoke.py")
smoke = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(smoke)


class NativeSmokeTests(unittest.TestCase):
    def test_timed_out_launch_requires_marker_and_screenshot(self):
        calls = []

        def run(*args):
            calls.append(args)
            if args[2] == "launch":
                raise subprocess.TimeoutExpired(args, 120)
            if "log" in args:
                self.assertIn("10m", args)
                return "Sasori native interface ready"
            return ""

        with tempfile.TemporaryDirectory() as root:
            smoke.verify_workspace("new-simulator", run=run, pause=lambda _: None,
                                   screenshot=str(Path(root) / "proof.png"))
        self.assertTrue(any("screenshot" in args for args in calls))

    def test_missing_marker_fails_even_after_launch_timeout(self):
        def run(*args):
            if args[2] == "launch":
                raise subprocess.TimeoutExpired(args, 120)
            self.assertNotIn("screenshot", args)
            return "no readiness marker"

        with self.assertRaisesRegex(RuntimeError, "render evidence"):
            smoke.verify_workspace("new-simulator", run=run, pause=lambda _: None)

    def test_other_launch_errors_and_failed_screenshots_propagate(self):
        def launch_failure(*args):
            raise subprocess.CalledProcessError(1, args)

        with self.assertRaises(subprocess.CalledProcessError):
            smoke.verify_workspace("new-simulator", run=launch_failure, pause=lambda _: None)

        def screenshot_failure(*args):
            if "log" in args:
                return "Sasori native interface ready"
            if "screenshot" in args:
                raise subprocess.CalledProcessError(1, args)
            return ""

        with tempfile.TemporaryDirectory() as root:
            with self.assertRaises(subprocess.CalledProcessError):
                smoke.verify_workspace("new-simulator", run=screenshot_failure,
                                       pause=lambda _: None, screenshot=str(Path(root) / "proof.png"))


if __name__ == "__main__":
    unittest.main()
