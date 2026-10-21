---
name: part-ssd1351
description: Pinout, electrical limits, wiring and MicroPython driver for the 1.5" 128x128 SSD1351 colour OLED display module (Waveshare 1.5inch RGB OLED Module, SPI). Use when designing, wiring, simulating or writing code for an SSD1351 RGB OLED in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# SSD1351 1.5" 128x128 RGB OLED (SSD1351)

## Overview
The **Solomon Systech SSD1351** drives a 1.5-inch 128×128 colour OLED (65K colours as RGB565, or 262K). Each pixel emits its own light, so there is no backlight and black pixels draw no power. It takes commands and pixels over a write-only 4-wire SPI bus with a separate data/command (DC) pin. This part is modelled on the **Waveshare 1.5inch RGB OLED Module**: a 7-pin 2.54 mm header (the same signals also go to a PH2.0 cable socket), an RT9193 3.3 V regulator and an SX1308 boost converter that makes the 13 V panel supply.

## Pinout (Waveshare 1.5inch RGB OLED Module, header order)
| Pin | Function |
|---|---|
| VCC | Supply, 3.3 V or 5 V (regulated to 3.3 V on the board) |
| GND | Ground |
| DIN | SPI MOSI (the chip's SDIN) |
| CLK | SPI clock (the chip's SCLK) |
| CS | Chip select, active low |
| DC | Data/command: low = command, high = data (D/C#) |
| RST | Reset, active low |

## Electrical limits
- VCC 3.3–5 V into the board's regulator. The chip runs at 3.3 V (VCI 2.4–3.5 V) and the panel at 13 V from the on-board boost converter.
- Logic inputs are rated VSS−0.3 V to VDDIO+0.3 V (about 3.6 V): use **3.3 V GPIO only**, even when VCC is 5 V. 3.3 V from an ESP32 or Pico is correct; 5 V Arduino logic is not.
- Current: about 60 mA with a full white screen, about 4 mA when black (at 3.3 V).
- 4-wire SPI clock cycle ≥ 220 ns, so at most about 4.5 MHz (the example uses 4 MHz).

## Interface details
- SPI mode 0, MSB first, write-only. CS low for a transfer; DC low for the command byte, high for its parameters and pixels.
- Reset/power-up (datasheet 8.9): RES# low ≥ 2 µs, then wait 300 ms before the first command. After AFh the panel comes on within 200 ms.
- Init (datasheet + panel maker's example): **FDh 12h**, **FDh B1h** (unlock the A2/B1/B3/BB/BE/C1 commands), AEh, B3h F1h, CAh 7Fh, A2h 00h, A1h 00h, **A0h 74h** (65K colour, RGB order, COM scan 127→0), B5h 00h, ABh 01h, B4h A0h B5h 55h, C1h C8h 80h C8h, C7h 0Fh, B1h 32h, B2h A4h 00h 00h, BBh 17h, B6h 01h, BEh 05h, A6h, clear RAM, **AFh** display on.
- Drawing: **15h** column start/end and **75h** row start/end (one byte each, 0–127), then **5Ch** write RAM followed by pixels, 2 bytes each in RGB565, high byte first.
- C7h sets master contrast (0–15); A7h inverts the display; AEh/AFh switch it off/on.

## Wiring
- ESP32: VCC → 3V3, GND → GND, DIN → D23, CLK → D18, CS → D5, DC → D25, RST → D26.
- Pico: VCC → 3V3(OUT), GND → GND, DIN → GP19, CLK → GP18, CS → GP17, DC → GP2, RST → GP3 (SPI0).
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, DIN → pin 19 (MOSI), CLK → pin 23 (SCLK), CS → pin 24 (CE0), DC → pin 22, RST → pin 13.

## Using the driver
```python
from machine import Pin, SPI
from ssd1351 import SSD1351, YELLOW
spi = SPI(2, baudrate=4000000, sck=Pin(18), mosi=Pin(23))   # Pico: SPI(0, ..., sck=Pin(18), mosi=Pin(19))
oled = SSD1351(spi, dc=25, cs=5, rst=26)
oled.text('HELLO', 10, 10, YELLOW)
oled.fill_rect(10, 30, 50, 20, 0xF800)                      # red box
```

## Gotchas
- Red and blue swapped means bit 2 of the A0h re-map byte is wrong; an upside-down or mirrored picture means bits 1 and 4 are.
- Commands B1h, B3h, BBh, BEh, C1h and A2h are ignored unless FDh B1h was sent first.
- MicroPython's `framebuf.RGB565` stores pixels low byte first; the driver swaps colours so they reach the chip high byte first.
- The BS resistor on the back must be in the 0 position (4-wire SPI). In 3-wire mode DC is unused.
- OLEDs age with use: avoid leaving a bright static image on for days.

## Datasheet
https://files.waveshare.com/upload/a/a7/SSD1351-Revision_1.5.pdf
