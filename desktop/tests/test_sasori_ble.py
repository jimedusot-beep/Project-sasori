import asyncio
import json
import os
import shutil
from pathlib import Path
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sasori_ble import ELMO_SERVICE, ELMO_NOTIFY, ROOT, MAX_RAW_BYTES, inspect_device, session_for, write_private


def config(**patch):
    return {"service": ELMO_SERVICE, "notify": ELMO_NOTIFY, "duration": 0.1,
            "model": "Synthetic desktop model", **patch}


class Client:
    def __init__(self, device, **options):
        self.options = options
        self.closed = False
        self.callback = None
        self.characteristic = SimpleNamespace(uuid=ELMO_NOTIFY, properties=["notify", "read"])
        self.services = [SimpleNamespace(uuid=ELMO_SERVICE, characteristics=[self.characteristic])]

    async def connect(self):
        pass

    async def disconnect(self):
        self.closed = True
        self.options["disconnected_callback"](self)

    async def start_notify(self, characteristic, callback):
        self.callback = callback
        callback(characteristic, bytearray([1, 2, 255]))


class DesktopTests(unittest.IsolatedAsyncioTestCase):
    @unittest.skipUnless(shutil.which("node"), "Node is needed for the shared web-record validator.")
    async def test_noisy_raw_and_unicode_exports_pass_the_shared_web_validator(self):
        class NoisyRaw(Client):
            def __init__(self, *args, **kwargs):
                super().__init__(*args, **kwargs)
                properties = ["read", "write", "write-without-response", "notify", "indicate"]
                self.services[0].characteristics = [SimpleNamespace(uuid=ELMO_NOTIFY, properties=properties) for _ in range(128)]

            async def start_notify(self, characteristic, callback):
                for _ in range(500):
                    callback(characteristic, bytes(1024))

        raw = await inspect_device(object(), config(retain_payloads=True, model="界" * 160, revision="界" * 60, firmware="界" * 60), NoisyRaw)
        self.assertEqual(raw["stats"]["packets"], 500)
        self.assertEqual(raw["stats"]["bytes"], 500 * 1024)
        self.assertLessEqual(sum(len(p["hex"].split()) for p in raw["packets"]), MAX_RAW_BYTES)
        self.assertTrue(any(p["truncated"] and not p["hex"] for p in raw["packets"]))
        unicode_record = session_for(config(model="🤖" * 80, revision="🤖" * 30), "simulated")
        with tempfile.TemporaryDirectory() as directory:
            for index, record in enumerate([raw, unicode_record]):
                path = Path(directory) / (str(index) + ".json")
                path.write_text(json.dumps(record), encoding="utf8")
                checked = subprocess.run([
                    shutil.which("node"), "--input-type=module", "--eval",
                    "import {readFileSync} from 'node:fs'; import {validateRecord} from './site/lib/records.js'; validateRecord(JSON.parse(readFileSync(process.argv[1], 'utf8')));",
                    str(path),
                ], cwd=ROOT, capture_output=True, text=True)
                self.assertEqual(checked.returncode, 0, checked.stderr)

    async def test_metadata_omits_bytes_and_tears_down(self):
        clients = []

        def factory(*args, **kwargs):
            client = Client(*args, **kwargs)
            clients.append(client)
            return client

        record = await inspect_device(object(), config(), factory)
        self.assertEqual(record["stats"]["packets"], 1)
        self.assertNotIn("hex", record["packets"][0])
        self.assertEqual(record["inspection"]["transport"], "bleak")
        self.assertTrue(clients[0].closed)
        self.assertFalse(clients[0].options["pair"])
        self.assertEqual(clients[0].options["services"], [ELMO_SERVICE])
        clients[0].callback(clients[0].characteristic, b"late")
        self.assertEqual(record["stats"]["packets"], 1)

    async def test_explicit_raw_capture_retains_values_and_original_lengths(self):
        class Large(Client):
            async def start_notify(self, characteristic, callback):
                callback(characteristic, bytearray([42]) * 1500)

        record = await inspect_device(object(), config(retain_payloads=True), Large)
        self.assertEqual(record["packets"][0]["length"], 1500)
        self.assertEqual(len(record["packets"][0]["hex"].split()), 1024)
        self.assertEqual(record["stats"]["truncated"], 1)
        self.assertEqual(record["stats"]["bytes"], 1500)

    async def test_missing_service_or_wrong_properties_fail_without_writes(self):
        class Missing(Client):
            def __init__(self, *args, **kwargs):
                super().__init__(*args, **kwargs)
                self.services = []

        class WriteOnly(Client):
            def __init__(self, *args, **kwargs):
                super().__init__(*args, **kwargs)
                self.characteristic.properties = ["write"]

        for driver in [Missing, WriteOnly]:
            record = await inspect_device(object(), config(), driver)
            self.assertEqual(record["outcome"], "operation-error")
            self.assertEqual(record["stats"]["packets"], 0)

    async def test_packet_budget_is_finite(self):
        class Noisy(Client):
            async def start_notify(self, characteristic, callback):
                for _ in range(700):
                    callback(characteristic, b"x")

        record = await inspect_device(object(), config(), Noisy)
        self.assertEqual(record["outcome"], "packet-limit")
        self.assertEqual(record["stats"]["packets"], 500)

    async def test_cancellation_tears_down_and_retains_a_user_stop_record(self):
        client = Client(object(), disconnected_callback=lambda _c: None)
        task = asyncio.create_task(inspect_device(object(), config(duration=1), lambda *a, **kw: client))
        await asyncio.sleep(0.01)
        task.cancel()
        record = await task
        self.assertTrue(client.closed)
        self.assertEqual(record["outcome"], "user")

    async def test_subscription_is_bounded_by_the_inspection_deadline(self):
        class Slow(Client):
            async def start_notify(self, characteristic, callback):
                await asyncio.sleep(1)

        record = await inspect_device(object(), config(), Slow)
        self.assertEqual(record["outcome"], "operation-timeout")
        self.assertLess(record["inspection"]["gattDurationMs"], 500)

    async def test_invalid_profiles_are_rejected_before_driver_creation(self):
        def forbidden(*args, **kwargs):
            raise AssertionError("Driver must not be created")

        for patch in [{"service": "invented"}, {"duration": 60}, {"model": ""}, {"model": "🤖" * 81}, {"firmware": "🤖" * 31}]:
            with self.assertRaises(ValueError):
                await inspect_device(object(), config(**patch), forbidden)

    async def test_private_output_is_exclusive_and_outside_the_repository(self):
        record = session_for(config(), "simulated")
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "capture.json"
            write_private(record, path)
            self.assertEqual(json.loads(path.read_text())["source"], "simulated")
            if os.name != "nt":
                self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            with self.assertRaises(FileExistsError):
                write_private(record, path)
        with self.assertRaises(ValueError):
            write_private(record, ROOT / "capture.json")

    async def test_simulation_requires_no_bleak_installation_or_radio(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "simulation.json"
            result = subprocess.run([sys.executable, str(ROOT / "desktop/sasori_ble.py"),
                                     "--simulate", "--output", str(output)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(output.read_text())["source"], "simulated")
            self.assertNotIn("dab9", result.stdout)
            refused = subprocess.run([sys.executable, str(ROOT / "desktop/sasori_ble.py"),
                                      "--output", str(Path(directory) / "unused.json")], capture_output=True, text=True)
            self.assertNotEqual(refused.returncode, 0)
            self.assertIn("--authorize", refused.stderr)


if __name__ == "__main__":
    unittest.main()
