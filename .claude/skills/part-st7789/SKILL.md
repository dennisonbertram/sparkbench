---
name: part-st7789
description: Pinout, electrical limits, wiring and MicroPython driver for the 1.3" 240x240 IPS colour TFT with an ST7789 controller (7-pin SPI module, ST7789). Use when designing, wiring, simulating or writing code for an ST7789 display in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# ST7789 1.3" 240×240 IPS colour TFT (ST7789)

## Overview
The **ST7789VW** from Sitronix drives a 240×240 IPS colour LCD (65K colours as RGB565) from a write-only SPI link. Hobbyists buy it as the generic **1.3" 240×240 IPS TFT module with a 7-pin header** (GND VCC SCL SDA RES DC BLK). Chip select is tied low on the board, so the display needs its own SPI bus in **SPI mode 3**.

## Pinout (7-pin module, header order)
| Pin | Function |
|---|---|
| GND | Ground |
| VCC | Supply, 3.3 V only |
| SCL | SPI clock (SCK), not I2C |
| SDA | SPI data in (MOSI), not I2C |
| RES | Reset, active low |
| DC | Data/command: low = command, high = data |
| BLK | Backlight; pulled up on most boards (on when unconnected), PWM to dim |

## Electrical limits
- Chip supply VDD 2.4–3.3 V (absolute max 4.6 V); logic inputs max VDDI + 0.5 V. Run the module from 3.3 V with 3.3 V logic.
- Current: about 20–40 mA, mostly the backlight.
- SPI write clock cycle ≥ 16 ns (about 62 MHz max); 20–40 MHz works with short wires.

## Interface details
- 4-line serial: DC low → command byte, DC high → parameters / pixel data, MSB first.
- Start-up: RES low ≥ 10 µs, wait 120 ms; SWRESET 0x01 (wait 120 ms before Sleep Out); SLPOUT 0x11, wait 120 ms; COLMOD 0x3A = 0x55 (16 bit/pixel); MADCTL 0x36; INVON 0x21 (IPS panel); NORON 0x13; DISPON 0x29.
- Drawing: CASET 0x2A and RASET 0x2B take start and end as 16-bit MSB-first; then RAMWR 0x2C and RGB565 pixels, high byte first.
- RAM is 240×320: rotation 180° needs a row offset of 80, rotation 270° a column offset of 80 (MADCTL 0x00 / 0x60 / 0xC0 / 0xA0).

## Wiring
- ESP32: VCC → 3V3, GND → GND, SCL → D18, SDA → D23, RES → D25, DC → D26, BLK → unconnected (or a GPIO for dimming).
- Pico: VCC → 3V3(OUT), GND → GND, SCL → GP10, SDA → GP11, RES → GP2, DC → GP3 (SPI1).
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, SCL → pin 23 (SCLK), SDA → pin 19 (MOSI), RES → pin 22, DC → pin 18.

## Using the driver
```python
from machine import Pin, SPI
from st7789 import ST7789, WHITE, BLACK
spi = SPI(1, baudrate=20000000, polarity=1, phase=1, sck=Pin(18), mosi=Pin(23))
tft = ST7789(spi, dc=26, rst=25)
tft.fill(BLACK)
tft.text('HELLO ST7789', 20, 40, WHITE, BLACK)
```

## Gotchas
- Screen stays black with the backlight on: wrong SPI mode (use polarity=1, phase=1), or SCL/SDA wired to I2C pins instead of SPI.
- Colours look inverted (white shows black): the panel needs INVON 0x21.
- Picture shifted with a noise band after rotating: missing 80-pixel offset.
- No CS, so nothing else can share this SPI bus.
- MicroPython framebuf stores RGB565 little-endian; swap colour bytes (the driver's text() does) or colours come out wrong.
- 5 V on VCC or the logic pins can kill the controller.

## Datasheet
https://www.rhydolabz.com/documents/33/ST7789.pdf
