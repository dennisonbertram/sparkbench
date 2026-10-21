---
name: part-reed-switch-module
description: Pinout, electrical limits, wiring and MicroPython driver for the LM393 reed switch sensor module (normally-open reed switch + LM393 comparator, sensitivity trimmer, PWR/DO LEDs, 3-pin VCC/GND/DO). Use when designing, wiring, simulating or writing code for a reed switch / magnetic switch module with comparator in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# LM393 reed switch sensor module (VCC / GND / DO)

## Overview
The blue **reed switch sensor module** (SunFounder / generic "reed sensor module", 32 x 14 mm) carries a glass **normally-open reed switch** on long leads, an **LM393 comparator**, a blue 10 kΩ **trimmer**, a PWR-LED and a DO-LED. Unlike the bare KY-021, the comparator gives a clean, buffered output.
- **DO is HIGH with no magnet and goes LOW (DO-LED lit) while a magnet closes the reed** (active low)
- Magnet within about 1.5 cm of the glass tube
- On/off only: no field strength

## Pinout (3-pin header, as printed)
| Pin | Name | Function |
|---|---|---|
| 1 | VCC | Supply 3.3-5 V |
| 2 | GND | Ground |
| 3 | DO | Digital output: 1 = no magnet, 0 = magnet (10 kΩ pull-up to VCC) |

## Electrical limits
- Supply **3.3-5 V** (vendor rating; the LM393 itself runs on 2-36 V). About 3-6 mA with the LEDs.
- DO is the LM393 open-collector output pulled up to VCC by 10 kΩ: **power from 3.3 V on an ESP32 or Pico** so DO never exceeds 3.3 V.

## Interface details
Circuit (SunFounder schematic): reed switch from the LM393 + input to GND, 10 kΩ pull-up to VCC and 100 nF across the reed; trimmer wiper on the - input.
```
reed open   -> + input = VCC > trimmer -> output off -> DO = 1
reed closed -> + input = 0 V < trimmer -> output low -> DO = 0, DO-LED on
```
The trimmer only needs to sit somewhere between the ends; the reed itself decides. If DO never changes, turn the trimmer to mid-range.

## Wiring
| Module | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| VCC | 3V3 | 3V3(OUT) (pin 36) | 3V3 (pin 1) |
| GND | GND | GND | GND (pin 6) |
| DO | GPIO27 | GP15 | GPIO24 (pin 18) |

## Using the driver
```python
from reed_module import ReedModule
import time
reed = ReedModule(27)           # GPIO wired to DO
while True:
    print('Magnet: %s' % ('YES' if reed.magnet() else 'no'))
    time.sleep(0.5)
```
`magnet()` is debounced (20 ms stable); `raw()` / `closed()` read instantly; `irq(handler)` fires on the falling edge when a magnet arrives.

## Gotchas
- **VCC is pin 1 and DO pin 3**: reversing the header puts the supply on DO.
- Don't power VCC from 5 V with a 3.3 V board (DO is pulled up to VCC).
- The glass reed is fragile; don't bend its leads close to the glass. Hold the magnet alongside the tube.
- Not to be confused with the passive KY-021 (S, +, - order, no comparator).

## Datasheet
LM393: https://www.ti.com/lit/ds/symlink/lm393.pdf
Module schematic, photo and behaviour: https://docs.sunfounder.com/projects/raphael-kit/en/latest/_shared/component/cpn_reed_switch_module.html
