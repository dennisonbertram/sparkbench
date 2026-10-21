---
name: part-sh1107-featherwing-128x64
description: Pinout, electrical limits, wiring and MicroPython driver for the Adafruit FeatherWing OLED 128x64 (product 4650, Sino Wealth SH1107 controller, I2C 0x3C, STEMMA QT). Use when designing, wiring, simulating or writing code for this SH1107 128x64 OLED in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# SH1107 FeatherWing OLED 128x64 (Adafruit 4650)

## Overview
A 1.3" monochrome **128x64 OLED** on a Feather add-on board, driven by a **Sino Wealth SH1107** over I2C. The SH1107 has 128x128 RAM; the glass shows 128 SEG lines by 64 COM lines starting at **COM 0x60**, so it needs its own init (display offset 0x60). SSD1306 and SH1106 drivers show garbage or nothing. The board also has three buttons (A/B/C), a reset button and a STEMMA QT / Qwiic socket.

## Pinout (STEMMA QT order; the same signals are on the Feather header)
| Pin | Function |
|---|---|
| GND | Ground (Feather GND, STEMMA QT black) |
| 3V | Supply, 3.3 V only (Feather 3V, STEMMA QT red) |
| SDA | I2C data, 2.2 k pull-up to 3V on board (STEMMA QT blue) |
| SCL | I2C clock, 2.2 k pull-up to 3V on board (STEMMA QT yellow) |

RST (Feather header, not modelled): the Feather reset line, tied through closed jumper SJ1 to the OLED reset. The wing has its own APX803 reset supervisor and a 12 k pull-up on the OLED reset, so the 4 wires above are enough; Adafruit's guide suggests also wiring RST to the host's reset on non-Feather boards, which is harmless.

Buttons (not modelled): A/B/C go to Feather pins 9/6/5 (M0/M4/32u4) or 15/32/14 (ESP32). Only B has a 100 k pull-up, so use `Pin.PULL_UP` on A and C.

## Electrical limits
- Supply 3.0–3.5 V: the wing has no regulator; the SH1107 logic (VDD 1.65–3.5 V) and DC-DC input (AVDD 2.4–3.5 V) take the supply directly. Never 5 V.
- About 10 mA with the display on (more with many lit pixels).
- I2C up to 400 kHz.

## Interface details
- **I2C address 0x3C** (0x3D with the ADDR jumper closed). Control byte 0x00 = commands follow, 0x40 = display data follows.
- Init (datasheet commands, Adafruit's values for this board): AE, D5 51, 20 (page mode), 81 4F, AD 8A (DC-DC on), **A0**, **C0**, DC 00, **D3 60**, D9 22, DB 35, **A8 3F**, A4, A6, clear RAM, AF, then wait 100 ms.
- RAM layout: page p (B0h–BFh) bits 0–7 drive SEG 8p…8p+7 = landscape x; the column address (00h–0Fh low nibble, 10h–17h high bits) selects the row, **bottom row first** (column c = row 63 − c). The driver keeps a landscape MONO_HMSB framebuf and transposes it in `show()`.

## Wiring
- ESP32: 3V → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: 3V → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: 3V → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.
- Or a STEMMA QT / Qwiic cable to any 3.3 V Qwiic port.

## Using the driver
```python
from machine import I2C, Pin
from sh1107_featherwing import SH1107_FeatherWing
i2c = I2C(0, sda=Pin(21), scl=Pin(22), freq=400000)
oled = SH1107_FeatherWing(i2c)
oled.fill(0)
oled.text('Hello', 0, 0, 1)
oled.show()
```
It is a `framebuf.FrameBuffer` (128x64, x right, y down with the buttons on the right), so `text`, `line`, `rect`, `fill_rect`, `pixel` and `blit` all work. Call `show()` to send the picture.

## Gotchas
- Using an SSD1306 driver: nothing sensible appears. This chip needs the SH1107 init with offset 0x60.
- Picture upside down or mirrored: the init must use A0 and C0 with offset 0x60, with the bottom row in column 0.
- A full `show()` sends 16 pages of 64 bytes; at 400 kHz that takes about 25 ms.
- On Feathers, button A shares pin 9 with the battery-voltage divider.

## Datasheet
https://www.displayfuture.com/Display/datasheet/controller/SH1107.pdf
