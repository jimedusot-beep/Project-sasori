"""Original, bounded local-TV mappings from cited Roku and Home Assistant APIs.

No discovery scan, arbitrary URL proxy, firmware operation, or raw IR/RF sender.
"""

import ipaddress
import json
import socket
import ssl
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

TV_KEYS = (
    "home", "back", "up", "down", "left", "right", "select", "volume-up",
    "volume-down", "mute", "play", "previous", "next", "power-on", "power-off",
)
PRIVATE_NETWORKS = tuple(ipaddress.ip_network(value) for value in (
    "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16",
))


class HubError(Exception):
    def __init__(self, code, status=400):
        super().__init__(code)
        self.code = code
        self.status = status


class TransportError(Exception):
    def __init__(self, status=0):
        super().__init__("upstream-request-failed")
        self.status = status


def private_ipv4(value):
    try:
        address = ipaddress.IPv4Address(value)
    except (ValueError, TypeError):
        raise HubError("local-network-required") from None
    if not any(address in network for network in PRIVATE_NETWORKS):
        raise HubError("local-network-required")
    return str(address)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise TransportError(code)


class HTTPTransport:
    def __init__(self, ca_file=None):
        context = ssl.create_default_context(cafile=ca_file)
        self.opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({}), NoRedirect(),
            urllib.request.HTTPSHandler(context=context),
        )

    def request(self, method, url, *, payload=None, headers=None, timeout=5, limit=32768):
        data = None if payload is None else json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(url, data=data, method=method,
            headers={**({"Content-Type": "application/json"} if data is not None else {}), **(headers or {})})
        try:
            with self.opener.open(request, timeout=timeout) as response:
                body = response.read(limit + 1)
                if len(body) > limit:
                    raise TransportError()
                return body
        except urllib.error.HTTPError as error:
            raise TransportError(error.code) from None
        except (OSError, ValueError, urllib.error.URLError):
            raise TransportError() from None


class RokuDevice:
    KEY_MAP = {
        "home": "Home", "back": "Back", "up": "Up", "down": "Down", "left": "Left",
        "right": "Right", "select": "Select", "play": "Play", "previous": "Rev", "next": "Fwd",
        "volume-up": "VolumeUp", "volume-down": "VolumeDown", "mute": "VolumeMute", "power-off": "PowerOff",
    }

    def __init__(self, host, transport):
        self.base = "http://" + private_ipv4(host) + ":8060"
        self.transport = transport
        self.keys = []
        self.information = {}
        self.learn_available = False

    def read(self):
        try:
            body = self.transport.request("GET", self.base + "/query/device-info")
        except TransportError as error:
            raise HubError("tv-control-disabled" if error.status in (401, 403) else "tv-unreachable", 502) from None
        if len(body) > 32768 or b"<!DOCTYPE" in body.upper() or b"<!ENTITY" in body.upper():
            raise HubError("tv-unsupported", 502)
        try:
            root = ET.fromstring(body)
        except ET.ParseError:
            raise HubError("tv-unsupported", 502) from None
        if root.tag != "device-info" or root.findtext("vendor-name", "").lower() != "roku":
            raise HubError("tv-unsupported", 502)
        self.information = {
            "label": root.findtext("user-device-name", "Roku"),
            "model": root.findtext("model-name", "Roku"),
            "firmware": root.findtext("software-version", "unknown"),
            "state": root.findtext("power-mode", "unknown"),
        }
        is_tv = root.findtext("is-tv", "false").lower() == "true"
        volume = is_tv or root.findtext("supports-audio-volume-control", "false").lower() == "true"
        power = is_tv or root.findtext("supports-tv-power-control", "false").lower() == "true"
        self.keys = [key for key in self.KEY_MAP if
            (key not in ("volume-up", "volume-down", "mute") or volume) and (key != "power-off" or power)]
        return self.snapshot()

    def snapshot(self):
        return {"keys": self.keys, "information": {key: str(value)[:160] for key, value in self.information.items()}, "learnAvailable": False}

    def send(self, key):
        if key not in self.keys:
            raise HubError("action-unavailable")
        try:
            self.transport.request("POST", self.base + "/keypress/" + self.KEY_MAP[key], payload=None,
                headers={"Content-Length": "0"})
        except TransportError as error:
            raise HubError("tv-control-disabled" if error.status in (400, 401, 403) else "tv-unreachable", 502) from None

    def learn(self, key):
        raise HubError("action-unavailable")


