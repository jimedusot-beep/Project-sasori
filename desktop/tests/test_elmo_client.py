import asyncio
import json
from pathlib import Path
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from elmo_protocol import SERVICE, NOTIFY, WRITE, password_digest, fletcher32
from elmo_protocol import response_frame, command_frame, parse_notification
from sasori_elmo import check_elmo, DemoClient

ROOT = Path(__file__).resolve().parents[2]
SYNTHETIC_PASSWORD = "Lab-Only-42"


class Client(DemoClient):
    def __init__(self, device, mode="ok", **options):
        super().__init__(device, **options)
        self.mode, self.options = mode, options
        self.writes = []
        self.disconnected = False
        if mode == "missing-service":
            self.services[0].uuid = "0000180f-0000-1000-8000-00805f9b34fb"
        if mode == "wrong-properties":
            self.tx.properties = ["write"]
        if mode == "ambiguous-channel":
            self.services[0].characteristics.append(self.tx)

    async def connect(self):
        if self.mode == "connect-timeout":
            await asyncio.Event().wait()

    async def start_notify(self, characteristic, callback):
        self.callback = callback
        frames = {
            "silent": None, "unset": b"\x40\x00", "early-acceptance": b"\x40\x01",
            "bare-status": b"\x40", "unknown-status": b"\x40\x03",
            "odd-challenge": b"\x41\x01\x02\x03", "oversized": b"\x41" + bytes(20),
        }
        frame = frames.get(self.mode, b"\x41\x10\x20\x30\x40")
        if frame is not None:
            callback(self.rx, frame)

    async def write_gatt_char(self, characteristic, frame, **options):
        self.writes.append((characteristic.uuid, bytes(frame), options))
        if self.mode == "driver-error":
            raise RuntimeError("private radio id, password and packet should never be exported")
        if frame[0] == 0x41:
            # Fixed expected bytes from the independent public synthetic vector, not the codec.
            if frame != bytes.fromhex("410a8e12ec"):
                self.callback(self.rx, b"\x40\x02")
            elif self.mode == "reject":
                self.callback(self.rx, b"\x40\x02")
            elif self.mode == "changed-challenge":
                self.callback(self.rx, b"\x41\x50\x60\x70\x80")
            elif self.mode == "unknown-after-response":
                self.callback(self.rx, b"\x40\xff")
            elif self.mode != "no-acceptance":
                self.callback(self.rx, b"\x40\x01")
        elif frame == b"\x22":
            if self.mode == "query-timeout":
                self.callback(self.rx, b"\x22\xff")
                self.callback(self.rx, b"\x20\x40")
            else:
                self.callback(self.rx, b"\x22\x05")
        elif frame == b"\x20":
            self.callback(self.rx, b"\x20\x41")
        if self.mode == "disconnect" and frame == b"\x22":
            self.options["disconnected_callback"](self)

    async def disconnect(self):
        self.disconnected = True
        if self.mode == "cleanup-failure":
            raise RuntimeError("driver-private-id")
        if self.mode == "cleanup-timeout":
            try:
                await asyncio.Event().wait()
            except asyncio.CancelledError:
                # A backend swallowing cancellation must not become confirmed cleanup.
                await asyncio.sleep(0.01)


