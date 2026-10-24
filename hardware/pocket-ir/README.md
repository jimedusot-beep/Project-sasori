# Pocket Remote build kit

**Experimental software. No Sasori bench-tested board, IR output, range, or appliance compatibility yet.** The included source is buildable firmware for an ESP32-S3 with the upstream GPIO4 driver, not a universal toy unlocker. The phone talks BLE to this board; the board emits ordinary consumer infrared. Once flashed, no computer companion is needed during use.

## 1. Gather the exact parts

Use an ESP32-S3 development board with accessible 5V, GND, and GPIO4; a USB data cable and USB supply; two 940 nm IR LEDs; a 2N2222 transistor with verified pinout; 33 Ω and 1 kΩ resistors; a 470 µF capacitor of suitable voltage rating; and a prototyping board/wiring. Three momentary buttons on GPIO5/2/7 are optional. Check the board and component datasheets for pin labels and pulse/current ratings before copying the upstream driver. A different emitter or supply needs its own resistor calculation. No battery charger or mains wiring is part of this kit.

Follow the preserved [upstream wiring card](UPSTREAM-WIRING.md). The capacitor goes **across** 5V/GND, not in the LED's series path. Verify no power short with USB disconnected. Confirm transistor pinout from its datasheet and measurements; package pin orders vary. All grounds must be shared. Ordinary phone cameras may filter IR and cannot prove code correctness.

## 2. Compile on Linux x86-64

Install `git`, `curl`, `tar`, and `sha256sum`, then:

```sh
git clone https://github.com/jimedusot-beep/Project-sasori.git
cd Project-sasori
bash scripts/build-pocket-ir.sh
```

This downloads a SHA-256-checked Arduino CLI and version-pinned core/libraries into a temporary directory, compiles for `esp32:esp32:esp32s3:CDCOnBoot=cdc`, and writes local binaries plus `SHA256SUMS` to `build/pocket-ir/`. It does not select a serial port or flash anything. CI uses the same script and its compile log is under **Verify laboratory → pocket-firmware**. Compiler success proves source compatibility, not physical operation.

For Windows/macOS or a graphical upload, use Arduino IDE 2 from [arduino.cc](https://www.arduino.cc/en/software):

1. Open **Settings / Preferences → Additional Boards Manager URLs** and add `https://espressif.github.io/arduino-esp32/package_esp32_index.json`.
2. Open **Boards Manager**, search for **esp32 by Espressif Systems**, select version **3.3.10**, and install.
3. Open **Library Manager** and install **IRremoteESP8266 2.9.0**, **NimBLE-Arduino 2.5.0**, and **ArduinoJson 7.4.3**. Use each entry's version selector.
4. Download this repository's ZIP from **Code → Download ZIP**, extract it, and open `hardware/pocket-ir/remote_ble/remote_ble.ino`. Keep the sketch in its `remote_ble` folder.
5. Choose your actual ESP32-S3 board in **Tools → Board**. Set **USB CDC On Boot → Enabled**; confirm flash/PSRAM and USB mode against your exact board documentation. The reference CLI target uses the generic ESP32-S3 board defaults.
6. Plug in the board with a USB **data** cable and select its port in **Tools → Port**. Press **Verify** first, then **Upload**. If no port appears, check the cable and the USB driver specified by your board vendor. Some boards require holding **BOOT** while connecting USB, then releasing it and pressing **RESET**; follow that board's instructions.
7. Wait for a successful upload and reset the board. Do not flash a toy or TV with this firmware.

## 3. Check the bridge

Open the USB serial monitor at 115200 baud. Reset the board and look for `IR-Remote` advertising and the service UUID from [the protocol guide](../../docs/pocket-ir-pilot.md). Fresh flash starts without preloaded buttons. Reflashing does not necessarily erase old NVS slots; use your board's documented full-flash erase option if resetting a reused board. Keep physical buttons disconnected during initial setup. No BLE authentication is implemented: nearby compatible clients could program or trigger the powered bridge. Use it supervised and unplug it when finished.

## 4. Use from your phone

1. Open [Pocket Remote](https://jimedusot-beep.github.io/Project-sasori/pocket-ir.html). On iPhone use Bluefy; desktop/Android needs a Web Bluetooth browser. Safari can use the offline demo but does not supply this Bluetooth interface.
2. Pick **Samsung TV** or **LG TV**, only as a community candidate for your own IR-capable appliance. Brand alone does not establish compatibility. Use an exact known code from your remote if these candidates do not match.
3. To reuse another exact IR remote, follow the [Flipper .ir import directions](../../docs/flipper-ir-import.md): open a local file, review supported buttons, and save up to five. No Flipper hardware or JSON editing is needed.
4. Check permission, tap **Choose IR bridge**, and select your specifically flashed board. This sends no configuration or IR.
5. Tap **Prepare remote**. Sasori writes each named button once and waits for matching slot acknowledgments. This changes stored slots but emits no IR. Controls stay disabled if preparation is incomplete.
6. Point the bridge toward your appliance and press one named button. Each press makes one bounded request. Observe the actual device; `sent:N` reports a bridge attempt, not an appliance acknowledgment.
7. Name and **Save setup** or **Export profile** for reuse. Saves/imports/reloads never transmit. Every fresh connection requires an explicit Prepare because this firmware cannot read back and prove existing slot contents.
8. Tap **Stop & disconnect** and unplug the bridge. Hiding the page disconnects. Stored physical buttons can still work without a phone until power is removed; already-emitted IR cannot be cancelled.

Without hardware, tap **Try offline demo → Prepare remote → Power**. This simulates the entire flow without Bluetooth or IR.

## 5. Validate before claiming support

Record privately: exact board/driver, firmware commit/build hash, appliance model, chosen profile, observed effect, latency, failures, recovery, and repeat count. Start with one known button and verify ten fresh connect/prepare/press cycles. Check unplugged board, disabled Bluetooth, denied chooser, missing notifications, rapid presses, backgrounding, and Stop. A bench capture should verify real IR timing and framing. No physical acceptance rows have been completed by Sasori.

**Limits:** five slots; NEC32/Samsung32/Sony12/15/20 encoded commands; no IR receiver/learning, rolling codes, radio remotes, security remotes, BLE toy authentication, or firmware installation on target appliances. The existing Elmo and Roku/HA adapters remain separate.
