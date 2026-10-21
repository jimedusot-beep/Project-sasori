# Identify Elmo's BLE UUIDs from an iPhone without sending commands

Goal: obtain three exact identifiers: the custom service UUID, the notify characteristic UUID, and the write-without-response characteristic UUID. The Project Sasori read-only page currently requires only the first two. Document all three for future authorized research, but do not write to any characteristic.

## Before starting
1. The physical toy must be on, stable and positioned so moving parts cannot snag cables or fingers.
2. Close Bluefy and disconnect its existing session first.
3. Open nRF Connect for Mobile on the iPhone.
4. The official reference for scanning and GATT inspection is https://www.nordicsemi.com/Products/Development-tools/nRF-Connect-for-mobile .
5. Do not tap WRITE, upload DFU firmware or factory reset the toy.

## Capture
1. Scan for a device advertising as Elmo L2L. Nearby devices can be misleading; verify the name and which one responds to your toy being off/on.
2. Connect to Elmo L2L. Wait for service discovery to finish. If no services appear, check that another app is not connected; do not keep hammering Connect.
3. Expand the custom service(s). Note the exact full UUID for each (128-bit UUID, not only a shortened display name).
4. Within the same service, inspect characteristic capability icons/labels. Locate one with Notify and a separate one with Write Without Response as observed in V4.
5. Record exact notify UUID and (separately) write UUID, the parent service UUID, and the characteristic properties. You can save screenshots with the UUIDs visible; redact device address and any personal identifiers if sharing publicly.
6. Do not tap individual read/write controls or enable notifications just to collect UUIDs. Service discovery itself is enough if properties are shown.
7. Disconnect in nRF Connect; close the app.
8. In Bluefy, open the deployed Project Sasori website. Fill the verified custom service and notify UUIDs. Tap Connect & inspect only. This changes the BLE notification subscription but sends no Elmo application commands.
9. Export a sanitized diagnostic log and mark the session as observation, not authentication.

## Record template
- Date/time (UTC):
- Elmo model label: B6572 / photo reference:
- iPhone/Bluefy/nRF app versions:
- Service UUID:
- Notify characteristic UUID and properties:
- Write-without-response characteristic UUID and properties (document only, no tests):
- Inspection state:
- Total notifications:
- Disconnect reason:
- Error stage:
- Source screenshots:
- Unknowns and next test:

## What proves success
Success for this step is three exact UUID strings copied faithfully from nRF Connect or V4 source, with each characteristic associated with its parent service. It does **not** prove password validity, authentication, or motor control.

## If a UUID is missing
Stop. Do not search for generic UART UUIDs and assume Elmo uses them; do not try random vendor UUIDs. Capture the service-list screenshot instead and review it before entering anything.

## Hardware cautions
Hasbro describes a factory reset that erases toy customization: https://hasbro-apac-eng.custhelp.com/app/answers/detail/a_id/366/ . Do not reset as part of this UUID discovery.
