# Wiring Card — perf-board build (canonical quick reference)

USB-powered perf board, ESP32-S3 devkit socketed. One glance, no archaeology.

```
POWER
  Devkit 5V pin ──► 5V rail
  Devkit GND    ──► GND rail
  470µF cap across the rails: (+) → 5V, (−) stripe → GND. Near the driver.
  (Cap is parallel — NOTHING routes through it. The 33Ω must NOT be in the
  cap's branch; that was the unlimited-current incident of 2026-07.)

IR DRIVER (2N2222, TO-92)
  5V rail ──33Ω──► LED1 anode(+)
  LED1(−) ──► LED2(+)                 [series pair, both 940nm emitters]
  LED2(−) ──► COLLECTOR
  EMITTER ──► GND rail
  GPIO4 ──1kΩ──► BASE (middle leg)

  E vs C by meter (diode mode, red probe on Base, black on each outer):
  HIGHER forward drop = EMITTER → GND. Lower = COLLECTOR → LED2(−).
  Vendor leg order varies — always meter, never assume.

BUTTONS (R13-507, two-lug, no polarity, no resistor)
  Button 1: GPIO5 ──► button ──► GND     → slot 1  (NOT GPIO6 — pin 6 was never
            wired; a firmware GPIO6 remap made btn1 go dead. Verified 2026-07-26.)
  Button 2: GPIO2 ──► button ──► GND     → slot 2  (slot unprogrammed)
  Button 3: GPIO7 ──► button ──► GND     → slot 3  (slot unprogrammed)
  Firmware uses INPUT_PULLUP; pressed = LOW.

HEALTH CHECKS
  Idle GPIO5→GND: ~3.3V; pressed: 0V.
  Driver on (steady-drive test): C→E ≈ 0.2V, across 33Ω ≈ 3.3V (~100mA).
    C→E ≈ 3.4V + 33Ω ≈ 0.4V  == transistor E/C reversed (seen 2026-07-21).
  5V↔GND unpowered: open, never ~0Ω.
  LED path: beep 5V→33Ω→LED1→LED2→collector; NO direct 5V→LED1 beep.
```

Phase 4 (battery) will replace the POWER block only; everything below it stays.
