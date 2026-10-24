# Sasori Pocket IR Bridge — experimental computer-free remote

**Status (2026-10-24):** original browser pilot written, no Sasori hardware validation or confirmed real TV action. This is not included in the ordinary Device Hub's verified TV methods.

## Why this experiment?

The published Sasori TV workflow needs a computer companion and an additional IR hub for generic remotes. A dedicated inexpensive ESP32-S3 BLE-to-infrared board can perform the physical IR transmission while an iPhone in Bluefy provides the interface. **The phone alone cannot generate infrared.** Only a manually selected, owner-controlled bridge and ordinary consumer infrared appliance belong in this experiment.

The existing wider maker research is at [resourceful-maker-research-2026-10-24.md](research/resourceful-maker-research-2026-10-24.md). This experiment converts one research candidate into an original, bounded implementation rather than adding another aspirational feature to a list.

## Source-backed firmware protocol

Primary source: [Koontzie/ir-remote](https://github.com/Koontzie/ir-remote/tree/34c848831abd6bf9e49e50ea3eed971fb245c729), inspected exact revision 34c848831abd6bf9e49e50ea3eed971fb245c729; particularly [firmware/remote_ble/remote_ble.ino](https://github.com/Koontzie/ir-remote/blob/34c848831abd6bf9e49e50ea3eed971fb245c729/firmware/remote_ble/remote_ble.ino). Repository MIT; follow dependency and file-specific license notices if using external firmware.

| Purpose | UUID | Reviewed interface |
| --- | --- | --- |
| BLE service | b457c32b-22b1-425f-8a88-4d6dc37ba4eb | Advertised UUID |
| Configure | d997012d-7d2b-47de-ae87-bae14df446ef | WRITE JSON containing slot, proto, code, bits |
| Trigger | 58397514-04a3-4265-9590-9d910c4e99d2 | WRITE JSON containing slot |
| Status | b8ddfe01-519f-430d-bd4e-aba0dd852e2c | READ/NOTIFY: ready, saved:N, sent:N, pressed:N, err:... |

Supported commands are limited to slots 1–5 and protocols NEC, SAMSUNG and SONY. Sasori validates hexadecimal code width and a 1–64 bit count. The upstream board saves configured slots in nonvolatile flash; Sasori stores neither these values nor a list of Bluetooth devices on this page.

Firmware does **not** provide secure client authentication or robust per-request transaction IDs. Treat its notification as a **claim from a selected bridge**, not cryptographic identity or proof that a target responded. There can also be unrelated physical button statuses. The upstream firmware can seed an example Samsung power slot, but Sasori does **not** trigger existing slots automatically; an observed saved acknowledgment for a slot during this very connection is required first.

## Hardware trial with matching board only

1. Follow the pinned upstream project's board, BOM, pin mapping, programming and safety instructions. Its firmware references an ESP32-S3, IR emitter and GPIO4 driver. A different board (such as M5Stack ATOM Lite with its documented GPIO12 IR emitter) is NOT a drop-in wiring match. Do not infer wiring or voltage from other devices. Sasori does not flash firmware.
2. Verify upstream firmware build, board revision and IR emission independently before trying Sasori. Start with USB-powered bench conditions and the owner's non-safety-critical consumer appliance.
3. Open https://jimedusot-beep.github.io/Project-sasori/pocket-ir.html in Bluefy on iPhone or a Web Bluetooth-compatible browser. Check ownership/authorization, press Choose IR bridge, and select your own specifically flashed board.
4. Enter one verified model-specific IR code, its protocol and bit length; store it into a chosen slot. A WRITE acknowledgment is not enough. Wait until the bridge **actually reports saved:N** before the page enables a transmit button.
5. Press Send selected IR slot once; observe the appliance yourself. The bridge may report sent:N when it attempted transmission, **not** when the appliance accepted it. Note the device model, outcome, board revision, firmware version and any recovery privately. No data is uploaded from this page.
6. Disconnect manually. Hiding/closing the page stops new requests; emitted IR cannot be recalled. Flash-persisted slots can still be fired using the physical buttons without a phone: keep the test bridge off when not supervised.

Use only on equipment you own or have explicit permission to operate. Automotive entry, security, gate systems, credentialed remotes, rolling codes and safety-critical devices are out of scope.

## Test and production gates

- [ ] Run Sasori's pure protocol and simulated GATT regression tests.
- [ ] Verify supported firmware builds on one exact board and expected GATT characteristics.
- [ ] Perform five fresh user-authorized connects and manual disconnects.
- [ ] Confirm valid/rejected IR inputs and one known-good physical emitter output.
- [ ] Reproduce one ordinary TV/button outcome ten times while independently observing the target.
- [ ] Test page-hide abort, interrupted chooser, unplugged board, missing notifications and rapid clicks.
- [ ] Before production release, add authenticated bridge pairing and a firmware identity/compatibility claim beyond the service UUID.
- [ ] Verify legal/license compliance and device-specific notices for any third-party material reused.

No motor control, toy firmware writes, Wi-Fi scanning, rolling-code replay, automatic transmission or generic unrestricted Bluetooth writes are included.

## Research-to-feature transfer map

These original projects document valuable methods; no conclusion about a person's financial background or identity follows from geography.

| Project and context | Reusable idea | Sasori outcome to build |
| --- | --- | --- |
| [Ultimate Robotics uMyo](https://github.com/ultimaterobotics/uMyo) — Ukraine-based project | Sensor-to-wireless bridge and calibration | Consented local input events feeding a reusable automation adapter |
| [Glia](https://glia.org/pages/open-source-research-and-development) — Gaza/Palestine collaborative design | Repairable, locally fabricated devices with full documentation | Locally replaceable bridge parts, sourcing alternatives, open BOM and tests; **not** clinical-device claims |
| [OpenFlexure vendors](https://openflexure.org/about/vendors) — including Tanzania's Bongo Tech & Research Labs | Local production, calibration, maintainability | Bench acceptance records and reproducible compatibility for every bridge revision |
| [Vicharak Shrike](https://github.com/vicharak-in/shrike) — India | Extensible, low-cost MCU/FPGA experimentation | Optional future diagnostic hardware, not needed by today's infrared pilot |
| [M5Stack ATOM Lite](https://docs.m5stack.com/en/homeassistant/devices/atom_lite) — Shenzhen hardware | Onboard button and IR emitter, published pin facts | Compare a small alternative IR board; **separate firmware and pin validation** |
| [ESPHome IR/RF components](https://esphome.io/guides/setting_up_rmt_devices/) — global contributors | Typed command encoding and capturing exact IR timings | A future supervised IR learning bridge, no blind replay |
| [sigrok PulseView](https://sigrok.org/wiki/PulseView) — open analyzer ecosystem | Protocol decoding and time-aligned traces | Import authorized hardware captures into Sasori's offline Discovery |
| [rtl_433](https://github.com/merbanan/rtl_433) — global open source | Passive decode of compatible environmental sensor signals | Optional later receive-only sensor telemetry with proper hardware/privacy review |
| [Koontzie IR bridge](https://github.com/Koontzie/ir-remote) — independent maker | Five persistent named IR slots over BLE | **Implemented in this branch:** the original bounded phone pilot |

## Ranked next steps after the pilot

**1. Hardware verification:** demonstrate a real, repeated TV action before describing any bridge as supported. **2. Authenticated board design:** address the documented lack of GATT authentication and add a fixed version/capabilities handshake. **3. Device model profiles:** maintain reviewed NEC/Samsung/Sony IR codes with correct provenance and license, with no automatic send on import. **4. Signal Atlas:** normalize IR, BLE, audio and analyzer captures with real evidence labels and confidence boundaries. **5. Salvage inputs:** connect inexpensive/repurposed physical buttons and sensors to local opt-in routines. Every step must preserve cheap reproducibility, manual user consent and explicit failure handling.
