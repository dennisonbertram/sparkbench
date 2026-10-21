---
name: part-st7735
description: Pinout, electrical limits, wiring and MicroPython driver for the 1.8" 128x160 ST7735S colour TFT display module (Waveshare 1.8inch LCD Module, SPI). Use when designing, wiring, simulating or writing code for an ST7735 / ST7735S TFT in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# ST7735S 1.8" 128x160 colour TFT (ST7735S)

## Overview
The **Sitronix ST7735S** drives a 1.8-inch 128×160 colour TFT (65K colours, RGB565). It takes commands and pixels over a write-only 4-wire SPI bus with a separate data/command (DC) pin. This part is modelled on the **Waveshare 1.8inch LCD Module**: an 8-pin 2.54 mm header (the same signals also go to a PH2.0 cable socket), with a transistor-switched backlight and no voltage regulator.

## Pinout (Waveshare 1.8inch LCD Module, header order)
| Pin | Function |
|---|---|
| VCC | Supply, 3.3 V (feeds the chip's VDD and VDDI directly) |
| GND | Ground |
| DIN | SPI MOSI (the chip's SDA) |
| CLK | SPI clock (the chip's SCL) |
| CS | Chip select, active low |
| DC | Data/command: low = command, high = data (A0 / D/CX) |
| RST | Reset, active low |
| BL | Backlight: high or unconnected = on (10 kΩ pull-up on the board), low = off, PWM to dim (optional) |

## Electrical limits
- ST7735S: VDD 2.5–4.8 V, VDDI (logic) 1.65–3.7 V. The module ties both to VCC, so use **3.3 V** (3.0–3.6 V). The vendor page mentions 5 V, but the schematic has no regulator, and 5 V exceeds the VDDI rating.
- Logic levels follow VCC: 3.3 V GPIO from an ESP32 or Pico is correct.
- Current: about 40 mA, mostly the backlight.
- SPI write clock period ≥ 66 ns (about 15 MHz max); 10 MHz is a safe choice on jumper wires.

## Interface details
- SPI mode 0, MSB first, write-only. Keep CS low for a transfer; DC low for the command byte, high for its parameters/pixels.
- Init (datasheet): RST low ≥ 10 µs, wait 120 ms; SWRESET **0x01** + 120 ms; SLPOUT **0x11** + 120 ms; frame-rate/power/gamma (0xB1–0xB4, 0xC0–0xC5, 0xE0/0xE1); COLMOD **0x3A = 0x05** (16-bit RGB565); MADCTL **0x36** (0x00 portrait, 0x60 landscape); NORON 0x13; DISPON **0x29**.
- Drawing: CASET **0x2A** (x0, x1 as 16-bit), RASET **0x2B** (y0, y1), then RAMWR **0x2C** followed by pixels, 2 bytes each, high byte first.
- The chip's RAM is 132×162 and the glass is 128×160: on this module the visible area starts at **column 2, row 1** in portrait (row 2, column 1 in landscape).

## Wiring
- ESP32: VCC → 3V3, GND → GND, DIN → D23, CLK → D18, CS → D5, DC → D25, RST → D26, BL unconnected (or any GPIO).
- Pico: VCC → 3V3(OUT), GND → GND, DIN → GP19, CLK → GP18, CS → GP17, DC → GP2, RST → GP3 (SPI0).
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, DIN → pin 19 (MOSI), CLK → pin 23 (SCLK), CS → pin 24 (CE0), DC → pin 22, RST → pin 13, BL → pin 12.

## Using the driver
```python
from machine import Pin, SPI
from st7735 import ST7735, YELLOW
spi = SPI(2, baudrate=10000000, sck=Pin(18), mosi=Pin(23))   # Pico: SPI(0, ..., sck=Pin(18), mosi=Pin(19))
tft = ST7735(spi, dc=25, cs=5, rst=26)                       # landscape=True for 160x128
tft.fill(0x0000)
tft.text('HELLO', 10, 10, YELLOW)
tft.fill_rect(10, 30, 50, 20, 0xF800)                        # red box
```

## Gotchas
- A stripe of random pixels along one or two edges means the column/row offset is wrong for your panel; clones vary, so try xoff/yoff of 0 or 2/1.
- Swapped colours (red shows as blue) means the panel is BGR: set MADCTL bit 3 (0x08).
- MicroPython's `framebuf.RGB565` stores pixels low byte first; the driver swaps colours so they reach the chip high byte first.
- A white screen with nothing drawn usually means DC or RST is not wired, or SLPOUT/DISPON were never sent.
- Do not power from 5 V: this module has no regulator.

## Datasheet
https://www.lcdwiki.com/res/MSP1803/ST7735S_V1.1_20111121.pdf
