# Reuse and source record

Sasori cloned [Koontzie/ir-remote at 34c8488](https://github.com/Koontzie/ir-remote/tree/34c848831abd6bf9e49e50ea3eed971fb245c729) on 2026-10-24. Its MIT firmware and wiring card are included here with Tyler Koontz's full [MIT notice](LICENSE-MIT-Koontzie.txt). Original file SHA-256 values are in [sources.json](sources.json).

## Actual reuse

- `remote_ble/remote_ble.ino`: copied upstream sketch, with three Sasori changes: leave fresh NVS empty instead of preloading Samsung power; restrict protocol widths and reject oversized values; discard the pending BLE trigger when disconnected. Added an attribution header. Existing flash data remains until erased separately. Serial diagnostics include stored codes; do not publish serial logs containing private details.
- `UPSTREAM-WIRING.md`: unmodified upstream MIT wiring card. Upstream bench observations describe its build, not Sasori hardware validation.
- `site/lib/pocket-ir-profiles.js`: ten selected entries from the pinned `data/db/tvs/samsung.json` and `lg.json` shards. Upstream [data provenance](https://github.com/Koontzie/ir-remote/blob/34c848831abd6bf9e49e50ea3eed971fb245c729/data/README.md) identifies these as generated solely from [Lucaslhm/Flipper-IRDB](https://github.com/Lucaslhm/Flipper-IRDB), CC0-1.0. Its [CC0 dedication](LICENSE-CC0-IRDB.txt) is included; the separately inspected IRDB revision was `d126fb1b6f1e114c52b4a8c19839ea65e3a9c24d`, not a claim that upstream regenerated its shards from that revision. Source model strings are `Samsung` and `LG`, not exact Sasori-tested device models.
- The browser session, named-profile UI, storage, and tests are original Sasori code. No upstream browser app or automatic code sweep was copied.

## Encoding review

NEC/Samsung code structure is checked by Sasori tests for the selected vectors, using the documented byte-reversal/construction convention and IRremoteESP8266's encoder behavior. This is software evidence only.

The upstream converter constructs Sony SIRC as `address << 7 | command` and lists TV power as `0x95`. [IRremoteESP8266's primary encoder tests](https://github.com/crankyoldgit/IRremoteESP8266/blob/1e2f0f3ef0a93cbf2a8ddb2e95130f8f4c584b3f/test/ir_Sony_test.cpp) expect `encodeSony(12, 21, 1) == 0xA90`. The [implementation](https://github.com/crankyoldgit/IRremoteESP8266/blob/1e2f0f3ef0a93cbf2a8ddb2e95130f8f4c584b3f/src/ir_Sony.cpp) reverses the assembled bits. Therefore the upstream Sony catalog is excluded, pending independent conversion/fixture review. Custom Sony profiles must already use IRremoteESP8266 send encoding, not a raw Flipper address/command concatenation.

## Build dependencies (not vendored)

The build script retrieves Arduino CLI 1.5.1 (GPL-3.0), Espressif Arduino core 3.3.10 (its file-specific licenses), IRremoteESP8266 2.9.0 (LGPL-2.1), NimBLE-Arduino 2.5.0 (Apache-2.0 and bundled notices), and ArduinoJson 7.4.3 (MIT). Preserve their own notices and applicable source/linking requirements when redistributing built firmware. This repository distributes the attributed sketch and build recipe, not precompiled third-party firmware. CI verifies compilation; binaries remain local build outputs.

Ideas from [ESPHome](https://esphome.io/components/remote_transmitter/), [OMOTE](https://github.com/OMOTE-Community/OMOTE-Firmware), and the wider [maker research record](../../docs/research/resourceful-maker-research-2026-10-24.md) informed named actions, local operation, reusable hardware, and explicit compatibility. Their runtime code was not copied into the MIT browser client.
