---
name: part-hc-sr505
description: Pinout, electrical limits, wiring and MicroPython driver for the HC-SR505 mini PIR motion sensor module. Use when designing, wiring, simulating or writing code for an HC-SR505 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# HC-SR505 mini PIR motion sensor (HC-SR505)

## Overview
The **HC-SR505** is a miniature passive-infrared (PIR) motion module: a 10 x 23 mm green board with a 10 mm white Fresnel dome, the PIR element, its detector IC and a 3.3 V regulator.
- **OUT goes high (about 3.3 V) when a warm body moves** in front, low (0 V) otherwise (active high)
- Each trigger holds OUT high for about **8 s (+/-30 %)**; it is a **repeatable trigger**, so the hold restarts while motion continues
- Sensitivity and hold time are **not adjustable** (unlike the larger HC-SR501)
- Range about 3 m, cone under 100°
- Quiescent current under 60 µA

## Pinout (3-pin header)
| Pin | Marking | Name | Function |
|---|---|---|---|
| 1 | + | VCC | Supply, 4.5-20 V |
| 2 | S / OUT | OUT | Motion output: ~3.3 V while motion is detected, 0 V otherwise |
| 3 | - | GND | Ground |

OUT is always the **middle pin**. Some guides number the pins from the ground end, so go by the + and - marks, not pin numbers.

## Electrical limits
- Supply: DC 4.5-20 V. It does **not** run reliably from 3.3 V; use the 5 V / VBUS pin.
- OUT high is about 3.3 V (from the on-board regulator), so it is safe for 3.3 V GPIOs even on a 5 V or 12 V supply.
- Quiescent current < 60 µA.
- Operating temperature -20 to +80 °C.

## Interface details
Plain digital output, active high: no pull resistor needed.
```
OUT = 1  -> motion (held ~8 s, re-triggered while motion continues)
OUT = 0  -> no motion
```
Allow up to a minute after power-up for the sensor to stabilise; it may give a false trigger at first.

## Wiring
| Module | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| + (VCC) | 5V / VIN | VBUS (pin 40) | 5V (pin 2) |
| OUT | GPIO25 | GP2 | GPIO17 (pin 11) |
| - (GND) | GND | GND | GND (pin 6) |

## Using the driver
```python
from hc_sr505 import HCSR505
import time
pir = HCSR505(25)            # GPIO wired to OUT
while True:
    print('MOTION=%d' % pir.motion())
    time.sleep(0.5)
```
`motion()` returns True while OUT is high; `on_change(handler)` calls `handler(True/False)` on each edge.

## Gotchas
- **Needs 4.5 V or more**: powered from 3V3 it may never trigger or trigger randomly.
- **Polarity**: find the + mark before powering; OUT is the middle pin.
- **Warm-up**: readings during the first minute after power-up are unreliable.
- It senses **moving** warm objects only: a person sitting still stops triggering after a while.
- The ~8 s hold means short events read as an 8 s pulse; to count people, watch for rising edges, not the level.
- Sunlight, heaters, air from vents and a noisy supply can cause false triggers; it does not see through glass.

## Datasheet
HC-SR505 module datasheet: https://robu.in/wp-content/uploads/2017/04/datasheet-1.pdf
Pin order: datasheet wiring photo labels the header "+ S -" (OUT in the middle); pin names confirmed at https://components101.com/sensors/hc-sr505-pir-sensor-pinout-datasheet and https://www.circuits-diy.com/pir-motion-sensor-module-hc-sr505/
