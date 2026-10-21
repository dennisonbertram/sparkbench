---
name: part-ky-020
description: Pinout, electrical limits, wiring and MicroPython driver for the KY-020 ball tilt switch module (metal-ball tilt switch with 10 kOhm pull-up, digital output). Use when designing, wiring, simulating or writing code for a KY-020 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# KY-020 ball tilt switch module (KY-020)

## Overview
The **KY-020** (Keyes / Joy-IT sensor-kit board, black, 19 x 15 mm) carries a small blue **metal-ball tilt switch** and a **10 kΩ pull-up resistor** (marked 103). Inside the switch a metal ball rolls to one end when the board tilts and bridges two contacts.
- **S is HIGH while the contacts are open and goes LOW when the ball closes them** (active low)
- On the common board the contacts close when the header end is raised; mount it so the event you care about closes the switch, or invert the logic
- It is an on/off switch: it does not measure the angle
- No chip, no LED; the switch draws only the pull-up current (0.33 mA at 3.3 V)

## Pinout (3-pin header, as printed on the board)
| Pin | Name | Function |
|---|---|---|
| 1 | S | Signal: 1 = contacts open, 0 = contacts closed (tilted) |
| 2 | + (middle) | Supply for the pull-up, 3.3-5 V |
| 3 | - | Ground |

## Electrical limits
- Supply 3.3-5 V (vendor rating). The supply only feeds the 10 kΩ pull-up.
- S is pulled up to the + pin, so **powered from 5 V, S rises to 5 V**: too much for an ESP32 or Pico GPIO. With a 3.3 V board connect + to 3V3.

## Interface details
Plain digital input, no protocol:
```
S = 1  -> contacts open   (ball away from the contacts)
S = 0  -> contacts closed (ball bridges them, S shorted to GND)
```
The ball bounces for a few milliseconds at each change, so debounce (the driver waits for 50 ms of a stable level).

## Wiring
| Module | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| S | GPIO27 | GP15 | GPIO24 (pin 18) |
| + | 3V3 | 3V3(OUT) (pin 36) | 3V3 (pin 1) |
| - | GND | GND | GND (pin 6) |

## Using the driver
```python
from ky020 import KY020
import time
tilt = KY020(27)              # GPIO wired to S
while True:
    print('Tilt: %s' % ('YES' if tilt.tilted() else 'no'))
    time.sleep(0.5)
```
`tilted()` is the debounced "contacts closed" state; `raw()` and `closed()` read the pin instantly; `irq(handler)` calls `handler` when the contacts close (expect several calls per change because of bounce).

## Gotchas
- **Do not power + from 5 V on a 3.3 V board**: the pull-up takes S to the + voltage.
- **Readings look inverted?** It depends on how the board is mounted; turn it round or invert the test.
- **S and - swapped** gives a pin that never changes; check the S and - marks on the silkscreen.
- Vibration makes the ball chatter; mount the board firmly and debounce.
- For an angle in degrees use an accelerometer (MPU6050, ADXL345).

## Datasheet
No chip datasheet exists (passive switch + resistor). Vendor data: https://sensorkit.joy-it.net/en/sensors/ky-020
Pin order and behaviour: https://arduinomodules.info/ky-020-tilt-switch-module/ (S, middle +, -) and https://protosupplies.com/product/tilt-ball-switch-module/ (10 kΩ pull-up, output low when tilted).
