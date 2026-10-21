---
name: part-at42qt1070
description: Pinout, electrical limits, wiring and MicroPython driver for the AT42QT1070 5-key capacitive touch breakout (Adafruit #1362, standalone mode, active-low outputs). Use when designing, wiring, simulating or writing code for an AT42QT1070 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# AT42QT1070 5-pad capacitive touch breakout (AT42QT1070)

## Overview
The **AT42QT1070** (Microchip/Atmel QTouch) senses up to seven capacitive touch keys. On the
**Adafruit Standalone 5-Pad Capacitive Touch Sensor Breakout (#1362)** its MODE pin is tied to VDD,
so it runs in **standalone mode only — no I2C**. Five electrode inputs (0–4) each drive an
**open-drain output OUT0–OUT4 that goes LOW while that pad is touched**, and lights an LED on the board.
- Key 0 is the fixed **guard channel** (threshold 10 counts, the others 20): it has priority and overrides the other keys.
- **Only one key is reported at a time** (adjacent key suppression).
- Self-calibrating, drift-compensated and debounced in the chip; a touch held longer than about **30 s** is recalibrated away (the output releases).
- Response: a few 8 ms acquisition cycles (detect integrator ≥ 2 samples).

## Pinout (two 6-pin headers, as printed)
Left header ("Input"), top to bottom:
| Pin | Function |
|---|---|
| GND | Ground |
| IN0 | Touch pad 0 (guard key), 10 kΩ series resistor on board |
| IN1–IN4 | Touch pads 1–4 |

Right header ("Output"), top to bottom:
| Pin | Function |
|---|---|
| VDD | Supply, 1.8–5.5 V |
| OUT0 | Open-drain, LOW while pad 0 is touched |
| OUT1–OUT4 | Open-drain, LOW while pad 1–4 is touched |

Board labels are just "Gnd/VDD" and "0"–"4" under "Input"/"Output"; Sparkbench names them IN0–IN4 and OUT0–OUT4.

## Electrical limits
- Supply 1.8–5.5 V (absolute max 6 V); about 0.5–0.9 mA at 3.3 V plus ~3 mA per lit LED.
- Outputs are open drain, max ±10 mA per pin, Vol ≤ 0.6 V. Voltage on any pin must stay within −0.5 V … VDD + 0.5 V.
- Each output has only an LED + 470 Ω to VDD on the board — **no pull-up**. Add a 10 kΩ pull-up to 3.3 V (or use the GPIO's internal pull-up).
- Pads: copper foil / plates, at least 6 × 6 mm, 1–30 pF; keep the wires to them short.

## Wiring
- Power VDD from **3.3 V** when using an ESP32 or Pico.
- ESP32: VDD → 3V3, GND → GND, OUT0…OUT4 → any free GPIOs (each with 10 kΩ to 3V3). Pads → IN0…IN4.
- Pico: VDD → 3V3(OUT), GND → GND, OUT0…OUT4 → e.g. GP10–GP14 (internal pull-ups work).
- Raspberry Pi 4: VDD → pin 1 (3.3 V), GND → pin 6, OUTn → any GPIO with pull-up enabled.

## Using the driver
```python
from qt1070 import QT1070
import time
pad = QT1070([32, 33, 25, 26, 27])   # GPIOs wired to OUT0..OUT4
while True:
    print('touched=%s' % pad.touched())   # e.g. [2] while pad 2 is touched
    time.sleep_ms(100)
```
`touched()` returns the list of keys in detect, `key()` the single touched key or None.

## Gotchas
- This board **cannot be used over I2C** (MODE is hard-wired to VDD); for I2C use a board in comms mode (address 0x1B).
- Outputs read LOW = touched. A floating or ~1.5 V output means the pull-up is missing.
- Touching pad 0 (guard) suppresses the others: make it the large/background pad.
- Settings (threshold, averaging) are fixed in standalone mode; sensitivity is set by pad size and the panel thickness.
- Power-cycle after changing the pads so the chip recalibrates against the new electrodes.

## Datasheet
https://ww1.microchip.com/downloads/en/DeviceDoc/Atmel-9596-AT42-QTouch-BSW-AT42QT1070_Datasheet.pdf
