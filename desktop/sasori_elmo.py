"""Finite owner-run Love2Learn Elmo authentication/inspection; optional single greeting.

No server, automatic reconnect, password enrollment, firmware, or raw command interface.
The password, digest, challenge and response never enter the receipt or console logs.
"""
import argparse
import asyncio
import getpass
import json
import math
import sys
import time
import uuid
from types import SimpleNamespace

from elmo_protocol import SERVICE, NOTIFY, WRITE, password_digest, response_frame
from elmo_protocol import command_frame, parse_notification
from sasori_ble import stamp, write_private, private_output_path


class ProtocolStop(Exception):
    """Contains only a fixed diagnostic code, never backend error text or payloads."""


async def check_elmo(device, password, client_factory, *, hello=False, duration=5,
                     operation_timeout=6, auth_timeout=10, query_timeout=2,
                     total_timeout=30, stop_event=None, synthetic=False):
    budgets = (duration, operation_timeout, auth_timeout, query_timeout, total_timeout)
    if (any(not isinstance(n, (float, int)) or not math.isfinite(n) or n <= 0 for n in budgets)
            or duration > 15 or max(budgets) > 30 or not isinstance(hello, bool)):
        raise ValueError("Invalid Elmo session budget.")
    digest = bytearray(password_digest(password))
    password = None
    started = time.monotonic()
    report = {
        "format": "sasori.elmo-check", "schemaVersion": 1,
        "id": str(uuid.uuid4()), "source": "synthetic" if synthetic else "live",
        "adapterId": "elmo-known-password/experimental-v1",
        "modelSelection": "Love2Learn Elmo B6572 protocol family",
        "modelObserved": "unknown", "firmwareObserved": "unknown",
        "startedAt": stamp(), "endedAt": None, "durationMs": 0,
        "outcome": "active", "reason": "", "cleanup": "pending",
        "authenticationOutcome": "not-tested", "helloRequested": hello,
        "helloQueued": False, "volume": None, "inputs": None,
        "queries": {}, "notifications": 0, "ignoredNotifications": 0,
        "events": [], "hardwareVerified": False, "authenticationVerified": False,
        "physicalEffectVerified": False, "observedEffect": "not-tested",
        "recoveryObserved": "not-tested",
    }
    loop = asyncio.get_running_loop()
    abort = loop.create_future()
    challenge_ready, accepted = asyncio.Event(), asyncio.Event()
    query_ready = {name: asyncio.Event() for name in ("volume", "inputs")}
    phase, pending_query, challenge, accepting = "connecting", None, None, True
    client = None

    def mark(code):
        if len(report["events"]) < 32:
            report["events"].append({"elapsedMs": round((time.monotonic() - started) * 1000),
                                     "code": code})

    def fail(code):
        if accepting and not abort.done():
            abort.set_result(code)

    def disconnected(_client):
        if accepting:
            loop.call_soon_threadsafe(fail, "unexpected-disconnect")

    def receive(endpoint, packet):
        nonlocal phase, challenge
        if not accepting or abort.done():
            return
        if str(getattr(endpoint, "uuid", "")).lower() != NOTIFY:
            fail("unexpected-endpoint")
            return
        report["notifications"] += 1
        if report["notifications"] > 500:
            fail("notification-limit")
            return
        parsed = parse_notification(packet)
        if parsed is None:
            report["ignoredNotifications"] += 1
            if packet and packet[0] in (0x40, 0x41):
                fail("malformed-auth-frame")
            return
        kind, value = parsed
        if kind == "challenge":
            if phase != "waiting-challenge":
                fail("challenge-changed")
                return
            challenge = value
            phase = "challenge-received"
            mark("challenge-received")
            challenge_ready.set()
        elif kind == "password_status":
            if value == 0:
                report["authenticationOutcome"] = "password-not-set"
                fail("password-enrollment-disabled")
            elif value == 2:
                report["authenticationOutcome"] = "rejected"
                fail("password-rejected")
            elif phase in ("response-pending", "waiting-acceptance"):
                report["authenticationOutcome"] = "toy-reported-acceptance"
                phase = "accepted"
                accepted.set()
                mark("toy-reported-acceptance")
            elif phase != "accepted":
                fail("unsolicited-acceptance")
        elif phase == "accepted":
            if kind == "inputs":
                report["inputs"] = value
            elif kind == "volume" and pending_query == "volume":
                report["volume"] = value
            if kind == pending_query:
                query_ready[kind].set()

    def received(endpoint, data):
        # Bleak normally marshals callbacks to its loop; also handle other caller threads.
        if not isinstance(data, (bytes, bytearray)):
            loop.call_soon_threadsafe(fail, "invalid-notification")
        elif len(data) > 20:
            loop.call_soon_threadsafe(fail, "oversized-notification")
        else:
            loop.call_soon_threadsafe(receive, endpoint, bytes(data))

    def retire(task):
        if not task.done():
            task.cancel()
        # Consume driver exceptions even when an abort and failure arrive together.
        task.add_done_callback(lambda done: None if done.cancelled() else done.exception())

    async def step(awaitable, seconds):
        if abort.done():
            if asyncio.iscoroutine(awaitable):
                awaitable.close()
            raise ProtocolStop(abort.result())
        task = asyncio.ensure_future(awaitable)
        try:
            done, _ = await asyncio.wait((task, abort), timeout=seconds,
                                         return_when=asyncio.FIRST_COMPLETED)
            if abort in done:
                raise ProtocolStop(abort.result())
            if task not in done:
                raise TimeoutError
            return await task
        finally:
            # Do not let cancellation acknowledgment extend the operation budget.
            retire(task)

    async def watch_stop():
        await stop_event.wait()
        fail("user-stop")

    stop_task = asyncio.create_task(watch_stop()) if stop_event else None
    try:
        if stop_event and stop_event.is_set():
            raise ProtocolStop("user-stop")
        async with asyncio.timeout(total_timeout):
            client = client_factory(device, disconnected_callback=disconnected,
                                    services=[SERVICE], timeout=operation_timeout, pair=False)
            await step(client.connect(), operation_timeout)
            services = [s for s in client.services if str(s.uuid).lower() == SERVICE]
            if len(services) != 1:
                raise ProtocolStop("missing-or-ambiguous-service")
            channels = services[0].characteristics
            rx = [c for c in channels if str(c.uuid).lower() == NOTIFY and "notify" in c.properties]
            tx = [c for c in channels if str(c.uuid).lower() == WRITE and "write-without-response" in c.properties]
            if len(rx) != 1 or len(tx) != 1:
                raise ProtocolStop("missing-or-ambiguous-channels")
            phase = "waiting-challenge"
            mark("channels-observed")
            auth_deadline = time.monotonic() + auth_timeout
            await step(client.start_notify(rx[0], received), operation_timeout)
            await step(challenge_ready.wait(), max(0, auth_deadline - time.monotonic()))
            frame = response_frame(digest, challenge)
            challenge = None
            phase = "response-pending"
            await step(client.write_gatt_char(tx[0], frame, response=False), operation_timeout)
            frame = None
            mark("challenge-response-queued")
            if not accepted.is_set():
                phase = "waiting-acceptance"
            await step(accepted.wait(), max(0, auth_deadline - time.monotonic()))
            # Keep no credential-derived material for post-authentication actions.
            digest[:] = bytes(16)
            if hello:
                await step(client.write_gatt_char(tx[0], command_frame("hello"), response=False), operation_timeout)
                report["helloQueued"] = True
                mark("greeting-write-queued")
            for intent in ("volume", "inputs"):
                pending_query = intent
                await step(client.write_gatt_char(tx[0], command_frame(intent), response=False), operation_timeout)
                try:
                    await step(query_ready[intent].wait(), query_timeout)
                    report["queries"][intent] = "matching-reply"
                except TimeoutError:
                    report["queries"][intent] = "no-matching-reply"
                pending_query = None
            mark("monitoring-inputs")
            await step(asyncio.sleep(duration), duration + 1)
            report["outcome"] = "completed"
            report["reason"] = "bounded-check-complete"
    except ProtocolStop as error:
        report["reason"] = str(error)
        report["outcome"] = "cancelled" if str(error) == "user-stop" else "failed"
    except TimeoutError:
        report["outcome"], report["reason"] = "timeout", "session-or-operation-timeout"
    except asyncio.CancelledError:
        report["outcome"], report["reason"] = "cancelled", "user-stop"
    except Exception:
        # Driver messages may contain addresses or packet data. Do not export them.
        report["outcome"], report["reason"] = "failed", "bluetooth-driver-error"
    finally:
        accepting = False
        digest[:] = bytes(16)
        challenge = None
        if stop_task:
            stop_task.cancel()
            await asyncio.gather(stop_task, return_exceptions=True)
        if client is not None:
            cleanup_task = None
            try:
                cleanup_task = asyncio.ensure_future(client.disconnect())
                done, _ = await asyncio.wait((cleanup_task,), timeout=2)
                if cleanup_task not in done:
                    raise TimeoutError
                await cleanup_task
                report["cleanup"] = "disconnected"
            except (Exception, asyncio.CancelledError):
                report["cleanup"] = "disconnect-not-confirmed"
            finally:
                if cleanup_task is not None:
                    retire(cleanup_task)
        else:
            report["cleanup"] = "no-client-created"
        report["endedAt"] = stamp()
        report["durationMs"] = round((time.monotonic() - started) * 1000)
    return report


