---
name: part-ssd1306-0-66in
description: Pinout, electrical limits, wiring and MicroPython driver for the WEMOS / LOLIN D1 mini OLED 0.66" shield (64x48 SSD1306 I2C OLED, v2.1.0). Use when designing, wiring, simulating or writing code for a 0.66" 64x48 OLED in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# OLED 0.66" 64×48 (SSD1306, WEMOS D1 mini shield)

## Overview
A tiny 64 × 48 pixel monochrome OLED driven by the Solomon Systech **SSD1306** over I2C. Hobbyists buy it as the **WEMOS / LOLIN D1 mini "OLED 0.66 Shield" (v2.1.0)**, a D1 mini shield with two 8-pin headers. The shield only uses **3V3, GND, D1 (SCL) and D2 (SDA)**; it has no regulator (the 5V pin is not connected), so it must be powered from 3.3 V. The current v2.x shield also carries two push-buttons read through a small on-board MCU at I2C address 0x31 (LOLIN I2C button firmware) and a 4-pin SH1.0 I2C connector (GND, SDA, SCL, 3V3).

## Pinout (shield header, P1 pins 1-16 as on the schematic)
| # | Pin | Function |
|---|---|---|
| 1 | RST | Only reaches the OLED reset if solder jumper SJ0 is bridged (open by default; on-board RC reset) |
| 2-7 | A0, D0, D5, D6, D7, D8 | Not connected |
| 8 | 3V3 | Supply, 3.3 V only |
| 9 | 5V | Not connected |
| 10 | G | Ground |
| 11-12 | D4, D3 | Not connected |
| 13 | D2 | I2C SDA (4.7 kΩ pull-up to 3V3 on the shield) |
| 14 | D1 | I2C SCL (4.7 kΩ pull-up to 3V3 on the shield) |
| 15-16 | RX, TX | Not connected |

## Electrical limits
- Supply 3.3 V. SSD1306 VDD is 1.65–3.3 V and the charge pump input VBAT is 3.3–4.2 V; the shield ties both to 3V3, so do **not** feed 5 V into 3V3.
- Current: about 5–20 mA depending on lit pixels; budget 20 mA.
- I2C up to 400 kHz; the 4.7 kΩ pull-ups go to 3.3 V, so the bus is 3.3 V logic.

## Interface details
- **I2C address 0x3C** (SJ1 shorted, default) or **0x3D** (SJ1 cut). The button MCU answers at 0x31 too.
- Control byte: **0x80** = one command follows, **0x40** = data stream.
- The 64-column glass sits in the middle of the controller's 128-column RAM: write columns **32–95** (21h 20h 5Fh) and pages 0–5. Writing from column 0 puts the picture off-screen.
- Init for 48 rows: **A8h 2Fh** (mux 47) and **DAh 12h** (alternative COM pins). Charge pump **8Dh 14h** before AFh, then wait 100 ms.
- RAM bytes are vertical 8-pixel strips, LSB on top (framebuf MONO_VLSB).

## Wiring
- D1 mini (ESP8266): plugs straight on (D1 = GPIO5 SCL, D2 = GPIO4 SDA).
- ESP32: 3V3 → 3V3, G → GND, D2 → GPIO21, D1 → GPIO22.
- Pico: 3V3 → 3V3(OUT), G → GND, D2 → GP4, D1 → GP5.
- Raspberry Pi: 3V3 → pin 1, G → pin 6, D2 → pin 3, D1 → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from ssd1306_64x48 import SSD1306_64x48
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
oled = SSD1306_64x48(i2c)        # 0x3C
oled.fill(0)
oled.text('Hello', 0, 0)         # 8x8 font: 6 lines of 8 characters
oled.show()
```
The stock MicroPython `ssd1306.py` also works: `SSD1306_I2C(64, 48, i2c)` (it applies the 32-column offset itself).

## Gotchas
- Only 8 characters per line and 6 lines (y = 0, 8, … 40) with the 8×8 font.
- Picture missing or shifted → driver wrote from column 0 instead of 32, or was initialised for 64 rows.
- i2c.scan() shows 0x31 as well as 0x3C: that is the button controller, not a second display.
- The buttons are not simulated in Sparkbench; only the display is.

## Datasheet
https://cdn-shop.adafruit.com/datasheets/SSD1306.pdf
