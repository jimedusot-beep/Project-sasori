# Furby Connect and Bluetooth identification

An experimental **Furby Connect (2016)** adapter is implemented in the Device Hub and Universal controls. Other Furby generations use different protocols. Software fixtures test the implementation; Sasori has not tested a physical Furby Connect.

## Identify, then connect

1. Open the [Device Hub](https://jimedusot-beep.github.io/Project-sasori/hub.html) in **Bluefy on iPhone/iPad**, or another compatible Web Bluetooth browser. Ordinary Safari can use demos but cannot provide this Bluetooth path.
2. Tap **Identify a Bluetooth toy**, then select your device in the chooser.
3. Sasori checks its fixed list of known Elmo, Furby Connect, original MiP and standard BLE services and characteristics. It does not read characteristic values, subscribe to notifications or send toy commands. It disconnects before showing results.
4. Choose **Use …** for a matching adapter. Confirm your actual model; names are not used for matching, and UUIDs do not authenticate a device. Multiple matches remain separate choices.
5. Press **Connect** to reconnect using that device reference. Browser permission changes can require a new chooser. Elmo still needs its existing password or explicitly selected unset-password setup.

The chooser has a 40-second deadline. After selection, connection and inventory have a combined 20-second deadline, with eight seconds per operation. Cancel identification, Stop, page hiding and connection loss cancel pending work. Late results cannot select an adapter. No match means that no supported combination was observed; ungranted services or other proprietary protocols can still exist.

Identification does not save a setup or start controls. A normal Connect uses the existing saved-setup workflow. Portable backups omit platform identifiers.

## Furby controls

1. Select **Furby Connect**, or select it from identification results. **Try offline demo** works without hardware.
2. For live use, wake your 2016 Furby Connect, close other apps connected to it and tap Connect. This adapter has no password entry.
3. **Identify** requests the GeneralPlus firmware version. Its two-byte reply is shown as a version byte, not an invented semantic version or hardware revision.
4. **Read status** requests the documented presence message. Sasori accepts its expected 19-byte frame; the 18 payload bytes remain undecoded. It does not infer battery, mood or sensor state from them.
5. **Blue antenna light** requests RGB `0, 0, 32`, followed by RGB `0, 0, 0` after 1.5 seconds. Confirm the physical effect. Queuing either write does not prove that the LED changed.
6. **Stop & disconnect** ends the session and attempts LED-off cleanup if an effect is pending. Check the light yourself after failures or radio loss. Disconnect does not stop Furby's independent behavior.
7. Save a named setup, reconnect manually, or build routines from Identify, Status, the light and waits. Existing limits apply: five-minute connections; 32 steps/two minutes per routine; foreground operation, cancellation and private receipts.

The native iPhone app's reviewed write bridge does not implement Furby controls. Use the browser path above for live Furby access. The native interface offers the demo and explains this limit; unsupported native control requests are rejected before calling the plugin.

## Sources and reuse

Reviewed October 24, 2026. Protocol facts were checked against **Jeija/bluefluff**, pinned commit `9e865c47326167c2d4e6f47d96321e8e5cfc0e32`:

| Source                                                                                                                              | Used in Sasori                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| [Bluetooth GATT inventory](https://github.com/Jeija/bluefluff/blob/9e865c47326167c2d4e6f47d96321e8e5cfc0e32/doc/bluetooth.md)       | Exact service and GeneralPlus channels; binary frames up to 20 bytes                            |
| [GeneralPlus commands/replies](https://github.com/Jeija/bluefluff/blob/9e865c47326167c2d4e6f47d96321e8e5cfc0e32/doc/generalplus.md) | `fe` firmware query/reply; `20 06` presence query and `22` reply; `14 R G B` antenna color      |
| [Transport implementation](https://github.com/Jeija/bluefluff/blob/9e865c47326167c2d4e6f47d96321e8e5cfc0e32/fluffd/fluffcon.js)     | Channel-routing and write-without-response cross-check; no idle loop imported                   |
| [MIT license](https://github.com/Jeija/bluefluff/blob/9e865c47326167c2d4e6f47d96321e8e5cfc0e32/LICENSE.md)                          | Reviewed; facts attributed; no upstream implementation, graphics, audio, DLC or firmware copied |

Furby's service ends in **`3bde`**, while Elmo's ends in **`3bdf`**. The adapter uses only Furby's exact GeneralPlus notification/write pair. Advertised write-without-response is preferred; advertised write-with-response is a fallback. No deprecated generic write method is used.

Replies require exact opcodes/lengths and a corresponding pending query on the active connection. This subset has no transaction nonce: matching is not authentication or independently proven freshness. Unrelated or malformed replies do not complete a query. Timeout disconnects and requires a fresh connection.

Movement sequences, speech, mood/name changes, Nordic commands, files/DLC, debug menus, firmware updates and background keepalive are not implemented. Physical-effect, authentication and hardware-verification flags remain false, including after successful synthetic tests.

## Physical acceptance

Record your exact model/firmware and private live results. Check firmware and presence replies, light followed by off, cancellation, hiding the page, disconnect and recovery. Repeat with fresh connections and keep observed effects separate from queued commands. Source-reported results and service matches do not count as Sasori hardware tests.

Implementation: [codec](../site/lib/furby-codec.js), [runner](../site/lib/furby-controls.js), [matcher](../site/lib/supported-devices.js), [probe](../site/lib/known-device-probe.js). Regressions: [adapter](../tests/furby-controls.test.mjs), [recognition](../tests/supported-devices.test.mjs), [browser/phone](../tests/browser/furby.spec.js).
