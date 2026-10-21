---
name: part-m5stack-unit-hall
description: Pinout, electrical limits, wiring and MicroPython driver for the M5Stack Unit Hall magnetic sensor (U084, three A3144E unipolar Hall switches ANDed by a 74HC08, Grove connector, active-low output). Use when designing, wiring, simulating or writing code for an M5Stack Hall unit in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# M5Stack Unit Hall (U084, 3x A3144E + 74HC08)

## Overview
The **M5Stack Unit Hall** (SKU U084) is a 32 x 24 mm unit with a 4-pin HY2.0 Grove socket. Inside are **three A3144E unipolar Hall-effect switches**, each pulled up with 820 Ω, feeding a **74HC08D AND gate**, plus an **HT7533** 3.3 V regulator and a red status LED.
- **OUT goes LOW while a magnet is detected** by any of the three switches (south pole toward the front, or north pole toward the back), HIGH (about 3.3 V) otherwise
- Push-pull output from the 74HC08 at 3.3 V: no pull-up needed
- Red LED lights while a magnet is detected
- A3144E switch points: operate 70-350 G, release 50-330 G, about 55 G hysteresis; fast (µs) switching, good for speed counting
- A magnet is included in the box

## Pinout (Grove HY2.0-4P)
| Pin | Name | Wire | Function |
|---|---|---|---|
| 1 | OUT | white | Magnet output: 0 V while a magnet is detected, ~3.3 V otherwise |
| 2 | NC | yellow | Not connected |
| 3 | 5V | red | Supply, 5 V |
| 4 | GND | black | Ground |

## Electrical limits
- Unit supply: 5 V (M5Stack rating) into the HT7533 3.3 V LDO; the Hall switches and the 74HC08 run from 3.3 V.
- OUT is driven by the 74HC08 from 3.3 V, so it is safe for 3.3 V GPIOs.
- Current: about 15 mA typical (3 x 4.4 mA A3144E), up to about 30 mA with a magnet present (820 Ω pull-ups and LED).
- Note: the A3144 datasheet minimum supply is 4.5 V; M5Stack runs it at 3.3 V. It works on this unit, but sensitivity may differ from the datasheet thresholds.

## Interface details
Plain digital output, active low:
```
OUT = 0  -> magnet detected (LED on)
OUT = 1  -> no magnet
```
Only one pole per face works (unipolar): south pole on the front, north pole on the back.

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
from m5_hall import M5Hall
import time
hall = M5Hall(4)            # GPIO wired to OUT (white)
while True:
    print('MAGNET=%d' % hall.magnet())
    time.sleep(0.2)
```
`magnet()` returns True while OUT is low; `on_change(handler)` calls `handler(True/False)` on each edge (handy for RPM counting).

## Gotchas
- **Grove socket, not header pins**: use a Grove-to-female-jumper cable for a breadboard.
- The signal is on the **white** wire; yellow is unconnected.
- **Active low**: `pin.value() == 0` means magnet.
- Nothing happens? Flip the magnet: south pole toward the front, north pole toward the back.

## Datasheet
A3144E (Allegro A3141-A3144): https://m5stack.oss-cn-shenzhen.aliyuncs.com/resource/docs/datasheet/unit/3141Thru3144E_HALL.PDF
Pin order and circuit: M5Stack Unit Hall schematic (J1 pin 1 OUT, 2 IO/NC, 3 VCC, 4 GND) https://static-cdn.m5stack.com/resource/docs/products/unit/hall/hall_sch_01.webp and pin map https://docs.m5stack.com/en/unit/hall
