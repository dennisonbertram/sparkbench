---
name: part-m5stack-unit-button
description: Pinout, electrical limits, wiring and MicroPython driver for the M5Stack Unit Button (U027, single push button with Grove connector, active-low output). Use when designing, wiring, simulating or writing code for an M5Stack button unit in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# M5Stack Unit Button (U027)

## Overview
The **M5Stack Unit Button** (SKU U027) is a 32 x 24 mm unit with one large push button and a 4-pin HY2.0 Grove socket. There is no chip: per the M5Stack schematic the button shorts the signal line to GND, the line is held up by **R1 10 kOhm to 5 V** and loaded by **R2 20 kOhm to GND**, with **C1 100 nF** for hardware debounce.
- Released: signal about **3.3 V** (5 V x 20k / 30k) - reads 1
- Pressed: signal **0 V** - reads 0 (**active low**)

## Pinout (Grove HY2.0-4P)
| Pin | Name | Wire | Function |
|---|---|---|---|
| 1 | OUT | white | Button signal: ~3.3 V released, 0 V pressed |
| 2 | NC | yellow | Not connected |
| 3 | 5V | red | Supply, 5 V (only feeds the pull-up divider) |
| 4 | GND | black | Ground |

## Electrical limits
- Supply 5 V (Grove). The divider makes the high level 3.0-3.5 V for 4.5-5.25 V supply: safe for 3.3 V GPIOs.
- Do not power from 3.3 V: the high level would be only ~2.2 V, below the ESP32 VIH (0.75 x VDD).
- Current: about 0.17 mA released (through 30 kOhm), 0.5 mA while pressed (5 V across 10 kOhm).
- Output source resistance about 6.7 kOhm: no GPIO pull-down (it would drag the high level down).

## Interface details
Plain digital input, no pull resistor needed.
```
OUT = 1  -> released
OUT = 0  -> pressed
```
C1 smooths contact bounce; the driver also waits 10 ms of stable level.

## Wiring
| Unit | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| 5V (red) | 5V / VIN | VBUS (pin 40) | 5V (pin 2) |
| OUT (white) | GPIO4 | GP15 | GPIO17 (pin 11) |
| NC (yellow) | - | - | - |
| GND (black) | GND | GND | GND (pin 6) |

On an M5Stack Core plug it into **Port B** (white wire = GPIO36).

## Using the driver
```python
from m5_button import M5Button
import time
btn = M5Button(4)          # GPIO wired to OUT (white)
while True:
    print('BUTTON=%s' % ('DOWN' if btn.is_pressed() else 'UP'))
    time.sleep(0.2)
```
`was_pressed()` is True once per press; `irq(handler)` calls `handler(pin)` on press.

## Gotchas
- **Grove socket, not header pins**: use a Grove-to-female-jumper cable for a breadboard.
- Signal is on the **white** wire; yellow is unconnected.
- **Active low**: pressed reads 0.
- Do not turn on Pin.PULL_DOWN; with Pin.PULL_UP the released level rises slightly but stays under 3.6 V.

## Datasheet
M5Stack Unit Button schematic: https://m5stack-doc.oss-cn-shenzhen.aliyuncs.com/804/U027_UNIT_BUTTON_SCHE.pdf
Pin colours: https://docs.m5stack.com/en/unit/button
