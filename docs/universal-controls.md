# Universal controls and saved connections

Open [Universal controls](https://jimedusot-beep.github.io/Project-sasori/#universal). The shared command vocabulary is **Connect, Identify, Status, Find / alert, Stop**. A device exposing a supported Bluetooth SIG service uses the same UI and runner without entering its UUIDs or writing a new toy-specific decoder. This is capability-based interoperability, not a universal authentication or firmware-unlock command.

## Use it

1. Press **Connect device**, select your own or authorized BLE device, and inspect the available controls. Discovery alone sends no application command or notification subscription.
2. **Identify** reads available manufacturer/model/hardware/firmware/software strings. **Status** reads standard battery percentage. An absent service leaves its action unavailable and does not prevent other standard services from being used.
3. **Find / alert** is enabled only for an observed Immediate Alert service with its Alert Level characteristic and Write Without Response property. The explicit button requests **mild alert**, followed by **no alert** after 1.5 seconds. The effect is defined by the device and can include light, sound, or movement. This write has no application acknowledgment; queued bytes do not prove a physical effect. High alert is not offered.
4. **Stop & disconnect**, global Stop, backgrounding, a failed operation deadline, or five minutes of connection time ends the session. Stop does not wait for a hung read/write. A conforming Immediate Alert service stops on link disconnection, but the app cannot independently confirm that a particular product obeys the standard. Check the device if it remains active.
5. The chosen device setup saves locally after connection. **Reconnect saved device** reuses a granted Web Bluetooth reference when the browser supplies it, or a retrieved Core Bluetooth peripheral when available. Otherwise a chooser is required. Reconnection always starts with a button press; there is no reconnect loop or automatic replay of actions.

After disconnection, read results remain visible as retained results and command capabilities are cleared. A fresh connection rediscovers available services; saved metadata and names cannot enable a command. Connection failure keeps the saved setup. **Choose another device** opens a chooser while retaining existing setups. Devices' **Open shared controls** copies its label/name filter into this workspace; its custom UUIDs are not assumed to be standard commands.

The **offline demo** runs the identical runner against a synthetic desk gadget. It makes no Bluetooth call, saves no real binding, and labels its results and alert animation DEMO. Browser/native fixture tests likewise do not prove a real device's response.

## Shared intents and exact implementation

| Intent       | Adapter mapping                                                                                                   | Limits                                                                                                      |
| ------------ | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Connect      | Request only Device Information `180A`, Battery `180F`, Immediate Alert `1802`; discover observed characteristics | User selected device, 40-second chooser, 8-second operations, five-minute connection ceiling                |
| Identify     | DIS read fields `2A29`, `2A24`, `2A27`, `2A26`, `2A28`                                                            | UTF-8, 512 bytes / 160 characters per string; serial/System ID excluded                                     |
| Status       | Battery Level `2A19` under Battery Service `180F`                                                                 | One unsigned byte, 0–100; first selected service instance, not a combined multi-battery estimate            |
| Find / alert | Alert Level `2A06` under Immediate Alert `1802`, Write Without Response                                           | Only byte `01` (mild), then `00` (none); never inferred from a same-named characteristic in another service |
| Stop         | Cancel pending work, invalidate callbacks/timers/capabilities, disconnect                                         | Retain the setup; no assumption of a device-specific motor stop or firmware command                         |

Full assigned UUIDs expand as `0000xxxx-0000-1000-8000-00805f9b34fb`. `site/lib/standard-controls.js` owns the shared adapter metadata, decoder and session/intent runner. `site/controls-ui.js` supplies the shared workspace. `site/lib/control-setups.js` validates saved setup data. Device-specific playback, motion, authentication, TV/network/infrared commands and firmware operations are not mapped to these bytes. Elmo's custom protocol remains subject to its [existing source gaps](../experiments/001-elmo-l2l/source-verification.md).

The original inspection transport and its selected-service restriction remain separate. Its Elmo/custom toy command paths remain blocked. The native facade adds a fixed standard-control mode; the Swift plugin independently validates service/characteristic pairs, read permissions, and alert levels. It has no generic characteristic-write method. The native alert additionally has an independent two-second no-alert timer and a five-minute watchdog. A backed-up setup cannot install an adapter or extend either allowlist.

## Persistence, backup and privacy

Up to 20 saved standard-control setups use a separate `standard-controls` key in IndexedDB v4's existing settings store. Inspection preferences, toy profiles, research records and the database version are preserved. Writes compare a stored revision within one read/write transaction, so a stale window is rejected instead of overwriting newer setups. In-memory fallback is explicitly temporary.

A setup contains a local label, optional name filter, reviewed adapter ID and private platform device reference. The reference is kept locally to reconnect the same selected device. **Export setups** omits these references, and imported setups get new IDs and require local device selection. Names/name filters can still identify a device; review a backup before sharing. The control-setup backup is separate from the existing inspection-profile and research-record backups. Malformed, duplicate, unsupported-adapter or excessive batches reject atomically; credentials, arbitrary commands and claimed capabilities are discarded.

**Export result** contains only current/retained model and battery observations with source class and false authentication/physical-effect verification fields. It omits platform identifiers and packet bytes, is not an executable adapter or session import, and does not certify hardware acceptance.

## Primary protocol sources and reuse

- [Bluetooth SIG Device Information 1.2](https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/DIS_v1.2/out/en/index-en.html): standard identity field meanings.
- [Bluetooth SIG Battery Service 1.1](https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/BAS_v1.1/out/en/index-en.html), section 3.1: battery value range and read behavior.
- [Bluetooth SIG Immediate Alert 1.0](https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/IAS_v1.0/out/en/index-en.html), sections 3–4: Write Without Response, effect depends on device, termination conditions.
- [Bluetooth SIG Assigned Numbers](https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/Assigned_Numbers/out/en/index-en.html): service and characteristic identifiers.
- [Silicon Labs Find Me example documentation](https://community.silabs.com/s/article/find-me-profile-fmp-example-code-and-demo-setup): numeric levels 0 = none, 1 = mild, 2 = high; Sasori implements only 0 and 1.

Reviewed October 23, 2026 (America/New_York). Facts are attributed; implementation is original. No upstream source, firmware, assets or proprietary commands are copied. These references document standards; compatibility and physical effects require real-unit testing. Home Assistant's capability-oriented integrations continue to inform the [adapter architecture](research/adapter-inspirations.md).
