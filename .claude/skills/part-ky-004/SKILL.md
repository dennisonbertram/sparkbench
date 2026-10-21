---
name: part-ky-004
description: Pinout, electrical limits, wiring and MicroPython driver for the KY-004 push button module (tactile switch with 10 kOhm pull-up, digital output). Use when designing, wiring, simulating or writing code for a KY-004 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# KY-004 push button module (KY-004)

## Overview
The **KY-004** (Joy-IT SensorKit / Keyes board, black, 18 x 15 mm) carries a 6x6 mm **tactile push button** and a **10 kΩ resistor** (marked 103). On the Joy-IT board the resistor is a pull-up from S to +, and the button shorts S to GND.
- **S is HIGH while released and goes LOW while the button is held** (active low)
- Rated 3.3-5 V, -25 to 105 °C, 100,000 presses
- No chip, no LED; it draws only the pull-up current while pressed (0.33 mA at 3.3 V)
- **Variants exist**: some KY-004 clones wire the resistor as a pull-down, so S is LOW at rest and HIGH when pressed. Read S with the button released to find out which you have.

## Pinout (3-pin header, as printed on the board)
| Pin | Name | Function |
|---|---|---|
| 1 | S | Signal: 1 = released, 0 = pressed (Joy-IT pull-up board) |
| 2 | + (middle) | Supply for the resistor, 3.3-5 V |
| 3 | - | Ground |

## Electrical limits
- Supply 3.3-5 V (vendor rating). The supply only feeds the 10 kΩ resistor.
- S is pulled up to the + pin, so **powered from 5 V, S rises to 5 V**: too much for an ESP32 or Pico GPIO. With a 3.3 V board connect + to 3V3.

## Interface details
Plain digital input, no protocol:
```
S = 1  -> button released
S = 0  -> button held (S shorted to GND)
```
The contacts bounce for a few milliseconds at each press, so debounce (the driver waits for 20 ms of a stable level).

## Wiring
| Module | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| S | GPIO27 | GP15 | GPIO24 (pin 18) |
| + | 3V3 | 3V3(OUT) (pin 36) | 3V3 (pin 1) |
| - | GND | GND | GND (pin 6) |

## Using the driver
```python
from ky004 import KY004
import time
button = KY004(27)              # GPIO wired to S
while True:
    print('Button: %s' % ('PRESSED' if button.pressed() else 'released'))
    time.sleep(0.5)
```
`pressed()` is the debounced state; `raw()` and `is_down()` read the pin instantly; `irq(handler)` calls `handler` on each press (expect several calls per press because of bounce). For a pull-down clone use `KY004(27, active_low=False)`.

## Gotchas
- **Do not power + from 5 V on a 3.3 V board**: the pull-up takes S to the + voltage.
- **Reads inverted, or always the same value?** You may have the pull-down variant; use `active_low=False`.
- **S and - swapped** gives a pin that never changes; check the S and - marks on the silkscreen.
- One press can trigger an interrupt several times; debounce in the handler.

## Datasheet
No chip datasheet exists (passive switch + resistor). Vendor data: https://sensorkit.joy-it.net/en/sensors/ky-004
Pin order and variants: https://arduinomodules.info/ky-004-key-switch-module/ (S, middle +, -; Joy-IT board is the pull-up variant) and the Joy-IT board photo https://sensorkit.joy-it.net/files/files/sensors/KY-004/KY-004.png.
