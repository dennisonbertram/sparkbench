---
name: part-am312
description: Pinout, electrical limits, wiring and MicroPython driver for the AM312 mini PIR motion sensor module (Nanyang Senba AM312 digital pyroelectric sensor). Use when designing, wiring, simulating or writing code for an AM312 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# AM312 mini PIR motion sensor (AM312)

## Overview
The **AM312** from Nanyang Senba is a tiny digital passive-infrared (PIR) sensor: the pyroelectric element, amplifier, filters and decision logic are all inside the TO-5 can. Hobbyists buy it as the **AM312 mini PIR module**: a ~10 mm green board with a small white Fresnel dome, a 3 V LDO regulator and three pins.
- **OUT goes high (about 3 V) when a warm body moves** in front, low otherwise (active high, push-pull)
- Each trigger holds OUT high for about **2.3 s** (fixed, datasheet TOH) and re-triggers while motion continues; after OUT falls it ignores motion for about **2.3 s** (blockade time TOL)
- Sensitivity and timing are **not adjustable**
- Range about 3-5 m, cone up to ~100°
- Very low current: about **15 µA**, ideal for battery projects

## Pinout (3-pin header)
| Pin | Name | Function |
|---|---|---|
| 1 | VCC | Supply, 2.7-12 V (marked "+" on some boards) |
| 2 | OUT | Motion output: ~3 V while motion is detected, 0 V otherwise |
| 3 | GND | Ground (marked "-" on some boards) |

OUT is always the **middle pin**. Many boards have no markings or only tiny "+"/"-" signs; check the polarity before powering, a reversed supply can kill it.

## Electrical limits
- Module supply (VCC): 2.7-12 V. The AM312 chip itself is rated 2.7-3.3 V (absolute max 3.6 V); the module's 3 V LDO makes the higher range possible.
- OUT comes from the chip's 3 V rail (VOH > VDD - 1 V, VOL < 1 V at 10 mA), so it is safe for 3.3 V GPIOs even on a 5 V supply.
- Working current 12-20 µA (15 µA typical).
- Operating temperature -20 to +85 °C (chip).

## Interface details
Plain digital output, active high, push-pull: no pull resistor needed.
```
OUT = 1  -> motion (held ~2.3 s per trigger)
OUT = 0  -> no motion
```
Allow up to a minute after power-up for the sensor to stabilise; it may give a false trigger at first.

## Wiring
| Module | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| VCC | 3V3 (or 5V) | 3V3(OUT) (pin 36) | 3V3 (pin 1) |
| OUT | GPIO4 | GP15 | GPIO17 (pin 11) |
| GND | GND | GND | GND (pin 6) |

## Using the driver
```python
from am312 import AM312
import time
pir = AM312(4)               # GPIO wired to OUT
while True:
    print('MOTION=%d' % pir.motion())
    time.sleep(0.5)
```
`motion()` returns True while OUT is high; `on_change(handler)` calls `handler(True/False)` on each edge.

## Gotchas
- **Polarity**: the markings are tiny or missing. OUT is the middle pin; find "+" before powering.
- **Warm-up**: readings during the first minute after power-up are unreliable.
- It senses **moving** warm objects only: a person sitting still stops triggering after a while.
- Sunlight, heaters and air from vents can cause false triggers; it does not see through glass.
- The 2.3 s hold and 2.3 s blockade mean very short events read as a 2.3 s pulse and a second event right after may be missed; poll at least every second or use `on_change`.
- Supply noise near the lower limit (below ~3 V on VCC, after the LDO's drop) can cause false triggers.

## Datasheet
Nanyang Senba AM312 sensor manual: https://ocw.cs.pub.ro/courses/_media/pm/prj2023/ncaroi/pir_am312_datasheet.pdf
Pin order: vendor pinout (VCC, OUT, GND) from https://probots.co.in/am312-mini-pir-motion-sensor-module.html, middle pin = OUT confirmed at https://forum.mysensors.org/post/67494
