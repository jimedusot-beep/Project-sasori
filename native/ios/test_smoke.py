"""Synthetic unit tests for the CI-only iOS simulator installation gate."""
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent))
from smoke import install_with_evidence


class InstallEvidenceTests(unittest.TestCase):
    def test_normal_install_requires_real_app_directory(self):
        with tempfile.TemporaryDirectory() as folder:
            app = Path(folder) / "App.app"
            app.mkdir()
            calls = []

            def run(*args, timeout):
                calls.append(args[2])
                return str(app) if args[2] == "get_app_container" else ""

            installed = install_with_evidence("FAKE-SIM", run=run, pause=lambda _: None)
            self.assertEqual(installed, app)
            self.assertEqual(calls, ["install", "get_app_container"])

    def test_timeout_is_accepted_only_after_independent_install_evidence(self):
        with tempfile.TemporaryDirectory() as folder:
            app = Path(folder) / "App.app"
            app.mkdir()
            calls = []

            def run(*args, timeout):
                calls.append(args[2])
                if args[2] == "install":
                    raise subprocess.TimeoutExpired(args, timeout)
                return str(app)

            installed = install_with_evidence("FAKE-SIM", run=run, pause=lambda _: None)
            self.assertEqual(installed, app)
            self.assertEqual(calls, ["install", "get_app_container"])

    def test_failed_install_retries_once_then_fails_closed(self):
        calls = []
        pauses = []

        def run(*args, timeout):
            calls.append(args[2])
            raise subprocess.TimeoutExpired(args, timeout)

        with self.assertRaisesRegex(RuntimeError, "unverified"):
            install_with_evidence(
                "FAKE-SIM", run=run, pause=pauses.append
            )
        self.assertEqual(calls, ["install", "get_app_container"] * 2)
        self.assertEqual(pauses, [5])

    def test_successful_install_without_bundle_still_fails(self):
        with tempfile.TemporaryDirectory() as folder:
            not_an_app = Path(folder) / "wrong"
            not_an_app.mkdir()
            calls = []

            def run(*args, timeout):
                calls.append(args[2])
                return str(not_an_app) if args[2] == "get_app_container" else ""

            with self.assertRaisesRegex(RuntimeError, "unverified"):
                install_with_evidence("FAKE-SIM", run=run, pause=lambda _: None)
            self.assertEqual(calls, ["install", "get_app_container"] * 2)

    def test_second_install_can_recover_after_first_no_bundle(self):
        with tempfile.TemporaryDirectory() as folder:
            app = Path(folder) / "App.app"
            app.mkdir()
            attempts = [0]
            calls = []

            def run(*args, timeout):
                calls.append(args[2])
                if args[2] == "install":
                    attempts[0] += 1
                    return ""
                if attempts[0] == 1:
                    raise subprocess.CalledProcessError(1, args)
                return str(app)

            installed = install_with_evidence("FAKE-SIM", run=run, pause=lambda _: None)
            self.assertEqual(installed, app)
            self.assertEqual(calls, ["install", "get_app_container"] * 2)


if __name__ == "__main__":
    unittest.main()