class ElmoCodecTests(unittest.TestCase):
    def test_source_derived_vectors_preserve_unicode_low_bytes_and_whitespace(self):
        fixture = json.loads((ROOT / "experiments/001-elmo-l2l/fixtures/source-derived-auth.synthetic.json").read_text())
        self.assertEqual(fixture["source"], "synthetic")
        for vector in fixture["vectors"]:
            digest = password_digest(vector["password"])
            self.assertEqual(digest.hex(), vector["md5Hex"])
            self.assertEqual(response_frame(digest, bytes.fromhex(vector["challengeHex"])).hex(), vector["responseHex"])
        self.assertNotEqual(password_digest("Spaces Stay  "), password_digest("Spaces Stay"))

    def test_fletcher_preserves_negative_zero_and_rejects_unestablished_padding(self):
        self.assertEqual(fletcher32(b""), 0xffffffff)
        self.assertEqual(fletcher32(bytes(20)), 0xffffffff)
        self.assertEqual(fletcher32(b"\x01\x02"), 0x02010201)
        for invalid in (b"\x01", bytes(1026), "0102"):
            with self.assertRaises(ValueError):
                fletcher32(invalid)
        for challenge in (b"", b"\x01", bytes(20)):
            with self.assertRaises(ValueError):
                response_frame(bytes(16), challenge)

    def test_only_explicit_well_formed_password_status_is_recognized(self):
        for value in (b"\x40", b"\x40\x03", b"\x40\xff", b"\x40\x01\x00", bytes(21)):
            self.assertIsNone(parse_notification(value))
        self.assertEqual(parse_notification(b"\x40\x01"), ("password_status", 1))
        self.assertIsNone(parse_notification(b"\x22\x00"))
        self.assertIsNone(parse_notification(b"\x22\x10"))
        self.assertEqual(parse_notification(b"\x20\x40")[1]["nose"], True)
        for kind in ("reset", "password", "firmware", "raw", "volume-set"):
            with self.assertRaises(ValueError):
                command_frame(kind)


