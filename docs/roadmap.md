# Prioritized roadmap

The [Elmo retrofit build plan](../experiments/001-elmo-l2l/retrofit/README.md) tracks the owner hardware inventory, power-off bench worksheet and proposed virtual-controller specification. It does not claim a working retrofit or permission to energize unidentified parts.

The implemented Device Hub now covers Elmo, standard BLE gadgets, original MiP, experimental Furby Connect and local TV adapters. Pocket Remote provides a separate ESP32 IR path. Software tests and source documentation do not establish behavior on this owner's hardware.

## Current upgrade — recognition and another toy adapter

- Identify a chosen Bluetooth device using exact known service/channel metadata, then disconnect before suggesting an adapter. No name-based protocol guesses or application writes occur during recognition.
- Reuse the chosen device reference through an explicit adapter selection and Connect press.
- Implement the [Furby Connect](furby-connect.md) firmware/presence queries and bounded blue antenna-light request using pinned Bluefluff facts. Reuse setups, routines and receipts; keep native Furby writes unavailable until a reviewed bridge exists.
- Preserve explicit unknown fields and physical-validation limits. This is supported-adapter matching, not automatic reverse engineering of an unknown protocol.

## Next acceptance — original Elmo and Furby hardware

1. Use the [Device Hub directions](device-hub.md) on the exact unit. Retain model, firmware, observed channels and private connection results.
2. Elmo: verify source-derived authentication with the existing password, status replies and one greeting. Observe actual playback, disconnect and recovery. New-password setup requires an explicit choice and the toy's unset-password response.
3. Furby Connect: follow the [adapter acceptance guide](furby-connect.md#physical-acceptance) for version/presence, antenna light/off, cancellation and recovery.
4. Repeat fresh connections; keep owner observations, software receipts, community evidence and independent verification separate.

[Issue #4](https://github.com/jimedusot-beep/Project-sasori/issues/4) tracks repeatable inspection and [issue #5](https://github.com/jimedusot-beep/Project-sasori/issues/5) tracks authentication acceptance. Source-derived browser/desktop Elmo implementations now exist; independent owner-unit validation remains pending.

## Expand commands from exact evidence

Add documented, model-specific action catalogs, framing and replies with strict parameters, finite budgets and cancellation. New motor control requires measured electrical/mechanical limits and an independently usable physical stop. A writable characteristic or imported claim cannot establish what a command does.

Existing toy-password recovery uses original-app settings or the manufacturer's physical reset. New-password setup when unset is implemented. No universal remote bypass is assumed. Any model-specific alternative needs independently reproducible evidence.

## Native access and autonomous routines

The buildable native iPhone app implements inspection, standard BLE and original MiP fixed controls. Furby controls currently use Web Bluetooth; native Elmo writes are also unfinished. Add reviewed native semantic operations before advertising parity.

Current routines and touch reactions run only in a foreground connection. Longer-lived automation needs a companion/native service with session ownership, explicit start/stop, time/action limits, persistent results and reconnect behavior. A browser timer is not a reliable background service.

## Firmware and replacement controllers

General firmware flashing is not implemented. Support would require an exact board/bootloader, verified image provenance, compatibility checks, an independently tested restoration path and hardware acceptance. Do not infer compatibility from similar UUIDs.

The [replacement-controller route](replacement-controller-research.md) is independent of original-board authentication. Board/load identification, electrical ratings, mechanical limits and a simulation-tested interface precede physical wiring or motors. The retrofit proposal remains separate work.

## Private cross-device storage

[Issue #6](https://github.com/jimedusot-beep/Project-sasori/issues/6) tracks durability. Current saves are local to each origin, with deliberate portable backups. Automatic sync needs an authenticated private backend, per-user authorization, conflict protection, secrets handling and tested restoration; public repository storage or embedded tokens are not substitutes.
