#!/usr/bin/env python3
"""Serve Sasori locally with an explicitly paired TV/IR companion.

Python standard library only. Run --help for phone access and optional Home Assistant.
"""

import argparse
from http import cookies
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import mimetypes
import os
from pathlib import Path
import ipaddress
import secrets
import socket
import stat
import sys
import tempfile
import threading
import time
from urllib.parse import unquote, urlsplit
import webbrowser

from tv_protocol import HADevice, HTTPTransport, HomeAssistant, HubError, RokuDevice, TV_KEYS, private_ipv4

SITE = Path(__file__).resolve().parents[1] / "site"


def default_config_path():
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "Sasori" / "companion.json"
    if os.name == "nt":
        return Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "Sasori" / "companion.json"
    return Path(os.environ.get("XDG_CONFIG_HOME", str(Path.home() / ".config"))) / "sasori" / "companion.json"


def read_private_config(path):
    path = Path(path)
    try:
        if path.resolve().is_relative_to(SITE.parent.resolve()) or path.is_symlink():
            raise HubError("ha-unavailable")
        if not path.exists():
            return {}
        info = path.stat()
        if info.st_size > 16384 or (os.name != "nt" and stat.S_IMODE(info.st_mode) & 0o077):
            raise HubError("ha-unavailable")
        data = json.loads(path.read_text())
        if not isinstance(data, dict):
            raise ValueError()
        return data
    except (OSError, ValueError):
        raise HubError("ha-unavailable") from None


def write_private_config(path, data):
    path = Path(path)
    if path.resolve().is_relative_to(SITE.parent.resolve()) or path.is_symlink():
        raise HubError("ha-unavailable")
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    if os.name != "nt" and stat.S_IMODE(path.parent.stat().st_mode) & 0o077:
        raise HubError("ha-unavailable")
    descriptor, temporary = tempfile.mkstemp(prefix=".companion-", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w") as stream:
            json.dump(data, stream)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


class Companion:
    def __init__(self, *, transport=None, home_assistant=None, pin=None, clock=time.monotonic, site=SITE, config_path=None):
        self.transport = transport or HTTPTransport()
        self.ha = home_assistant
        self.pin = pin or ("%06d" % secrets.randbelow(1000000))
        self.clock, self.created, self.site = clock, clock(), Path(site).resolve()
        self.sessions, self.attempts, self.connections = {}, {}, {}
        self.lock = threading.RLock()
        self.config_path = Path(config_path) if config_path else None
        self.remembered = bool(self.config_path and self.config_path.exists())

    def configure(self, body):
        client = HomeAssistant(body.get("url", ""), body.get("token", ""), self.transport)
        checked = client.api("")
        if not isinstance(checked, dict) or not isinstance(checked.get("message"), str) or "API running" not in checked["message"]:
            raise HubError("ha-unavailable", 502)
        remember = body.get("remember") is True
        if remember:
            if not self.config_path:
                raise HubError("ha-unavailable")
            write_private_config(self.config_path, {"url": client.base, "token": client._token})
        elif self.config_path and self.config_path.exists():
            read_private_config(self.config_path)
            self.config_path.unlink()
        with self.lock:
            self.ha, self.remembered = client, remember
            self.connections.clear()
        return {"configured": True, "remembered": remember}

    def pair(self, pin, address):
        now = self.clock()
        with self.lock:
            recent = [stamp for stamp in self.attempts.get(address, []) if now - stamp < 300]
            if len(recent) >= 10 or now - self.created > 300:
                raise HubError("pairing-rejected", 429)
            recent.append(now)
            self.attempts[address] = recent
            if not isinstance(pin, str) or len(pin) != 6 or not pin.isascii() or not pin.isdigit() or not secrets.compare_digest(pin, self.pin):
                raise HubError("pairing-rejected", 401)
            # Expired sessions and their leases never survive into a new pairing.
            for key in list(self.sessions):
                if self.sessions[key]["expires"] <= now:
                    self.sessions.pop(key, None)
                    self.connections.pop(key, None)
            if len(self.sessions) >= 8:
                raise HubError("busy", 429)
            sid = secrets.token_hex(32)
            self.sessions[sid] = {"csrf": secrets.token_hex(32), "expires": now + 1800}
            return sid

    def session(self, cookie_header):
        try:
            value = cookies.SimpleCookie(cookie_header or "").get("sasori_session")
            sid = value.value if value else ""
        except cookies.CookieError:
            sid = ""
        with self.lock:
            session = self.sessions.get(sid)
            if not session or session["expires"] <= self.clock():
                raise HubError("pairing-required", 401)
            return sid, session

    def connect(self, sid, body):
        driver, target, device = body.get("driver"), body.get("target"), body.get("device", "sasori-tv")
        if driver == "roku":
            backend = RokuDevice(target, self.transport)
        elif driver in ("ha-media", "ha-remote"):
            backend = HADevice(self.ha, target, remote=driver == "ha-remote", device=device)
        else:
            raise HubError("tv-unsupported")
        nonce = secrets.token_hex(16)
        with self.lock:
            self.connections[sid] = {"nonce": nonce, "busy": True}
        snapshot = backend.read()  # Only metadata is read during connection.
        with self.lock:
            if self.connections.get(sid, {}).get("nonce") != nonce:
                raise HubError("action-unavailable", 409)
            lease = secrets.token_hex(32)
            self.connections[sid] = {"nonce": nonce, "lease": lease, "backend": backend,
                "expires": self.clock() + 300, "busy": False, "commands": []}
        return {**snapshot, "lease": lease, "physicalEffectVerified": False}

    def operation(self, sid, body, kind):
        with self.lock:
            connection = self.connections.get(sid)
            lease = body.get("lease")
            if not connection or not isinstance(lease, str) or not connection.get("lease") or not secrets.compare_digest(lease, connection["lease"]) or connection["expires"] <= self.clock():
                raise HubError("action-unavailable", 409)
            if connection["busy"]:
                raise HubError("busy", 409)
            if kind in ("key", "learn") and body.get("key") not in TV_KEYS:
                raise HubError("action-unavailable")
            recent = [stamp for stamp in connection["commands"] if self.clock() - stamp < 10]
            if kind != "status" and len(recent) >= 20:
                raise HubError("busy", 429)
            if kind != "status":
                recent.append(self.clock())
            connection["commands"] = recent
            connection["busy"] = True
        try:
            if kind == "status":
                return connection["backend"].read()
            if kind == "learn":
                connection["backend"].learn(body["key"])
                return {"learningRequested": True, "physicalEffectVerified": False}
            connection["backend"].send(body["key"])
            return {"requestQueued": True, "physicalEffectVerified": False}
        finally:
            with self.lock:
                connection["busy"] = False


class HubServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, address, app):
        self.app = app
        super().__init__(address, HubHandler)


