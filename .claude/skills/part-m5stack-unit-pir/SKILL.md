---
name: part-m5stack-unit-pir
description: Pinout, electrical limits, wiring and MicroPython driver for the M5Stack Unit PIR motion sensor (U004, Nanyang Senba AS312 digital PIR, Grove connector). Use when designing, wiring, simulating or writing code for an M5Stack PIR unit in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# M5Stack Unit PIR (U004, AS312)

## Overview
The **M5Stack Unit PIR** (SKU U004) is a small white unit with a Fresnel dome and a 4-pin HY2.0 Grove socket. Inside is a **Nanyang Senba AS312** digital pyroelectric detector (amplifier, band-pass filter and decision logic in the can) and an **HT7533** 3.3 V regulator.
- **OUT goes high (about 3.3 V) when a warm body moves** in front, low otherwise (active high, push-pull through 1 kΩ)
- Each trigger holds OUT high for about **2 s** (AS312 TOH 2.3 s, fixed) and re-triggers while motion continues; after OUT falls it ignores motion for about **2.3 s** (lock time TOL)
- Sensitivity and timing are **not adjustable**
- Range up to about 5 m, cone under 100°
- Quiescent current under 60 µA

## Pinout (Grove HY2.0-4P)
| Pin | Name | Wire | Function |
|---|---|---|---|
| 1 | OUT | white | Motion output: ~3.3 V while motion is detected, 0 V otherwise |
| 2 | NC | yellow | Not connected |
| 3 | 5V | red | Supply, 5 V |
| 4 | GND | black | Ground |

## Electrical limits
- Unit supply: 5 V (M5Stack rating). The HT7533 makes 3.3 V for the AS312, whose own range is 2.7-3.3 V (absolute max 3.6 V) - never feed the AS312 directly.
- OUT comes from the 3.3 V rail through a 1 kΩ resistor (AS312 VOH > VDD - 1 V, VOL < 1 V at 10 mA), so it is safe for 3.3 V GPIOs.
- AS312 working current 12-20 µA; whole unit under 60 µA.
- Operating temperature -20 to +80 °C (unit).

## Interface details
Plain digital output, active high: no pull resistor needed.
```
OUT = 1  -> motion (held ~2 s per trigger, re-triggerable)
OUT = 0  -> no motion
```
Allow up to a minute after power-up for the detector to stabilise.

## Wiring
| Unit | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| 5V (red) | 5V / VIN | VBUS (pin 40) | 5V (pin 2) |
| OUT (white) | GPIO4 | GP15 | GPIO17 (pin 11) |
| NC (yellow) | - | - | - |
| GND (black) | GND | GND | GND (pin 6) |

On an M5Stack Core plug it into **Port B**: the white wire is GPIO36.

## Using the driver
```python
from m5_pir import M5PIR
import time
pir = M5PIR(4)               # GPIO wired to OUT (white)
while True:
    print('MOTION=%d' % pir.motion())
    time.sleep(0.5)
```
`motion()` returns True while OUT is high; `on_change(handler)` calls `handler(True/False)` on each edge.

## Gotchas
- **Grove socket, not header pins**: use a Grove-to-female-jumper cable for a breadboard.
- The signal is on the **white** wire; yellow is unconnected (opposite of many Seeed Grove modules).
- **Warm-up**: readings during the first minute after power-up are unreliable.
- It senses **moving** warm objects only; a still person stops triggering.
- Sunlight, heaters and vents cause false triggers; it cannot see through glass.
- The ~2 s hold plus ~2.3 s lock time means a second event right after the first may be missed; poll at least every second or use `on_change`.

## Datasheet
Nanyang Senba AS312 sensor manual: https://www.makerguides.com/wp-content/uploads/2024/03/AS312-datasheet.pdf
Pin order: M5Stack Unit PIR schematic J1 (pin 1 out, 2 NC, 3 VCC, 4 GND) https://m5stack-doc.oss-cn-shenzhen.aliyuncs.com/701/UNIT_PIR.pdf and wire colours from https://docs.m5stack.com/en/unit/pir
