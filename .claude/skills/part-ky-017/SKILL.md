---
name: part-ky-017
description: Pinout, electrical limits, wiring and MicroPython driver for the KY-017 tilt switch module (mercury/ball tilt switch with indicator LED and 680 Ohm resistor, digital output). Use when designing, wiring, simulating or writing code for a KY-017 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# KY-017 tilt switch module (KY-017)

## Overview
The **KY-017** (Keyes / Joy-IT sensor-kit board, black, 3-pin header) carries a **tilt switch capsule** (a glass mercury switch on the original Keyes board, a sealed ball capsule on newer Joy-IT boards), a small **indicator LED** and a **680 Ω resistor**.
- The switch sits between **S and GND**; the LED and 680 Ω resistor run from **+ to S**
- **Switch closed: S is shorted to GND (reads 0) and the LED lights.** Switch open: LED off, S floats up towards + (reads 1 with a pull-up)
- The LED path is only a weak pull-up, so **enable the GPIO's internal pull-up** (the driver does)
- On/off only: it does not measure the angle

## Pinout (3-pin header, as printed on the board)
| Pin | Name | Function |
|---|---|---|
| 1 | S | Signal: 0 = switch closed (LED on), 1 = open |
| 2 | + (middle) | Supply for the LED path, 3.3-5 V |
| 3 | - | Ground |

## Electrical limits
- Supply 3.3-5 V (vendor rating).
- Current: about 2 mA at 3.3 V (4-5 mA at 5 V) through the LED while the switch is closed, almost nothing while open.
- S is fed from + through the LED, so **with + at 5 V, a 3.3 V GPIO gets current pushed into it**. With an ESP32 or Pico connect + to 3V3.

## Interface details
Plain digital input, no protocol:
```
S = 1  -> switch open   (LED off; needs the internal pull-up for a clean 1)
S = 0  -> switch closed (S shorted to GND, LED on)
```
The contacts bounce for a few milliseconds at each change, so debounce (the driver waits for 50 ms of a stable level).

## Wiring
| Module | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| S | GPIO27 | GP15 | GPIO24 (pin 18), pull-up on |
| + | 3V3 | 3V3(OUT) (pin 36) | 3V3 (pin 1) |
| - | GND | GND | GND (pin 6) |

## Using the driver
```python
from ky017 import KY017
import time
tilt = KY017(27)              # GPIO wired to S (internal pull-up enabled)
while True:
    print('Tilt: %s' % ('YES' if tilt.tilted() else 'no'))
    time.sleep(0.5)
```
`tilted()` is the debounced "switch closed" state; `raw()` and `closed()` read the pin instantly; `irq(handler)` calls `handler` when the switch closes (expect several calls per change because of bounce).

## Gotchas
- **No internal pull-up?** S then sits about one LED drop below +, which an ESP32 may not read as HIGH; always use `Pin.PULL_UP`.
- **Do not power + from 5 V on a 3.3 V board.**
- **Readings look inverted?** Which way closes the switch depends on how the board is mounted; turn it round or invert the test. The on-board LED shows when the switch is closed.
- Tutorials disagree on the polarity because many copy button code; the LED on = S LOW relation is the reliable check.
- The original capsule contains **mercury**: don't break it, dispose of it as hazardous waste.
- For an angle in degrees use an accelerometer (MPU6050, ADXL345).

## Datasheet
No chip datasheet exists (passive switch + LED + resistor). Vendor data: https://sensorkit.joy-it.net/en/sensors/ky-017 and the Joy-IT SensorKit X40 manual (https://cdn-reichelt.de/documents/datenblatt/A300/SEN-KIT02_ANL.pdf, pages 76-78: pin order Signal, +V, GND; falling edge = detection, works without an external pull-up).
Parts list (680 Ω resistor + LED): https://arduinomodules.info/ky-017-mercury-switch-module/. LED on while the output is low: https://uelectronics.com/producto/sensor-interruptor-mercurio-ky-017/.
