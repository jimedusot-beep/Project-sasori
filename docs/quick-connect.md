# Quick connections for your toys

Open [Sasori](https://jimedusot-beep.github.io/Project-sasori/) and choose a quick setup. Setup buttons configure the next connection; they never start a scan or reconnect by themselves.

## Love2Learn Elmo

1. Tap **Love2Learn Elmo**. Its published service settings are included; the first attempt uses **Find connection details**, without a notification subscription.
2. Turn on the toy, close another app connected to it, confirm ownership, and tap **Connect & inspect**.
3. When connection details appear, tap **Stop** or wait for the 15-second deadline. The result lists the channels actually observed on this unit.
4. Tap **Capture from …** for an observed channel. Confirm ownership and connect again to collect notifications for up to 15 seconds. Selecting a channel does not connect automatically.
5. Use **Save device setup** to keep this configuration, or **Export connection report** for a portable metadata report. A newly selected observed channel is included when preparing the saved setup.

For model/revision information, choose **Read model & firmware** before a separate connection. A device-reported model number can differ from the product name printed on the toy; keep the exact product identity in your profile. Reading identification fields does not change that declared identity or establish successful authentication.

## Another Bluetooth toy

1. Tap **Another Bluetooth toy**.
2. Enter its advertised Bluetooth name prefix. If unknown, explicitly choose **Show all Bluetooth devices** and select your own nearby device in the chooser.
3. Confirm ownership and connect. No UUID entry is needed for this identification attempt.
4. Sasori reads available manufacturer, model, hardware, firmware, and software strings from the standard Device Information service, then disconnects as soon as reads finish. Missing or unreadable fields remain unknown. Not every device exposes this service.
5. Tap **Save device setup**. Review the reported model/revision fields and choose a friendly device name before saving. For an unknown toy, this saves an identification profile; its proprietary control service still requires a documented profile or your own observed GATT map.

The implementation follows the Bluetooth SIG's [Device Information Service](https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/DIS_v1.2/out/en/index-en.html) and [assigned UUIDs](https://www.bluetooth.com/specifications/assigned-numbers/). Only five model/revision strings are read. Serial Number, System ID, Bluetooth addresses, and firmware update interfaces are excluded. Each string is limited to 512 incoming bytes / 160 text characters; malformed UTF-8 is discarded. Reads are sequential, bounded by the existing operation and session deadlines, and late results cannot survive cancellation.

## Returning to a saved device

Open **My devices**, choose **Load for inspection**, confirm ownership, and connect. Stored profiles provide settings, not an active connection. The last selected built-in setup and its current name/service/notification settings are remembered; custom saved profiles remain authoritative when reloaded. Ownership consent and Show all devices are reset. No scan starts on load or reload.

The result card distinguishes a completed metadata inspection, an identification read, silent notifications, a cancelled chooser, an early disconnect, and a failed connection. A successful metadata inspection does not require notification packets. Reports preserve device-reported fields in the optional `deviceInformation` session-v2 field, including metadata-only backups. Imported and simulated records remain labeled; they cannot supply a live channel shortcut or establish hardware verification.

On iPhone/iPad use Bluefy or a built native Sasori app. On Mac/Windows use a compatible Chrome installation or the [desktop helper](../desktop/README.md). The native app implements the same bounded identity reads. The original desktop helper handles inspection/notifications; a separate experimental Elmo client provides the known-password check below. Browsers expose only the service granted for each attempt. Bluetooth Classic, USB-only, infrared, and proprietary radio toys require another transport.

## Moving from connection to control

Sasori has shared standard BLE controls, a source-backed MiP version/status/LED adapter, and a separate [experimental desktop Elmo client](../desktop/README.md#experimental-elmo-known-password-check). For Elmo, privately enter the toy's known password to attempt authentication, request input/volume state, and optionally request one greeting. The browser/native Elmo path remains inspection-only. Real-unit authentication, physical behavior and recovery remain unverified; record exact model/firmware and observed results before expanding controls.

Software fixtures and iOS simulator builds verify the implementation, not a physical toy. Real radio behavior and model-specific compatibility need a capture from your unit.
