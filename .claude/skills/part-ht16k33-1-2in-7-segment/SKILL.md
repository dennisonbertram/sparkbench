---
name: part-ht16k33-1-2in-7-segment
description: Pinout, electrical limits, wiring and MicroPython driver for the Adafruit 1.2" 4-digit 7-segment display with HT16K33 I2C backpack (HT16K33). Use when designing, wiring, simulating or writing code for an HT16K33 1.2in 7-segment display in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# HT16K33 1.2in 4-digit 7-segment display (HT16K33)

## Overview
A big 4-digit 7-segment LED display (1.2 in / 30 mm digits) with a centre colon, two left-hand dots and a right (AM/PM) dot, driven by a **Holtek HT16K33** LED controller over I2C. Hobbyists buy it as the **Adafruit 1.2" 4-Digit 7-Segment Display w/I2C Backpack** (#1269 yellow, #1270 red, #1268 green). Each segment is two LEDs in series, so the display **needs 5 V**; a separate IO pin sets the I2C logic level.

## Pinout (original Adafruit 5-pin backpack, header order)
| Pin | Function |
|---|---|
| C | I2C clock (SCL), 10 k pull-up to IO |
| D | I2C data (SDA), 10 k pull-up to IO |
| - | Ground |
| + | 5 V supply (4.5–5.5 V); will not run on 3.3 V |
| IO | I2C bus voltage: supplies the SDA/SCL pull-ups. 3.3 V on a 3.3 V board |

Adafruit revised the backpack in 2023 (5 V boost converter, STEMMA QT ports, level shifters). Check the silkscreen on your board; this entry models the original C, D, -, +, IO header.

## Electrical limits
- HT16K33 supply (+): 4.5–5.5 V (datasheet).
- SDA/SCL input high ≥ 0.7 × VDD per the datasheet; Adafruit runs it with IO at 3.3 V for 3.3 V boards.
- Current: up to about 200 mA at full brightness with all segments lit; less at lower brightness.
- I2C up to 400 kHz.

## Interface details
- **I2C address 0x70** (bridge A0/A1/A2 on the back for 0x71–0x77).
- Start-up (HT16K33 datasheet): write **0x21** (system oscillator on), **0x81** (display on, blink off), **0xE0 | level** (brightness 0–15).
- Display RAM: write **0x00** then 16 bytes. Digits are bytes **0, 2, 6, 8** (bit 0–6 = segments a–g, bit 7 = decimal point).
- Byte 4: bit 1 centre colon, bit 2 top-left dot, bit 3 bottom-left dot, bit 4 right (AM/PM) dot.
- Blink: 0x80 | (rate << 1) | 1 with rate 1 = 2 Hz, 2 = 1 Hz, 3 = 0.5 Hz.

## Wiring
- ESP32: + → 5V (VIN), - → GND, IO → 3V3, D → D21, C → D22.
- Pico: + → VBUS, - → GND, IO → 3V3(OUT), D → GP4, C → GP5.
- Raspberry Pi 4: + → pin 2 (5 V), - → pin 6, IO → pin 1 (3.3 V), D → pin 3, C → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from ht16k33_big7seg import BigSeg7x4
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
d = BigSeg7x4(i2c)        # 0x70, full brightness
d.time(12, 34)            # shows 12:34 with the colon
d.number(3.14, 2)         # shows 3.14
d.brightness(4)
```

## Gotchas
- Never connect IO to 5 V on an ESP32 or Pico: the pull-ups would put 5 V on the GPIO pins.
- Leaving IO unconnected removes the I2C pull-ups and the display won't answer.
- Powering + from 3.3 V gives a dark or flickering display: it needs 5 V.
- Nothing lights until the oscillator (0x21) and display-on (0x81) commands are sent.

## Datasheet
https://cdn-shop.adafruit.com/datasheets/ht16K33v110.pdf