class HubHandler(BaseHTTPRequestHandler):
    server_version = "SasoriLocal/1"
    sys_version = ""

    def log_message(self, format, *args):
        pass  # No addresses, credentials, request bodies or upstream errors enter logs.

    def setup(self):
        super().setup()
        self.connection.settimeout(10)

    def same_origin(self):
        host = self.headers.get("Host", "")
        try:
            parsed = urlsplit("http://" + host)
            name = parsed.hostname
            valid = parsed.port == self.server.server_port and not parsed.username and not parsed.password and not parsed.path and not parsed.query and not parsed.fragment
            if name not in ("localhost", "127.0.0.1", socket.gethostname().lower(), socket.gethostname().lower() + ".local"):
                private_ipv4(name)
        except (ValueError, TypeError, HubError):
            valid = False
        if not valid:
            raise HubError("local-network-required", 403)
        origin = self.headers.get("Origin")
        if origin and origin.lower() != ("http://" + host).lower():
            raise HubError("pairing-required", 403)

    def headers_common(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")

    def reply(self, status, body, *, content_type="application/json", cookie=None):
        raw = json.dumps(body).encode() if content_type == "application/json" else body
        try:
            self.send_response(status)
            self.headers_common()
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(raw)))
            if cookie:
                self.send_header("Set-Cookie", cookie)
            self.end_headers()
            self.wfile.write(raw)
        except (BrokenPipeError, ConnectionResetError, TimeoutError):
            pass

    def body(self, limit=4096):
        if self.headers.get("Content-Type", "").split(";")[0] != "application/json":
            raise HubError("action-unavailable", 415)
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if size < 2 or size > limit:
                raise ValueError()
            result = json.loads(self.rfile.read(size))
            if not isinstance(result, dict):
                raise ValueError()
            return result
        except (ValueError, TypeError, OSError):
            raise HubError("action-unavailable") from None

    def api(self, method, path):
        if self.headers.get("X-Sasori-Client") != "hub-v1":
            raise HubError("pairing-required", 403)
        app = self.server.app
        can_configure = ipaddress.ip_address(self.client_address[0]).is_loopback and urlsplit("http://" + self.headers.get("Host", "")).hostname in ("localhost", "127.0.0.1")
        if method == "POST" and path == "/api/pair":
            sid = app.pair(self.body().get("pin"), self.client_address[0])
            return self.reply(200, {"paired": True}, cookie="sasori_session=" + sid + "; HttpOnly; SameSite=Strict; Path=/; Max-Age=1800")
        if method == "GET" and path == "/api/bootstrap":
            try:
                _, session = app.session(self.headers.get("Cookie"))
                return self.reply(200, {"paired": True, "csrf": session["csrf"], "homeAssistant": app.ha is not None, "canConfigure": can_configure, "remembered": app.remembered})
            except HubError:
                return self.reply(200, {"paired": False, "homeAssistant": app.ha is not None, "canConfigure": can_configure, "remembered": app.remembered})
        sid, session = app.session(self.headers.get("Cookie"))
        if method == "GET" and path == "/api/tv/entities":
            return self.reply(200, {"entities": app.ha.entities() if app.ha else []})
        if method != "POST" or not secrets.compare_digest(self.headers.get("X-Sasori-CSRF", ""), session["csrf"]):
            raise HubError("pairing-required", 403)
        if path == "/api/ha/configure":
            if not can_configure:
                raise HubError("pairing-required", 403)
            return self.reply(200, app.configure(self.body(16384)))
        body = self.body()
        if path == "/api/tv/connect":
            return self.reply(200, app.connect(sid, body))
        if path in ("/api/tv/key", "/api/tv/status", "/api/tv/learn"):
            return self.reply(200, app.operation(sid, body, path.rsplit("/", 1)[-1]))
        if path == "/api/tv/disconnect":
            with app.lock:
                current = app.connections.get(sid)
                if current and isinstance(body.get("lease"), str) and secrets.compare_digest(body["lease"], current.get("lease", "")):
                    app.connections.pop(sid, None)
            return self.reply(200, {"disconnected": True})
        raise HubError("action-unavailable", 404)

    def handle_request(self, method):
        try:
            self.same_origin()
            value = urlsplit(self.path)
            if value.query or value.fragment:
                raise HubError("action-unavailable", 404)
            if value.path.startswith("/api/"):
                return self.api(method, value.path)
            if method != "GET":
                raise HubError("action-unavailable", 405)
            relative = unquote(value.path).lstrip("/") or "hub.html"
            if "\\" in relative or any(part.startswith(".") for part in relative.split("/")):
                raise HubError("action-unavailable", 404)
            path = (self.server.app.site / relative).resolve()
            if not path.is_relative_to(self.server.app.site) or not path.is_file() or path.suffix not in (".html", ".js", ".mjs", ".css", ".svg", ".json"):
                raise HubError("action-unavailable", 404)
            data = path.read_bytes()
            if relative in ("hub.html", "companion.html"):
                data = data.replace(b'name="sasori-runtime" content="hosted"', b'name="sasori-runtime" content="local-helper"')
            self.reply(200, data, content_type=mimetypes.guess_type(path.name)[0] or "application/octet-stream")
        except HubError as error:
            self.reply(error.status, {"code": error.code})
        except Exception:
            self.reply(500, {"code": "network-error"})

    def do_GET(self):
        self.handle_request("GET")

    def do_POST(self):
        self.handle_request("POST")

    def do_OPTIONS(self):
        self.reply(403, {"code": "pairing-required"})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--listen", default="127.0.0.1", help="Use 0.0.0.0 with --allow-lan for phone access")
    parser.add_argument("--allow-lan", action="store_true")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--ha-url", default="", help="Optional local Home Assistant URL; token comes from SASORI_HA_TOKEN")
    parser.add_argument("--ha-ca", default=None, help="Optional CA certificate for the configured Home Assistant HTTPS server")
    parser.add_argument("--config", type=Path, default=default_config_path(), help="Private optional Home Assistant configuration outside this repository")
    parser.add_argument("--open", action="store_true", help="Open the local hub on this computer")
    args = parser.parse_args()
    if args.listen not in ("127.0.0.1", "0.0.0.0") or (args.listen == "0.0.0.0" and not args.allow_lan) or not 1024 <= args.port <= 65535:
        parser.error("Use loopback, or explicitly choose --listen 0.0.0.0 --allow-lan; port must be 1024–65535.")
    transport = HTTPTransport(args.ha_ca)
    try:
        saved = read_private_config(args.config)
        ha_url = args.ha_url or saved.get("url", "")
        token = os.environ.get("SASORI_HA_TOKEN", "") or saved.get("token", "")
        ha = HomeAssistant(ha_url, token, transport) if ha_url else None
        app = Companion(transport=transport, home_assistant=ha, config_path=args.config)
        server = HubServer((args.listen, args.port), app)
    except HubError as error:
        parser.error(error.code)
    print("Sasori local hub: http://127.0.0.1:%d/hub.html" % args.port)
    if args.allow_lan:
        print("On your phone, use http://<this-computer-LAN-IPv4>:%d/hub.html on the same network." % args.port)
    print("Browser pairing code (valid for 5 minutes): " + app.pin)
    print("Optional Home Assistant setup on this computer: http://127.0.0.1:%d/companion.html" % args.port)
    print("Keep this companion running. Restart it for a new pairing code. Ctrl+C stops it.")
    if args.open:
        webbrowser.open("http://127.0.0.1:%d/hub.html" % args.port)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
