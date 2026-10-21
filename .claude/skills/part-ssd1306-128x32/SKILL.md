---
name: part-ssd1306-128x32
description: Pinout, electrical limits, wiring and MicroPython driver for the 0.91" SSD1306 128x32 I2C OLED display module (SSD1306 128x32). Use when designing, wiring, simulating or writing code for a 0.91" 128x32 OLED in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# 0.91" OLED 128×32 (SSD1306 128x32)

## Overview
A tiny monochrome OLED strip, 128 × 32 pixels, driven by the Solomon Systech **SSD1306** controller over I2C. Hobbyists buy it as the generic **0.91" 128x32 I2C OLED module** (4-pin header: GND, VCC, SCL, SDA), sold by ProtoSupplies, HiLetgo, AZ-Delivery and many others. The board carries a 3.3 V regulator, so VCC takes 3.3 V or 5 V, and the SSD1306's internal charge pump makes the panel voltage.

## Pinout (generic 0.91" module, header order)
| Pin | Function |
|---|---|
| GND | Ground |
| VCC | Supply, 3.3–5 V (on-board regulator) |
| SCL | I2C clock |
| SDA | I2C data |

## Electrical limits
- Module supply: 3.3–5 V. The SSD1306 logic itself is 1.65–3.3 V (VDD); the regulator on the module provides it.
- Current: roughly 5–20 mA depending on how many pixels are lit; budget 20 mA.
- I2C fast mode (400 kHz) works; the module's 4.7–10 kΩ pull-ups go to its own 3.3 V rail on most boards.

## Interface details
- **I2C address 0x3C** (SA0 low, fixed on most 0.91" modules; 0x3D would need SA0 high).
- Every write starts with a control byte: **0x80** = one command byte follows, **0x00** = command stream, **0x40** = data stream (GDDRAM bytes).
- 128×32 setup differs from 128×64: **multiplex ratio A8h 1Fh** (31 = 32 rows) and **COM pins DAh 02h** (sequential, no remap). Using the 128×64 value 12h gives every other line blank / stretched text.
- Charge pump: **8Dh 14h** before display on (AFh); the panel needs ~100 ms after AFh.
- RAM is 4 pages × 128 columns; each byte is a vertical strip of 8 pixels, LSB on top (framebuf MONO_VLSB).

## Wiring
- ESP32: VCC → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VCC → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from ssd1306_128x32 import SSD1306_I2C
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
oled = SSD1306_I2C(i2c)          # 128x32 at 0x3C
oled.fill(0)
oled.text('Hello', 0, 0)         # 8x8 font: 4 lines of 16 characters
oled.show()
```
The stock MicroPython `ssd1306.py` also works: `SSD1306_I2C(128, 32, i2c)`.

## Gotchas
- **Check the header labels**: this module is GND-VCC-SCL-SDA, but some 0.96" boards are VCC-GND; a swap can kill it.
- Only 4 text lines (y = 0, 8, 16, 24) fit with the 8×8 font.
- Text looks squashed or every second line missing → driver initialised for 64 rows; pass height 32.
- Nothing shows but i2c.scan() finds 0x3C → `show()` was never called.

## Datasheet
https://cdn-shop.adafruit.com/datasheets/SSD1306.pdf