class HomeAssistant:
    def __init__(self, base_url, token, transport):
        import re
        value = urllib.parse.urlsplit(base_url)
        if value.scheme not in ("http", "https") or value.username or value.password or value.query or value.fragment:
            raise HubError("local-network-required")
        if not value.hostname or not isinstance(token, str) or not re.fullmatch(r'[A-Za-z0-9_.-]{16,8192}', token):
            raise HubError("ha-unauthorized")
        # Tokens enter only through companion-owner configuration, including the loopback-only setup page.
        self.host = value.hostname
        self.base = base_url.rstrip("/")
        self._token = token
        self.transport = transport
        self.check_local()

    def check_local(self):
        if self.host == "localhost":
            return
        try:
            address = ipaddress.ip_address(self.host)
            if address.is_loopback or (isinstance(address, ipaddress.IPv4Address) and any(address in n for n in PRIVATE_NETWORKS)):
                return
            raise HubError("local-network-required")
        except ValueError:
            if not self.host.endswith(".local"):
                raise HubError("local-network-required") from None
            try:
                addresses = socket.getaddrinfo(self.host, None, family=socket.AF_INET)
            except OSError:
                raise HubError("ha-unavailable", 502) from None
            if not addresses or any(not any(ipaddress.ip_address(item[4][0]) in n for n in PRIVATE_NETWORKS) for item in addresses):
                raise HubError("local-network-required")

    def api(self, path, payload=None, timeout=5, limit=32768):
        self.check_local()
        try:
            body = self.transport.request("GET" if payload is None else "POST", self.base + "/api/" + path,
                payload=payload, headers={"Authorization": "Bearer " + self._token}, timeout=timeout, limit=limit)
            return json.loads(body)
        except TransportError as error:
            raise HubError("ha-unauthorized" if error.status in (401, 403) else "ha-unavailable", 502) from None
        except (ValueError, TypeError):
            raise HubError("ha-unavailable", 502) from None

    def entity(self, entity_id):
        import re
        if not isinstance(entity_id, str) or not re.fullmatch(r"(?:media_player|remote)\.[a-z0-9_]{1,120}", entity_id):
            raise HubError("tv-unsupported")
        data = self.api("states/" + entity_id)
        if not isinstance(data, dict) or data.get("entity_id") != entity_id or not isinstance(data.get("attributes"), dict):
            raise HubError("tv-unsupported", 502)
        return data

    def entities(self):
        data = self.api("states", limit=1048576)
        if not isinstance(data, list):
            raise HubError("ha-unavailable", 502)
        return [{"id": row["entity_id"], "name": str(row.get("attributes", {}).get("friendly_name", row["entity_id"]))[:100]}
            for row in data if isinstance(row, dict) and isinstance(row.get("entity_id"), str)
            and isinstance(row.get("attributes", {}), dict)
            and row["entity_id"].startswith(("media_player.", "remote."))][:100]


class HADevice:
    def __init__(self, client, entity_id, *, remote=False, device="sasori-tv"):
        import re
        if not client:
            raise HubError("ha-unavailable", 503)
        if not isinstance(device, str) or not re.fullmatch(r"[a-zA-Z0-9_-]{1,60}", device):
            raise HubError("tv-unsupported")
        if not isinstance(entity_id, str) or not entity_id.startswith("remote." if remote else "media_player."):
            raise HubError("tv-unsupported")
        self.client, self.entity_id, self.remote, self.device = client, entity_id, remote, device
        self.keys, self.information, self.attrs, self.state = [], {}, {}, "unknown"
        self.learn_available = False

    def read(self):
        data = self.client.entity(self.entity_id)
        self.state, self.attrs = data.get("state", "unknown"), data["attributes"]
        features = self.attrs.get("supported_features", 0)
        if not isinstance(features, int) or isinstance(features, bool) or features < 0 or features > 0x7FFFFFFF:
            features = 0
        self.information = {"label": str(self.attrs.get("friendly_name", "My TV"))[:100],
            "model": "Home Assistant learned IR remote" if self.remote else "Home Assistant media player", "state": str(self.state)[:80]}
        self.keys = []
        self.learn_available = False
        if self.state not in ("unavailable", "unknown"):
            if self.remote:
                self.keys = list(TV_KEYS)
                self.learn_available = bool(features & 1)
            else:
                if features & (4 | 1024):
                    self.keys.extend(("volume-up", "volume-down"))
                if features & 8 and isinstance(self.attrs.get("is_volume_muted"), bool):
                    self.keys.append("mute")
                for key, bit in (("previous", 16), ("next", 32), ("power-on", 128), ("power-off", 256)):
                    if features & bit:
                        self.keys.append(key)
                if (self.state == "playing" and features & 1) or (self.state != "playing" and features & 16384):
                    self.keys.append("play")
        return self.snapshot()

    def snapshot(self):
        return {"keys": self.keys, "information": self.information, "learnAvailable": self.learn_available}

    def send(self, key):
        self.read()
        if key not in self.keys:
            raise HubError("action-unavailable")
        data = {"entity_id": self.entity_id}
        if self.remote:
            service = "remote/send_command"
            data.update(device=self.device, command=[key], num_repeats=1)
        else:
            services = {"volume-up": "volume_up", "volume-down": "volume_down", "mute": "volume_mute",
                "previous": "media_previous_track", "next": "media_next_track", "power-on": "turn_on", "power-off": "turn_off"}
            service = "media_player/" + ("media_pause" if self.state == "playing" else "media_play") if key == "play" else "media_player/" + services[key]
            if key == "mute":
                data["is_volume_muted"] = not self.attrs["is_volume_muted"]
        self.client.api("services/" + service, data)

    def learn(self, key):
        self.read()
        if not self.remote or not self.learn_available or key not in TV_KEYS:
            raise HubError("action-unavailable")
        self.client.api("services/remote/learn_command", {"entity_id": self.entity_id,
            "device": self.device, "command": [key], "command_type": "ir", "alternative": True}, timeout=30)
