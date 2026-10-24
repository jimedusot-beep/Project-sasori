# Elmo replacement-controller research track

**Independent of original Bluetooth authentication.** This track determines whether an original low-voltage mechanism can be controlled by safely replacing the logic board with a new, owner-programmed controller. It does not claim Elmo motors, wiring or voltage ratings have been verified on the owner's toy.

## Directly inspected upstream sources (October 22, 2026)

- [Bottango drivers](https://github.com/EvanBottango/Bottango): Arduino C++ serial driver and Python WebSocket adapter show how animation software can be isolated from hardware-driver implementations. Inspected README and BSD-3-Clause driver license. The downloadable desktop application may have different rights.
- [Adafruit CircuitPython Motor](https://github.com/adafruit/Adafruit_CircuitPython_Motor): MIT-licensed PWM motor/servo abstraction. Applicable only if a selected microcontroller, driver and actuator actually support that electrical control method.
- [Adafruit ServoKit](https://github.com/adafruit/Adafruit_CircuitPython_ServoKit): MIT-licensed interface for supported PWM servo boards. It cannot be presumed that Elmo's existing mechanism uses ordinary positional hobby servos.
- [ESP-IDF](https://github.com/espressif/esp-idf): Apache-2.0 core framework for a _new_, specifically selected ESP32 board. Nothing here suggests Elmo's original microcontroller is an ESP32.
- [PyFtdi](https://github.com/eblot/pyftdi): BSD-3-Clause UART/GPIO/SPI/I2C tool for verified compatible FTDI bridges. Never attach a bridge without confirming logic voltage and pinout.
- [sigrok libsigrokdecode](https://github.com/sigrokproject/libsigrokdecode): Python logic-signal decoder architecture with GPL-3.0-or-later source. Study as a standalone external tool before contemplating GPL integration.
- [NonaSuomy's Love2LearnElmo teardown](https://github.com/NonaSuomy/Love2LearnElmo): community research images and claims include a speaker labeled 16 Ω and a motor-driver marking DW1134F. **These are leads on another physical sample, not measurements of this owner's unit**. The inspected repository's license is not established; no code or protected assets are copied.

The full upstream license/provenance entries and follow-up tests belong to [REA's reusable-source catalog](https://github.com/jimedusot-beep/REA-Recovery-Kit/blob/main/research/reuse-candidates.json). Check the exact component, version and rights before any integration.

## Physical intake: zero powered tests initially

1. Photograph Elmo's exterior model/FCC labels, power arrangement, battery contacts and cable exits. Do not post serial numbers or unique Bluetooth identifiers.
2. With normal power removed, open only accessible, safe service panels. Photograph board sides, connector orientation, component markings and complete wire routing before disconnecting anything. Do not damage rechargeable cells or concealed wiring.
3. Record independent motor assemblies, mechanical linkage, motor/driver markings and wire counts. **No inferred pinout from wire color**; preserve the original harness and controller intact.
4. Separate speaker, button, sensor and motor wiring into an _unverified_ parts inventory. A resistance reading can help characterize a disconnected winding or speaker, but does not establish rated supply or logic levels.
5. Find an exact matching schematic, datasheet or traced connection confirmed on the owner's board before discussing power. If identification is uncertain, keep it unpowered.

## Independent design gates

- **H1 Identity:** Exact toy/board revision and photographed component labels are documented.
- **H2 Power:** Motor, logic and speaker/amplifier rails identified with credible limits; certified low-voltage, appropriately current-limited bench supply planned.
- **H3 Signals:** Driver inputs, feedback sensors and connector polarity independently established; use a correctly rated logic analyzer/level shifter where required.
- **H4 Mechanism:** Full unpowered range, linkages, stops, cable clearance and pinch points measured. Accessible power disconnect defined.
- **H5 Original software simulation:** A separate controller adapter emits named STOP, STATUS and bounded motion _requests_ against a virtual device. It never infers original Elmo command bytes.
- **H6 Bench approval:** Only after H1–H5 pass and the original board is electrically isolated, evaluate one controlled, low-risk physical action with explicit acceptance, rejection and inconclusive outcomes.

Use a state machine such as DISARMED → READY → ACTIVE → STOPPED/FAULT, with hardware-independent cancellation, watchdog and no automatic restart after a fault. Exact travel angles, current limits and electrical schematic cannot be filled in until verified measurements exist.

## What is intentionally not implemented

This replacement-controller track establishes no motor pin map, connector pinout, power-on recipe, replacement PCB wiring plan, servo travel range, bypass authentication or firmware flash procedure. The separate [October 23 original-BLE source review](../experiments/001-elmo-l2l/recovered-source.md) now supports an experimental known-password/query/greeting client. It supplies no electrical compatibility evidence for replacement hardware. Design patterns from other toys are **not** proof the same electrical interfaces exist in this unit.

Once a user-owned board photo and component measurements exist, this document should become a revisioned hardware profile with test records and a reviewed interface-control document. Continue original BLE investigation under M1/M2 in parallel.
