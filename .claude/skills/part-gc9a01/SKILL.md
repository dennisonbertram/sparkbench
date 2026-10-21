---
name: part-gc9a01
description: Pinout, electrical limits, wiring and MicroPython driver for the GC9A01 1.28" round 240x240 IPS TFT display (GC9A01). Use when designing, wiring, simulating or writing code for a GC9A01 round display in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# GC9A01 1.28" round IPS TFT display (GC9A01)

## Overview
The **Galaxycore GC9A01** drives a 1.28-inch round 240x240 IPS panel with 65K colours (RGB565). It is written over a 4-line SPI bus (clock, MOSI, CS, D/C) and cannot be read back. Hobbyists buy it as the blue round **MSP1281 1.28inch IPS module** (LCDwiki/QDtech design, sold widely as "GC9A01 round TFT"), which adds a 3.3 V regulator, a backlight transistor and an RC reset.

## Pinout (MSP1281 module, header order)
| Pin | Function |
|---|---|
| GND | Ground |
| VCC | Supply 3.3-5 V (XC6206 3.3 V regulator on board) |
| SCL | SPI clock (not I2C) |
| SDA | SPI MOSI data in (not I2C) |
| RES | Reset, active low (10k pull-up + RC power-on reset) |
| DC | Data/command: low = command, high = data |
| CS | Chip select, active low |
| BLK | Backlight: high/unconnected = on, low = off, PWM to dim (optional) |

## Electrical limits
- Module supply 3.3-5 V; the GC9A01 itself runs at VCI 2.5-3.3 V and IOVCC 1.65-3.3 V.
- **Signal pins are 3.3 V logic only** (100 ohm series resistors, no level shifter). Use level shifters with a 5 V board.
- Current: about 45 mA, most of it the backlight (27.6 mA LED current).
- SPI write clock cycle ≥ 10 ns in the datasheet; 20-40 MHz works in practice, 20 MHz is a safe start.

## Interface details
- SPI mode 0, MSB first. DC low for the command byte, high for its parameters/pixel data.
- Start-up: RES low ≥ 10 µs (driver uses 10 ms), high, wait 120 ms; send the manufacturer panel table (0xEF, 0xEB 0x14, 0xFE, ... gamma 0xF0-0xF3, 0x62-0x74); MADCTL 0x36 = 0x48 (MX + BGR); COLMOD 0x3A = 0x05 (16 bits/pixel); 0x21 inversion on (IPS); Sleep Out 0x11, wait 120 ms; Display On 0x29.
- Drawing: CASET 0x2A (x0, x1 as 16-bit big-endian), RASET 0x2B (y0, y1), then RAMWR 0x2C followed by 2 bytes per pixel, high byte first.
- Only the circle inscribed in the 240x240 square is visible: keep content within about 120 px of the centre (120, 120).

## Wiring
- ESP32: VCC → 3V3, GND → GND, SCL → D18, SDA → D23, CS → D5, DC → D26, RES → D25, BLK unconnected.
- Pico: VCC → 3V3(OUT), GND → GND, SCL → GP18, SDA → GP19, CS → GP17, DC → GP3, RES → GP2.
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, SCL → pin 23 (SCLK), SDA → pin 19 (MOSI), CS → pin 24 (CE0), DC → pin 22, RES → pin 18.

## Using the driver
```python
from machine import Pin, SPI
from gc9a01 import GC9A01, BLACK, WHITE
spi = SPI(1, baudrate=20000000, sck=Pin(18), mosi=Pin(23))
tft = GC9A01(spi, dc=26, cs=5, rst=25)
tft.fill(BLACK)
tft.text('HELLO 42', 88, 116, WHITE)
```

## Gotchas
- SCL/SDA labels are SPI, not I2C: an I2C scan will never find it.
- Video RAM is random at power-up, so the screen shows noise until you fill it.
- MicroPython framebuf stores RGB565 low byte first; swap each colour's bytes (the driver does) or reds and blues come out wrong.
- Colours look inverted? The IPS panel needs inversion ON (0x21); the driver sends it.
- Text in the corners of the square is cut off by the round glass.

## Datasheet
https://www.lcdwiki.com/res/MSP1281/GC9A01_Datasheet_REV.1.0.pdf
