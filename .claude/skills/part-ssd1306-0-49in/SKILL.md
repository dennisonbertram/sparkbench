---
name: part-ssd1306-0-49in
description: Pinout, electrical limits, wiring and MicroPython driver for the 0.49" SSD1306 64x32 I2C OLED display module (SSD1306 0.49in). Use when designing, wiring, simulating or writing code for a 0.49" 64x32 OLED in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# 0.49" OLED 64×32 (SSD1306 0.49in)

## Overview
A very small monochrome OLED, 64 × 32 pixels, driven by the Solomon Systech **SSD1306** controller over I2C. Hobbyists buy it as the generic **0.49" 64x32 I2C OLED module** (blue PCB, 4-pin header GND, VCC, SCL, SDA), sold by diymore, HiLetgo and many others. The board carries a small regulator (U2) and 4.7 kΩ I2C pull-ups (R3, R4); the SSD1306's internal charge pump makes the panel voltage.

## Pinout (generic 0.49" module, header order as seen from the front)
| Pin | Function |
|---|---|
| GND | Ground |
| VCC | Supply, 3.3–5 V (on-board regulator) |
| SCL | I2C clock (4.7 kΩ pull-up on the module) |
| SDA | I2C data (4.7 kΩ pull-up on the module) |

## Electrical limits
- Module supply: 3.3–5 V (diymore listing). The SSD1306 logic itself is 1.65–3.3 V (VDD); the regulator on the module provides it.
- Current: a few mA up to ~15 mA with many pixels lit; budget 15 mA.
- Power it from the 3.3 V rail of an ESP32 / Pico so the I2C lines can never be pulled above 3.3 V.

## Interface details
- **I2C address 0x3C** (fixed on this module).
- Every write starts with a control byte: **0x80** = one command byte follows, **0x00** = command stream, **0x40** = data stream (GDDRAM bytes).
- The glass shows only **GDDRAM columns 32–95** (the middle 64 of 128) and 32 rows. Set the column window with **21h 20h 5Fh** before each refresh, otherwise the picture is shifted or cut off.
- **Multiplex ratio A8h 1Fh** (32 rows) and **COM pins DAh 12h** (alternative configuration). DAh 02h (the 128×32 value) gives every other line missing on this panel.
- Charge pump: **8Dh 14h** before display on (AFh); allow ~100 ms after AFh.
- RAM is 4 pages × 64 visible columns; each byte is a vertical strip of 8 pixels, LSB on top (framebuf MONO_VLSB).

## Wiring
- ESP32: VCC → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VCC → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from ssd1306_64x32 import SSD1306_64x32
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
oled = SSD1306_64x32(i2c)        # 64x32 at 0x3C, column offset 32
oled.fill(0)
oled.text('Hello', 0, 0)         # 8x8 font: 4 lines of 8 characters
oled.show()
```
The stock MicroPython `ssd1306.py` (micropython-lib) also works: `SSD1306_I2C(64, 32, i2c)` — it adds the 32-column offset for 64-wide panels itself.

## Gotchas
- **Check the header labels**: the back reads SDA SCL VCC GND, so from the front it is GND-VCC-SCL-SDA. A VCC/GND swap can kill it.
- Only 8 characters per line and 4 lines (y = 0, 8, 16, 24) with the 8×8 font.
- Picture appears shifted / half missing → the driver did not set columns 32–95.
- Nothing shows but i2c.scan() finds 0x3C → `show()` was never called.
- Some 0.49" modules (e.g. Waveshare) use an SSD1315 instead; it accepts the same commands.

## Datasheet
https://cdn-shop.adafruit.com/datasheets/SSD1306.pdf
