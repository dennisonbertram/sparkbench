---
name: part-ky-021
description: Pinout, electrical limits, wiring and MicroPython driver for the KY-021 mini magnetic reed switch module (normally-open reed switch with 10 kOhm pull-up, digital output). Use when designing, wiring, simulating or writing code for a KY-021 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# KY-021 mini magnetic reed switch module (KY-021)

## Overview
The **KY-021** (Keyes / Joy-IT sensor-kit board, black, 18.5 x 15 mm, also sold as HW-497) carries a small glass **normally-open reed switch** and a **10 kΩ pull-up resistor** (marked 103). Two ferromagnetic reeds inside the glass tube pull together when a magnet comes near.
- **S is HIGH with no magnet and goes LOW while a magnet closes the reeds** (active low)
- Typical trigger distance 10-20 mm, depending on the magnet and its alignment with the tube
- It is an on/off switch: it does not measure field strength (use the KY-025 or a hall sensor for that)
- No chip, no LED; the switch draws only the pull-up current (0.33 mA at 3.3 V while closed)

## Pinout (3-pin header, as printed on the board)
| Pin | Name | Function |
|---|---|---|
| 1 | S | Signal: 1 = no magnet, 0 = magnet (reed closed) |
| 2 | + (middle) | Supply for the pull-up, 3.3-5 V |
| 3 | - | Ground |

## Electrical limits
- Supply 3.3-5 V (vendor rating). The supply only feeds the 10 kΩ pull-up.
- S is pulled up to the + pin, so **powered from 5 V, S rises to 5 V**: too much for an ESP32 or Pico GPIO. With a 3.3 V board connect + to 3V3.

## Interface details
Plain digital input, no protocol:
```
S = 1  -> reed open   (no magnet)
S = 0  -> reed closed (magnet near, S shorted to GND)
```
The reeds bounce for a few milliseconds at each change, so debounce (the driver waits for 20 ms of a stable level).

## Wiring
| Module | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| S | GPIO27 | GP15 | GPIO24 (pin 18) |
| + | 3V3 | 3V3(OUT) (pin 36) | 3V3 (pin 1) |
| - | GND | GND | GND (pin 6) |

## Using the driver
```python
from ky021 import KY021
import time
reed = KY021(27)              # GPIO wired to S
while True:
    print('Magnet: %s' % ('YES' if reed.magnet() else 'no'))
    time.sleep(0.5)
```
`magnet()` is the debounced "reed closed" state; `raw()` and `closed()` read the pin instantly; `irq(handler)` calls `handler` when the reed closes (expect extra calls from contact bounce).

## Gotchas
- **Do not power + from 5 V on a 3.3 V board**: the pull-up takes S to the + voltage.
- **S and - swapped** gives a pin that never changes; check the S and - marks on the silkscreen.
- The glass tube is fragile: don't bend the reed's leads close to the glass.
- Hold the magnet alongside the tube; end-on or across it may not trip the switch.

## Datasheet
No chip datasheet exists (passive reed switch + resistor). Vendor data: https://sensorkit.joy-it.net/en/sensors/ky-021
Pin order and behaviour: https://arduinomodules.info/ky-021-mini-magnetic-reed-switch-module/ (S, middle +V, -; 10 kΩ on-board resistor; LOW when a magnet is present).
