# TV and universal remote: complete setup

Sasori uses one remote layout for three implemented connection methods: Roku's local network API, configured Home Assistant media players, and Home Assistant learned infrared remotes. Select a setup once, then reuse its buttons and routines. Physical responses still need testing on your devices.

## What you need

- A computer on the same private network as your phone and TV, with **Python 3.9 or later**. The TV companion uses Python's standard library; it does not need Bleak, npm, a build or a cloud account.
- For Roku: the Roku's local IPv4 address and its remote-control setting enabled.
- For other supported media devices: an existing local Home Assistant installation with that device configured.
- For an ordinary infrared remote: a Home Assistant-compatible IR hub, such as a supported Broadlink RM model, and the original remote to teach it. The phone alone cannot send IR. RF learning and Bluetooth remote impersonation are not implemented.

Use your home/trusted private network. The phone-to-companion default is local HTTP with explicit browser pairing; it is not an internet-facing service. Do not port-forward it. Guest/hotel Wi-Fi client isolation can prevent this connection.

## 1. Start the companion on your computer

1. Open the [Project Sasori repository](https://github.com/jimedusot-beep/Project-sasori), select **Code → Download ZIP**, then unzip it. Keep the whole folder; the companion serves files from its `site` directory.
2. If Python is not installed, install Python 3 from [python.org](https://www.python.org/downloads/). On Windows, the Python launcher `py` can be used below.
3. Open Terminal (macOS/Linux) or PowerShell (Windows), change into the unzipped Project-sasori folder, then run:

   ```sh
   python3 desktop/sasori_hub.py --listen 0.0.0.0 --allow-lan --open
   ```

   On Windows:

   ```powershell
   py -3 desktop/sasori_hub.py --listen 0.0.0.0 --allow-lan --open
   ```

   On macOS, `desktop/Start-Sasori.command` is also a convenience launcher when executable. If a ZIP download removed that permission, use the Terminal command above.

4. Leave this window running. It prints the local hub URL, a six-digit pairing code and the optional Home Assistant setup link. The code is valid for five minutes. Restart the companion for a new code; do not share the code publicly.
5. Find your computer's LAN IPv4 address in its Wi-Fi/network settings, for example `192.168.1.20`. If the OS firewall asks, permit Python on your private network for phone access. You can test only on the computer with `python3 desktop/sasori_hub.py --open`, which listens on loopback by default.

If port 8765 is occupied, add `--port 8766` and use that port in every URL below. Ctrl+C stops the companion. Changing the port or computer address creates a different browser storage origin.

## 2. Open it from your phone

1. Connect the phone to the same Wi-Fi network.
2. Open `http://YOUR-COMPUTER-IP:8765/hub.html`, replacing `YOUR-COMPUTER-IP` with the address you found. **Use your computer's address, not `127.0.0.1` on the phone.** You can also enter the address in the hosted hub's TV card and tap **Open local TV hub**.
3. Select **TV & universal remote**. The locally served page shows the connection-method fields. The public GitHub Pages version shows companion directions instead of attempting cross-origin TV requests.
4. Follow one connection method below. Enter the six-digit companion code in **Companion pairing code** before the first connection or device-list request. It clears immediately after use. A paired browser session lasts 30 minutes; a device-control connection lasts five minutes. Reconnect manually when it expires. An expired pairing needs a fresh companion code.

TV controls work in the locally served phone page without Web Bluetooth. For Bluetooth toys, open the hosted HTTPS hub separately in a compatible Bluetooth browser; a LAN HTTP page usually cannot use browser Bluetooth.

## 3A. Roku local network

1. On Roku, open **Settings → Network → About** and note its IP address.
2. Check **Settings → System → Advanced system settings → Control by mobile apps** and enable network control. Roku documents this requirement for keypress commands from Roku OS 14.1. No developer-mode operation is used by Sasori.
3. In the local Sasori hub select **Roku local network**, enter that private IPv4 address, give the setup a label, enter the companion pairing code if needed and tap **Connect device**.
4. Connection reads device metadata only. Try **OK**, a direction or **Volume −**, then observe your Roku/TV. Home, Back, direction, selection, play/pause and rewind/forward use fixed ECP keypress mappings. Volume/mute and power-off enable only for a Roku TV or reported supported capabilities. **Power on** stays disabled for this adapter.
5. **Read status** refreshes metadata. Mark the observed effect, then **Stop & disconnect → Save connection result**. The setup is saved locally for the next manual connection.

If metadata connects but buttons fail, check the Roku remote-control setting and its current firmware. A Roku player may control navigation while having no TV-volume capability. A sleeping/offline TV may not answer at all. Sasori does not bypass its permissions.

## 3B. Home Assistant media players

Complete this optional configuration **on the companion computer**:

1. Configure your TV, speaker or projector in Home Assistant first. Sasori reuses the existing integration's capabilities; it does not install or pair that integration for you.
2. In your Home Assistant user profile, open the security section and create a long-lived access token. Keep it private. See the [official REST API directions](https://contributors.home-assistant.io/core/internals/rest-api/).
3. Open `http://127.0.0.1:8765/companion.html` on the companion computer. This configuration screen permits entry only through loopback. The hosted page and phone/LAN access keep credential fields disabled.
4. Enter the companion code, local Home Assistant URL (for example `http://192.168.1.10:8123`) and token. Tap **Save and check connection**. The code/token clear from the fields. The companion checks the API; the token stays server-side and never enters phone setups or reports.
5. Optional **Remember on this computer** writes the URL/token to a private, unencrypted configuration file outside the repository. It is off by default. Without it, settings last until the companion stops. Saving again with it unchecked removes the previous remembered file. On macOS the file is `~/Library/Application Support/Sasori/companion.json`; on Linux it is `$XDG_CONFIG_HOME/sasori/companion.json` or `~/.config/sasori/companion.json`; on Windows it is `%LOCALAPPDATA%/Sasori/companion.json`. Existing TV leases are invalidated when configuration changes.
6. On your phone return to the local hub, select **Home Assistant media player**, enter the pairing code if needed, then tap **List configured Home Assistant devices**. Choose the configured `media_player` entity, or enter its exact entity ID manually.
7. Tap **Connect device**. Only reported supported volume up/down, mute, play/pause, previous/next and power operations enable. Generic Home/Back/directional navigation is unavailable through the media-player adapter. Check the physical effect yourself.

The token uses your Home Assistant account's permissions. Sasori's API exposes fixed media-player and learned-remote operations, not an arbitrary Home Assistant service proxy. Public Home Assistant hosts are refused; use a local address. HTTPS validates certificates. A private CA can be supplied with `--ha-ca /path/to/ca.pem`; certificate validation cannot be disabled in the app. Optional CLI configuration uses `--ha-url` and the `SASORI_HA_TOKEN` environment variable; do not put tokens in command arguments or commit them.

## 3C. Learn an infrared remote

1. Install and configure a supported IR hub in Home Assistant. Broadlink's initial Wi-Fi setup uses the manufacturer's app; then add the **Broadlink** integration in Home Assistant. Keep the hub in line of sight of the controlled device.
2. Finish the companion's Home Assistant setup above.
3. On the phone choose **Home Assistant learned IR remote**. Select the configured `remote` entity, give **Learned IR device label** a stable simple name such as `livingroom-tv`, then connect.
4. Expand **Learn a button from my original IR remote**. Choose a semantic button, such as Volume −, and tap **Start IR learning**. When the physical hub signals learning mode, point the original remote at it and press the corresponding button. Allow up to 30 seconds. A request finishing does not independently prove a useful code was captured.
5. Press that button in Sasori and observe the device. Repeat learning for the buttons you need. Home Assistant stores the codes under the same device label and semantic command name. Keep the label consistent on later connections.
6. Unlearned buttons can fail even when enabled: a remote entity does not report which names have useful learned codes. Use actual device feedback to confirm each one. A toggle power code cannot establish separate on/off semantics or actual device state; do not assume a button label makes a discrete power command.

Learning is **IR only**. No raw-code upload, RF learning, rolling-code replay, universal pairing bypass or firmware change is exposed. Other IR-controlled small devices can reuse this layout when the learned button meaning fits. For interfaces beyond these fixed actions, add a reviewed adapter.

## Routines and failures

Use **Create or edit a routine → Load starter routine → Save routine** for “Volume down twice.” Connect a device that supports volume-down, choose the routine and tap **Run routine**. It sends two separate volume-down requests half a second apart. Routines have a 20-second runtime limit and never auto-run; see the [hub guide](device-hub.md#save-and-run-a-routine).

Stop, Cancel or page hiding stops pending browser steps and revokes the connection lease where reachable. A command already accepted by the TV/IR hub cannot be undone. If the page cannot open, check the helper process, Wi-Fi isolation, correct computer address/port and private-network firewall permission. If pairing expires, restart the companion and use the new code. If a device rejects control, its failure card points to the matching permission, capability or connection check.

## Sources and implementation

Reviewed October 24, 2026. Original Sasori implementations use factual API mappings; no upstream runtime, media, IR code database or firmware is copied.

- [Roku External Control Protocol](https://developer.roku.com/dev/docs/external-control-api): port 8060, device-info fields, keypress names, OS 14.1 remote-control setting and Roku OS 15 TV-volume/power capability flags. Its page also states restrictions on third-party-platform ECP use. This experimental owner-local companion does not establish vendor approval or commercial distribution permission.
- [Home Assistant REST API](https://contributors.home-assistant.io/core/internals/rest-api/): bearer authentication, state reads and fixed service calls.
- [Home Assistant media-player source](https://github.com/home-assistant/core/blob/2026.10.3/homeassistant/components/media_player/const.py): declared feature bits. Sasori enables operations only from the reported feature/state subset.
- [Home Assistant remote source](https://github.com/home-assistant/core/blob/2026.10.3/homeassistant/components/remote/const.py) and [Broadlink integration](https://www.home-assistant.io/integrations/broadlink/): learn/send semantic names, `command_type: ir`, alternative-code learning and configured hardware.

`desktop/tv_protocol.py` contains transport mappings; `desktop/sasori_hub.py` provides explicit LAN opt-in, same-origin browser pairing, CSRF checks, fixed API paths, private target validation, bounded requests and expiring leases. No scan runs automatically. `site/lib/tv-remote.js` calls only relative companion API paths and ignores upstream hardware-verification claims. Python tests use fake upstreams and loopback HTTP; browser tests use synthetic API responses. They do not access a real TV or IR hub.
