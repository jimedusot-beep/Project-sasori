# Device adapters and real-device checks

Sasori now uses one control workspace and one action recipe across reviewed protocol families. Select **Device protocol / model**, connect, then use **Identify**, **Status**, **Find / blue light**, or **Run connection check**. A saved setup remembers the selected family and private device binding. Adding another unit in a supported family reuses that implementation; an unrelated proprietary protocol still requires evidence and a reviewed adapter.

## Implemented families

| Family                              | Connection and framing                                                       | Actions                                                                            | Evidence status                                                                                     |
| ----------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Standard BLE `ble-standard/v1`      | Device Information 180A, Battery 180F, Immediate Alert 1802                  | Read supported identity/battery fields; mild alert 01 then 00                      | Standards-backed software; physical effects vary by product                                         |
| Original WowWee MiP `wowwee-mip/v1` | RX service FFE0 / notify FFE4; TX service FFE5 / write-without-response FFE9 | Version 14; status 79; dim-blue chest LED 84 00 00 20, followed by off 84 00 00 00 | Manufacturer-documented protocol; original implementation and fixtures; no real-unit validation yet |
| Love2Learn Elmo                     | Existing inspection profile and recorded observations                        | Inspection/notifications only                                                      | Authentication and proprietary control remain blocked by missing source evidence                    |

MiP facts come from the manufacturer's [transport README](https://github.com/WowWeeLabs/MiP-BLE-Protocol/blob/6123d0250f9b0bb6513d31eb6fbdc8213b5268a4/README.md) and [command table](https://github.com/WowWeeLabs/MiP-BLE-Protocol/blob/6123d0250f9b0bb6513d31eb6fbdc8213b5268a4/MiP-Protocol.md), inspected October 23, 2026. No upstream code, images, firmware or app assets are imported. The shared architecture continues the source-cited [inspiration register](research/adapter-inspirations.md).

MiP requests are binary. Its notifications are **ASCII hex**, so `140E021B07` arrives as bytes `31 34 30 45 30 32 31 42 30 37`. The strict version decoder retains year/month/day/revision fields without inventing a year base. Status retains the vendor battery code (4D–7C) and posture (0–6); it does not invent a percentage or voltage conversion. Only the expected opcode is accepted while a query is pending in that connection. There is no transaction nonce, so a matching response is protocol matching, not authenticated correlation.

The user explicitly selects the family. Similar UUIDs, device names and remembered profiles do not prove device identity. Connection subscribes to MiP notifications but sends no application query or LED action until a button is pressed. Missing documented channels prevent commands. The LED ends **off**, rather than restoring a previous color/fade/pattern. No acknowledgment proves the physical effect. Motors, sound, operating modes, volume, firmware and arbitrary bytes are outside this adapter.

## Record an actual check

1. Use your exact supported model, close another app using its connection, and connect in Sasori. Record the model/firmware returned by Identify. Missing identity stays unknown and cannot qualify for the ten-session target.
2. Press **Run connection check**. Sasori runs each available Identify → Status → Find/LED operation, waits for the clear/off write, and saves a receipt. It records duration, outcome, stages, cleanup queue result and a fresh local connection ID; it stores no raw packets or Bluetooth platform ID in this receipt.
3. Check the toy yourself. Select whether the light/alert occurred and whether it stopped and the toy remained usable. Add relevant timing or failure details, then **Save observation**. A queued off write alone is not physical confirmation.
4. Stop and reconnect afresh before the next check. Ten distinct successful connections with the same adapter, model and firmware, with effect and recovery observed, form a report ready for review. Retrying on the same connection adds no fresh success. Failed, cancelled, untested or changed-identity checks restart the count.
5. Exercise Stop during the effect, backgrounding, rejected/absent replies and disconnect/recovery as separate labeled trials. Inspect the real toy after loss of connection; an off write may never reach it. Keep these failures and observations in the report.
6. Export the trial report for review. Use **Show all saved trials** to review imported or unbound reports, and **Remove selected trial** to manage the 200-record limit. Review free-text labels and notes before sharing.

This count is a usability acceptance target, **not a certification**. `hardwareVerified`, `authenticationVerified` and `physicalEffectVerified` remain false; owner observations are separate fields. Synthetic trials and imported claims never count as local successes. Imports receive new trial IDs and source `imported`, even if an input file claims otherwise. Reports are bounded to 400 KB, imports validate atomically, and local storage uses a separate key in the existing IndexedDB v4 settings store. Setups, inspection preferences and capture records keep their existing formats.

## Add a family once

`site/lib/device-controls.js` selects reviewed built-in families behind the same intents. `mip-controls.js` contains the original MiP wire codec, notification matching and bounded command runner; `standard-controls.js` contains SIG operations. Fixed metadata and source references populate the UI. No JSON import loads executable code or installs new command bytes. A new adapter must document exact models/firmware, transport/channel properties, wire vectors, response semantics, timeout/cancellation/cleanup behavior and recovery evidence. Native support needs its own fixed semantic API and independent validation in Swift.

## Finish Elmo authentication

The [source-verification register](../experiments/001-elmo-l2l/source-verification.md) lists G1–G8. The rechecked public community README provides candidate GATT identifiers and a field named `securityChallenge`, not a complete handshake. The previously reported APK URL still returned HTTP 403 on October 23; the available files and prior-context search yielded no original APK or managed assembly. This release does not claim recovered authentication.

For an original app you legitimately hold, create a private directory outside the repository and run:

```sh
mkdir -m 700 /tmp/sasori-elmo-private
npm run review:elmo-source -- /path/to/original.apk \
  --output /tmp/sasori-elmo-private/source-review.json \
  --extract-managed /tmp/sasori-elmo-private/Assembly-CSharp.dll
```

Extraction is optional. The tool never executes the artifact. It hashes actual bytes, checks bounded unique archive members and a PE prefix, and records only marker counts. It refuses outputs inside the repository, existing files and symlinks, and creates outputs mode 0600. A PE prefix is not proof of valid managed metadata. It does not parse the binary Android manifest, verify APK signatures, establish publisher identity, extract credentials or implement authentication. Matching a hash from the prior report identifies that archive, not Hasbro as its publisher. Keep the receipt and app private; the tool does not upload them.

Next inspect the assembly offline, record exact method locations and factual message layouts, derive synthetic-credential vectors, and correlate authorized app TX/RX traces with acceptance/rejection and disconnects. A DLL alone also helps method review, but the CLI expects the original APK so that archive and manifest provenance can be recorded together. Real passwords, challenge responses and original app code stay out of public fixtures. Only after complete framing/state/vector evidence exists should an original authentication implementation and one bounded action be added. The new check workflow is available for validating that future adapter on the actual Elmo; it cannot manufacture those missing observations.