class DemoClient:
    """Synthetic fixture. No import of Bleak or radio access."""
    def __init__(self, device, **options):
        self.rx = SimpleNamespace(uuid=NOTIFY, properties=["notify"])
        self.tx = SimpleNamespace(uuid=WRITE, properties=["write-without-response"])
        self.services = [SimpleNamespace(uuid=SERVICE, characteristics=[self.rx, self.tx])]
        self.callback = None

    async def connect(self):
        pass

    async def start_notify(self, channel, callback):
        self.callback = callback
        callback(self.rx, b"\x41\x10\x20\x30\x40")

    async def write_gatt_char(self, channel, frame, **options):
        reply = b"\x40\x01" if frame[0] == 0x41 else {
            "volume": b"\x22\x05", "inputs": b"\x20\x00",
        }.get(next((name for name in ("volume", "inputs") if frame == command_frame(name)), ""))
        if reply:
            self.callback(self.rx, reply)

    async def disconnect(self):
        pass


async def run(args):
    if not 0.1 <= args.duration <= 15:
        raise ValueError("Monitoring duration must be 0.1–15 seconds.")
    private_output_path(args.output)
    if args.simulate:
        report = await check_elmo(None, "Lab-Only-42", DemoClient, hello=args.hello,
                                  duration=args.duration, synthetic=True)
    else:
        if not args.authorize:
            raise ValueError("Use --authorize for your owned or authorized Elmo.")
        if not sys.stdin.isatty():
            raise ValueError("Use an interactive terminal for the private password prompt.")
        from bleak import BleakClient, BleakScanner
        discoveries = await BleakScanner.discover(timeout=5, return_adv=True)
        devices = [device for device, adv in discoveries.values()
                   if SERVICE in [s.lower() for s in (adv.service_uuids or [])]
                   or (adv.local_name or device.name or "").startswith("Elmo")][:30]
        if not devices:
            raise ValueError("No matching Elmo found. Check power, range and other connected apps.")
        for index, device in enumerate(devices, 1):
            label = "".join(c if c.isprintable() else " " for c in (device.name or "Elmo candidate"))
            print(str(index) + " · " + label[:80])
        choice = int(input("Choose your Elmo number (0 cancels): "))
        if not 1 <= choice <= len(devices):
            raise ValueError("Selection cancelled.")
        password = getpass.getpass("Known Elmo password (private, not saved): ")
        try:
            report = await check_elmo(devices[choice - 1], password, BleakClient,
                                      duration=args.duration, hello=args.hello)
        finally:
            password = None
    write_private(report, args.output)
    print("Saved " + report["source"] + " Elmo check: " + report["outcome"] + " / " + report["reason"] + ".")
    print("Toy-reported authentication: " + report["authenticationOutcome"] + ". Physical effect/recovery need owner observation.")
    return 0 if report["outcome"] == "completed" else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--simulate", action="store_true")
    parser.add_argument("--authorize", action="store_true")
    parser.add_argument("--hello", action="store_true", help="After acceptance, request one built-in greeting (sound 9). No stop/silence guarantee.")
    parser.add_argument("--duration", type=float, default=5)
    parser.add_argument("--output", required=True, help="New private receipt outside the repository")
    args = parser.parse_args()
    try:
        return asyncio.run(run(args))
    except (KeyboardInterrupt, asyncio.CancelledError):
        parser.exit(1, "Elmo check stopped; teardown was requested.\n")
    except ValueError as error:
        parser.exit(1, str(error) + "\n")
    except Exception:
        parser.exit(1, "Check Bluetooth permissions, local dependencies and private output path.\n")


if __name__ == "__main__":
    raise SystemExit(main())
