# Device adapters and real-device checks

Sasori now uses one control workspace and one action recipe across reviewed protocol families. Select **Device protocol / model**, connect, then use **Identify**, **Status**, **Find / blue light**, or **Run connection check**. A saved setup remembers the selected family and private device binding. Adding another unit in a supported family reuses that implementation; an unrelated proprietary protocol still requires evidence and a reviewed adapter.

The newer [Device hub](device-hub.md) adds Elmo and TV adapters behind a shared connection/routine interface. The Identify → Status → Find/LED trial procedure below remains in the laboratory's universal-controls workspace. Hub receipts are separate from that trial-counting system.

## Implemented families

| Family                              | Connection and framing                                                       | Actions                                                                                                                   | Evidence status                                                                                        |
| ----------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Standard BLE `ble-standard/v1`      | Device Information 180A, Battery 180F, Immediate Alert 1802                  | Read supported identity/battery fields; mild alert 01 then 00                                                             | Standards-backed software; physical effects vary by product                                            |
| Original WowWee MiP `wowwee-mip/v1` | RX service FFE0 / notify FFE4; TX service FFE5 / write-without-response FFE9 | Version 14; status 79; dim-blue chest LED 84 00 00 20, followed by off 84 00 00 00                                        | Manufacturer-documented protocol; original implementation and fixtures; no real-unit validation yet    |
| Love2Learn Elmo `elmo-l2l/v1`       | Reviewed DATA service/notify/write channels and recovered app framing        | Existing-password handshake; opted-in unset-password setup; input/volume reads; catalog sound and bounded volume requests | Source-backed software and synthetic vectors; acceptance and physical behavior unverified on this unit |
| Local TV `tv-local/v1`              | Local Python companion, Roku ECP or configured Home Assistant                | Reported media capabilities and fixed semantic remote buttons; explicit IR learning with compatible hardware              | Official API facts and fake-device tests; real TV/IR validation pending                                |

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

The broader October 23 [community scan](research/community-scan-2026-10-23.md) recovered the exact reported APK through a public Aptoide archive and found a newer standalone `pyelmo` implementation. [Direct method review](../experiments/001-elmo-l2l/recovered-source.md) now establishes the implemented protocol subset. The [browser hub](device-hub.md) and [experimental desktop client](../desktop/README.md#experimental-elmo-known-password-check) implement bounded subsets; the hub includes catalog sound and volume requests. The earlier failed URL did not establish that no artifact existed. Real-unit compatibility, physical effects and recovery remain unverified; native Elmo inspection remains separate.

For an original app you legitimately hold, create a private directory outside the repository and run:

```sh
mkdir -m 700 /tmp/sasori-elmo-private
npm run review:elmo-source -- /path/to/original.apk \
  --output /tmp/sasori-elmo-private/source-review.json \
  --extract-managed /tmp/sasori-elmo-private/Assembly-CSharp.dll
```

Extraction is optional. The tool never executes the artifact. It hashes actual bytes, checks bounded unique archive members and a PE prefix, and records only marker counts. It refuses outputs inside the repository, existing files and symlinks, and creates outputs mode 0600. A PE prefix is not proof of valid managed metadata. It does not parse the binary Android manifest, verify APK signatures, establish publisher identity, extract credentials or implement authentication. Matching a hash from the prior report identifies that archive, not Hasbro as its publisher. Keep the receipt and app private; the tool does not upload them.

The intake tool remains useful for privately checking another supplied archive/version; it does not automatically validate methods or authentication. For the recovered 1.5.1 archive, method locations and new synthetic vectors are already recorded in the source review. Next run the bounded desktop trial on the actual toy with its privately entered known password, retain the metadata receipt, and observe the greeting/recovery if explicitly requested. A DLL alone can support method review, but the intake CLI expects the APK to record archive/manifest provenance together. Real credentials, challenge responses and original app code remain outside public fixtures.
