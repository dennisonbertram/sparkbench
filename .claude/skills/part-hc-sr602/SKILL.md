---
name: part-hc-sr602
description: Pinout, electrical limits, wiring and MicroPython driver for the HC-SR602 (MH-SR602 / HW-438) mini PIR motion sensor module. Use when designing, wiring, simulating or writing code for an HC-SR602 / SR602 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# HC-SR602 mini PIR motion sensor (HC-SR602)

## Overview
The **HC-SR602** (sold as MH-SR602, board marked SR602 / HW-438) is a miniature passive-infrared (PIR) motion module: a small round black board with a white Fresnel dome, a digital PIR detector and a 3.3 V regulator.
- **OUT goes high (about 3.3 V) when a warm body moves** in front, low (0 V) otherwise (active high)
- Each trigger holds OUT high for about **2.5 s** (factory setting); a chip resistor sets longer times (5 s ... about 1 h)
- After OUT drops there is about **2 s blocking time** when it ignores motion
- Range up to 5 m (0-3.5 m best), cone about 100°
- Quiescent current about 20 µA

## Pinout (3-pin header)
| Pin | Marking | Name | Function |
|---|---|---|---|
| 1 | OUT | OUT | Motion output: ~3.3 V while triggered, 0 V otherwise |
| 2 | + | VCC | Supply, 3.3-15 V DC |
| 3 | - | GND | Ground |

**OUT is an end pin and + is in the middle**, unlike the HC-SR505/AM312. The extra S+ / S- holes take an optional photodiode for night-only operation and are not part of the header.

## Electrical limits
- Supply: DC 3.3-15 V.
- OUT high is about 3.3 V (from the on-board LDO), so it is safe for 3.3 V GPIOs on any supply.
- Quiescent current about 20 µA.

## Interface details
Plain digital output, active high: no pull resistor needed.
```
OUT = 1  -> motion (held ~2.5 s)
OUT = 0  -> no motion (then ~2 s blocking time)
```
Allow up to a minute after power-up for the sensor to stabilise.

## Wiring
| Module | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| OUT | GPIO25 | GP2 | GPIO17 (pin 11) |
| + (VCC) | 3V3 or 5V | 3V3 (pin 36) or VBUS | 3V3 (pin 1) or 5V (pin 2) |
| - (GND) | GND | GND | GND (pin 6) |

## Using the driver
```python
from hc_sr602 import HCSR602
import time
pir = HCSR602(25)            # GPIO wired to OUT
while True:
    print('MOTION=%d' % pir.motion())
    time.sleep(0.5)
```
`motion()` returns True while OUT is high; `on_change(handler)` calls `handler(True/False)` on each edge.

## Gotchas
- **Pin order**: OUT, +, -. Swapping + and OUT by habit (OUT-in-the-middle modules) feeds the supply into the output; read the silkscreen.
- **Short pulses**: the 2.5 s hold plus 2 s blocking means a fast poll loop sees short pulses; watch rising edges to count events.
- **Warm-up**: readings during the first minute after power-up are unreliable.
- It senses **moving** warm objects only and cannot see through glass; heaters, sunlight and air drafts cause false triggers.

## Datasheet
SR602 datasheet (AZ-Delivery): https://cdn.shopify.com/s/files/1/1509/1638/files/SR602PIR_datasheet.pdf?v=1753359263
Pin order: board photos and the annotated pad diagram at https://www.codrey.com/?p=13542 (silkscreen "OUT + -", signal output next to Power+); timing/current from https://sparks.gogo.co.nz/catalog/Sensors-267/Miniature-PIR-Passive-Infrared-Motion-Sensor-SR602-1147.html
