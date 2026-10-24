# Pocket Remote — experimental phone-to-IR control

**Implemented software, physical verification pending.** This is the small-hardware route: one phone, an ESP32-S3 IR emitter, five named buttons, saved local profiles. No computer companion is needed after flashing. A phone alone cannot emit infrared. This is separate from Elmo's BLE adapter and from the Roku/Home Assistant companion.

[Open Pocket Remote](https://jimedusot-beep.github.io/Project-sasori/pocket-ir.html) · [Full hardware/build/phone directions](../hardware/pocket-ir/README.md) · [Copied source and licenses](../hardware/pocket-ir/NOTICE.md)

## Use it now

Without hardware: **Try offline demo → Prepare remote → Power**. All responses are synthetic and labeled Demo; no Bluetooth or network calls are made.

With the specifically flashed bridge: open in Bluefy on iPhone or a Web Bluetooth browser on desktop/Android; choose a matching community candidate or saved custom profile; confirm permission; Choose IR bridge; Prepare remote; press one named button. Every new connection or profile change needs explicit preparation. There is no hex entry in this normal path. Follow the complete build guide before connecting hardware.

Starter profiles contain five Samsung TV or five LG TV community codes. They are **candidates, not verified support for every TV of that brand**. The selected codes have reviewed software encoding vectors; no TV effects have been observed by Sasori. Custom profiles can define up to five named NEC32, Samsung32, or already-encoded Sony12/15/20 buttons. There is no learning receiver or automatic code sweep.

## Reusable setups

Save a named copy, export it, or copy it into the advanced JSON editor to adjust known commands. Import validates the entire profile before committing. Starter profiles cannot be overwritten. Up to 20 custom profiles share a bounded 64 KB record in the existing IndexedDB settings store; no database version bump or research-data migration is needed. Concurrent-tab revisions conflict rather than silently overwriting. Corrupt saves disable saving and preserve existing data.

Setups and exports intentionally contain IR codes and your labels; review them before sharing. They contain no Bluetooth platform identifiers or passwords. The visible event log is temporary, bounded to 20 statuses, and excludes raw codes and backend errors. Nothing is uploaded. Hosted/local origins and browsers keep separate saves. Temporary storage warns you to export before closing.

Saving, importing, choosing a profile, reopening, and connecting never emit IR. Preparation stores codes on the bridge but does not trigger them. The bridge retains slots in flash; the browser still requires fresh matching acknowledgments in each connection because there is no slot readback or authenticated contents verification.

## Bridge contract and bounded requests

Primary implementation: [Koontzie/ir-remote, exact revision](https://github.com/Koontzie/ir-remote/tree/34c848831abd6bf9e49e50ea3eed971fb245c729). Sasori includes an attributed MIT adaptation with empty fresh slots and strict widths.

| Purpose   | UUID                                 | Interface                                          |
| --------- | ------------------------------------ | -------------------------------------------------- |
| Service   | b457c32b-22b1-425f-8a88-4d6dc37ba4eb | Advertised service filter                          |
| Configure | d997012d-7d2b-47de-ae87-bae14df446ef | WRITE `{slot,proto,code,bits}`                     |
| Trigger   | 58397514-04a3-4265-9590-9d910c4e99d2 | WRITE `{slot}`                                     |
| Status    | b8ddfe01-519f-430d-bd4e-aba0dd852e2c | NOTIFY `saved:N`, `sent:N`, `pressed:N`, `err:...` |

The chooser expires after 30 seconds; each GATT stage and each complete write-plus-matching-status operation expires after 8 seconds. A 46-second outer deadline bounds connection setup. Stop cancels the pending promise immediately. Browsers cannot programmatically dismiss their device chooser, but a late result cannot enable this session. Disconnected or replaced sessions ignore late notifications and completions. Observed characteristic properties must support write-with-response and notifications.

A stored button requires both the write response and its current matching `saved:N`; an unsolicited status cannot enable it. Sending waits for `sent:N`, rejects concurrent writes, and enforces a 250 ms gap after completion. Incomplete preparation leaves the whole UI remote disabled. Timeout or disconnect invalidates prepared buttons and requires reconnection. There is no background queue or automatic retransmission.

**Protocol limit:** the firmware provides no authenticated pairing, request nonce, or appliance feedback. A matching status is only an unauthenticated slot claim; it cannot distinguish every delayed same-slot status from another client or physical input. `sent:N` does not prove IR timing, line of sight, or target response. Keep this powered bridge supervised and unplug it afterward.

Stop, unchecking permission, page hide, and page close stop new requests and close the connection. They cannot recall emitted IR or disable separately wired physical buttons. The firmware patch clears its pending BLE trigger on disconnect, but cannot interrupt transmission already running. Existing NVS is not erased by the browser.

## Release evidence and remaining physical gate

Automated tests cover source vectors, invalid inputs, no writes on connect, scoped acknowledgments, notification-before-write ordering, interruption, deadlines, stale completions, paced sends, persistence, import atomicity, revision conflicts, responsive browser flows, accessibility, and the pinned firmware compile. CI results are the evidence for software claims, not device certification.

Before labeling a hardware combination supported, record the exact board/driver/firmware, verify IR on the bench, demonstrate one real appliance action over ten fresh connections, and test missing notifications, unplugging, denied chooser, rapid presses, and backgrounding. No Sasori physical acceptance result has been recorded. Authenticated pairing and firmware identity/readback remain future protocol work.

## Minimalist ideas actually implemented

| Source                                                                          | Transferred strategy                                         | Implemented result                                                                       |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| [Koontzie IR bridge](https://github.com/Koontzie/ir-remote)                     | Persistent five-slot remote with BLE configuration           | Attributed firmware, direct phone adapter, five named buttons                            |
| [Flipper-IRDB](https://github.com/Lucaslhm/Flipper-IRDB)                        | Share protocol descriptions rather than rebuild every remote | Small credited CC0 starter catalog and portable validated profile format                 |
| [ESPHome remote transmitter](https://esphome.io/components/remote_transmitter/) | Describe buttons declaratively                               | Fixed protocol/width validation and reusable named profiles                              |
| [OMOTE](https://github.com/OMOTE-Community/OMOTE-Firmware)                      | Local handheld controls                                      | A phone layout with large buttons and no cloud dependency; no GPL runtime copied         |
| [Wider maker research](research/resourceful-maker-research-2026-10-24.md)       | Repairable parts and reproducible builds                     | Open wiring reference, pinned toolchain, source/license manifest, bench acceptance steps |

This kit does not add radio-remote replay, rolling codes, target firmware flashing, or a universal toy authentication bypass. More IR models can use this same profile format once their exact encoding and behavior are checked; proprietary BLE toys still need their own protocol adapter.