class ElmoClientTests(unittest.IsolatedAsyncioTestCase):
    async def session(self, mode="ok", **options):
        clients = []

        def factory(device, **kwargs):
            client = Client(device, mode, **kwargs)
            clients.append(client)
            return client

        report = await check_elmo(SimpleNamespace(address="private-device-id"), SYNTHETIC_PASSWORD,
                                  factory, duration=0.002, operation_timeout=0.04,
                                  auth_timeout=0.05, query_timeout=0.015,
                                  total_timeout=0.5, **options)
        return report, clients[0] if clients else None

    async def test_success_requires_challenge_response_acceptance_and_uses_only_fixed_channels(self):
        report, client = await self.session()
        self.assertEqual(report["outcome"], "completed")
        self.assertEqual(report["authenticationOutcome"], "toy-reported-acceptance")
        self.assertEqual(report["volume"], 5)
        self.assertTrue(report["inputs"]["nose"])
        self.assertTrue(report["inputs"]["left_hand"])
        self.assertEqual(report["queries"], {"volume": "matching-reply", "inputs": "matching-reply"})
        self.assertEqual(client.options["services"], [SERVICE])
        self.assertEqual([data for _, data, _ in client.writes], [bytes.fromhex("410a8e12ec"), b"\x22", b"\x20"])
        self.assertTrue(all(channel == WRITE and opts == {"response": False} for channel, _, opts in client.writes))
        self.assertFalse(report["authenticationVerified"])
        self.assertFalse(report["physicalEffectVerified"])
        self.assertEqual(report["cleanup"], "disconnected")
        encoded = json.dumps(report)
        for private in (SYNTHETIC_PASSWORD, "private-device-id", "04b4068e", "410a8e12ec", "10203040"):
            self.assertNotIn(private, encoded)

    async def test_greeting_is_opt_in_one_fixed_source_catalog_id_and_no_physical_claim(self):
        report, client = await self.session(hello=True)
        self.assertEqual([data for _, data, _ in client.writes].count(b"\x10\x09\x00"), 1)
        self.assertTrue(report["helloQueued"])
        self.assertEqual(report["observedEffect"], "not-tested")
        self.assertEqual(report["recoveryObserved"], "not-tested")

    async def test_unset_password_never_enrolls_and_early_acceptance_never_succeeds(self):
        for mode, reason in (("unset", "password-enrollment-disabled"),
                             ("early-acceptance", "unsolicited-acceptance")):
            report, client = await self.session(mode)
            self.assertEqual(report["reason"], reason)
            self.assertEqual(client.writes, [])
            self.assertTrue(client.disconnected)

    async def test_malformed_unknown_status_and_changed_challenge_fail_closed(self):
        for mode in ("bare-status", "unknown-status", "odd-challenge", "oversized",
                     "changed-challenge", "unknown-after-response"):
            report, client = await self.session(mode)
            self.assertEqual(report["outcome"], "failed", mode)
            self.assertNotEqual(report["authenticationOutcome"], "toy-reported-acceptance")
            self.assertFalse(report["helloQueued"])
            self.assertTrue(client.disconnected)

    async def test_rejection_and_deadlines_do_not_retry_or_send_actions(self):
        for mode, outcome in (("reject", "failed"), ("silent", "timeout"),
                              ("no-acceptance", "timeout"), ("connect-timeout", "timeout")):
            report, client = await self.session(mode, hello=True)
            self.assertEqual(report["outcome"], outcome, mode)
            self.assertLessEqual(len(client.writes), 1)
            self.assertFalse(report["helloQueued"])
            self.assertTrue(client.disconnected)

    async def test_observed_channels_and_properties_are_required_before_writing(self):
        for mode in ("missing-service", "wrong-properties", "ambiguous-channel"):
            report, client = await self.session(mode)
            self.assertEqual(report["outcome"], "failed")
            self.assertEqual(client.writes, [])

    async def test_wrong_reply_does_not_complete_volume_query_but_touch_pushes_remain_available(self):
        report, _ = await self.session("query-timeout")
        self.assertEqual(report["queries"]["volume"], "no-matching-reply")
        self.assertIsNone(report["volume"])
        self.assertTrue(report["inputs"]["nose"])

    async def test_disconnect_and_driver_errors_export_only_fixed_diagnostics(self):
        for mode in ("disconnect", "driver-error", "cleanup-failure"):
            report, client = await self.session(mode)
            self.assertTrue(client.disconnected)
            encoded = json.dumps(report)
            self.assertNotIn("private radio id", encoded)
            self.assertNotIn("driver-private-id", encoded)
            if mode == "cleanup-failure":
                self.assertEqual(report["cleanup"], "disconnect-not-confirmed")
            else:
                self.assertEqual(report["outcome"], "failed")

    async def test_disconnect_deadline_stays_unconfirmed_when_backend_swallows_cancellation(self):
        report, client = await self.session("cleanup-timeout")
        self.assertTrue(client.disconnected)
        self.assertEqual(report["cleanup"], "disconnect-not-confirmed")
        self.assertEqual(report["outcome"], "completed")

    async def test_pre_cancel_never_constructs_a_driver_and_late_frames_are_ignored(self):
        stop = asyncio.Event()
        stop.set()
        report, client = await self.session(stop_event=stop)
        self.assertIsNone(client)
        self.assertEqual(report["outcome"], "cancelled")
        report, client = await self.session()
        snapshot = json.dumps(report)
        client.callback(client.rx, b"\x40\x02")
        await asyncio.sleep(0)
        self.assertEqual(json.dumps(report), snapshot)

    async def test_cancellation_during_authentication_tears_down(self):
        stop = asyncio.Event()
        task = asyncio.create_task(self.session("silent", stop_event=stop))
        await asyncio.sleep(0)
        stop.set()
        report, client = await task
        self.assertEqual(report["outcome"], "cancelled")
        self.assertTrue(client.disconnected)


class ElmoCliTests(unittest.TestCase):
    def test_simulation_requires_no_radio_and_saves_exclusively_outside_repository(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / "trial.json"
            command = [sys.executable, str(ROOT / "desktop/sasori_elmo.py"), "--simulate",
                       "--duration", "0.1", "--output", str(path)]
            run = subprocess.run(command, capture_output=True, text=True, timeout=5)
            self.assertEqual(run.returncode, 0, run.stderr)
            report = json.loads(path.read_text())
            self.assertEqual(report["source"], "synthetic")
            self.assertFalse(report["helloRequested"])
            self.assertNotIn(SYNTHETIC_PASSWORD, path.read_text() + run.stdout + run.stderr)
            self.assertNotEqual(subprocess.run(command, capture_output=True).returncode, 0)
            command[-1] = str(ROOT / "forbidden-elmo-check.json")
            self.assertNotEqual(subprocess.run(command, capture_output=True).returncode, 0)


if __name__ == "__main__":
    unittest.main()
