# Inspecting your other animatronic toys

Open **My toys** in Sasori to keep a separate profile for each BLE toy you own or are authorized to inspect. Profiles configure inspection only. They do not unlock authentication, playback, motors, firmware, or arbitrary transmission.

## Start with a sourced UUID

1. Record the toy's model and find a service UUID in manufacturer documentation, attributable research, or your own authorized GATT inspection. The [Elmo UUID capture guide](../experiments/001-elmo-l2l/iphone-uuid-capture-guide.md) explains the evidence to record; other toys require their own actual observations.
2. Enter a toy name, Bluetooth name prefix, full service UUID, and a source note. Leave Notify blank for your first metadata-only inspection. Save the profile.
3. Choose **Load for inspection**. Review the UUIDs, turn off simulation for real hardware, confirm authorization, and start a manual inspection. If the advertising name is unknown, explicitly check **Show all Bluetooth devices**. Sasori grants access only to the one configured service.
4. Stop inspection and open **Protocol explorer**. Observed Notify/Indicate characteristics have **Use for next inspection** buttons. Choosing one updates the next setup and clears consent; it starts no connection or subscription.
5. Return to Overview, confirm authorization again, and run the next inspection. A notification subscription may update the client configuration descriptor; it sends no application command. Keep the page visible and retain a way to stop power if hardware behaves unexpectedly.
6. Use **Save this setup to My toys** to keep an observed endpoint. Its source note links to the session that observed it. Repeat and compare captures before interpreting behavior.

Each connection needs a fresh manual action. Inspections retain the existing 15-second connection budget, operation deadlines, 500-notification cap, and page-background stop. Simulated service maps never offer a live endpoint selector. Labels, source notes, imports, and characteristic properties are evidence claims, not proof that a command is safe or that authentication succeeded.

## Browser permissions and other radios

Web Bluetooth permits access only to services on the origin/device permission allowlist, established through the request's filter services or optionalServices. Its [service access model](https://webbluetoothcg.github.io/web-bluetooth/#allowed-services) is why Sasori asks for a sourced service UUID before inspection. This page cannot promise an unrestricted scan of unknown custom services.

Bluetooth Classic, USB-only, infrared, and proprietary radio toys need separate transport adapters. The current custom profile workflow supports BLE GATT inspection. A lack of notifications does not establish authentication failure, device incompatibility, or a missing protocol.

## Persistence and backups

- Up to 20 custom profiles are saved in this browser's IndexedDB, separately from research sessions. Temporary fallback is labeled if storage cannot open.
- **Export toy profiles** produces a separate versioned JSON file. The import limit is 128 KB. Profile import validates the entire batch, creates fresh IDs, and cannot overwrite an existing toy or session. Unknown command/credential fields are not retained.
- Export profiles as well as session backups. Profiles include Bluetooth name prefixes and source notes; review them before sharing. Nothing synchronizes automatically across devices.
- Deleting a profile requires a second click and preserves its capture sessions. Session titles retain the toy name even if the profile is later renamed or removed.
- The storage upgrade preserves existing records/settings and does not replay old migration data. Older open Sasori tabs may need reloading after the upgrade. Browser storage can still be evicted; keep backups.

The built-in Elmo candidate UUIDs and probe presets remain available. UUIDs and protocol operations from Elmo must not be copied to another toy as compatibility evidence.
