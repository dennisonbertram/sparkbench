---
name: part-ili9488
description: Pinout, electrical limits, wiring and MicroPython driver for the 3.5" ILI9488 480x320 SPI colour TFT module (ILI9488, LCDwiki MSP3520 / MSP3521). Use when designing, wiring, simulating or writing code for an ILI9488 display in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# ILI9488 3.5" 480×320 SPI colour TFT (ILI9488)

## Overview
The **ILI9488** from ILITEK is a TFT LCD controller with a 320×480 frame memory. Hobbyists buy it on the red **3.5" SPI TFT module** (LCDwiki MSP3521 without touch, MSP3520 with an XPT2046 resistive touch controller). It is written over 4-wire SPI plus a data/command (DC) line. **Over SPI it only takes 18-bit RGB666 pixels (3 bytes each) or 3-bit colour, never RGB565.**

## Pinout (MSP3521 14-pin header, pin 1 first)
| Pin | Function |
|---|---|
| VCC | Supply, 3.3–5 V (on-board XC6206 3.3 V regulator) |
| GND | Ground |
| CS | LCD chip select, active low |
| RESET | LCD reset, active low |
| DC/RS | Data/command (D/CX): low = command, high = parameters/pixels |
| SDI(MOSI) | SPI data in |
| SCK | SPI clock |
| LED | Backlight enable (S8050 transistor): high = on |
| SDO(MISO) | SPI data out (only for reads; optional) |
| T_CLK, T_CS, T_DIN, T_DO, T_IRQ | Touch controller pins; not connected on the no-touch MSP3521 |

A separate 4-pin SD-card header (SD_CS, SD_MOSI, SD_MISO, SD_SCK) sits on the other edge; it is not modelled.

## Electrical limits
- VCC 3.3–5 V. Jumper J1 bypasses the regulator: leave it open at 5 V, short it only for 3.3 V.
- **Signal pins are 3.3 V logic** (ILI9488 IOVCC 1.65–3.3 V); there is no level shifter.
- About 0.62 W (≈ 125 mA at 5 V), mostly backlight.
- 4-line SPI write clock cycle ≥ 50 ns (20 MHz max); reads ≥ 150 ns.

## Interface details
- SPI mode 0, MSB first; CS low for each transfer; DC low for the command byte, high for its parameters.
- Hardware reset: RESET low ≥ 10 µs, then wait ≥ 5 ms before commands and 120 ms before Sleep Out.
- Init: Software reset 0x01 (wait ≥ 5 ms; 120 ms before Sleep Out), vendor power/gamma settings (0xF7, 0xC0, 0xC1, 0xC5, 0xB1, 0xB4, 0xB6, 0xB7, 0xBE, 0xE9, 0xE0, 0xE1), **0x3A 0x66** (18-bit pixels; also the reset default), Sleep Out 0x11 (wait 120 ms), Display On 0x29, then **0x36 0x08** (portrait, BGR panel; 0x68 landscape).
- Drawing: 0x2A column start/end, 0x2B page start/end (16-bit big-endian each), then 0x2C followed by 3 bytes per pixel: R, G, B with the 6 colour bits in D7..D2.

## Wiring
- ESP32: VCC → 5V (or 3V3 with J1 shorted), GND → GND, SCK → GPIO18, SDI(MOSI) → GPIO23, SDO(MISO) → GPIO19, CS → GPIO5, DC/RS → GPIO26, RESET → GPIO25, LED → GPIO27 (or 3V3).
- Pico: VCC → VBUS (5 V), GND → GND, SCK → GP10, SDI(MOSI) → GP11, SDO(MISO) → GP12, CS → GP13, DC/RS → GP3, RESET → GP2, LED → GP6.
- Raspberry Pi: VCC → pin 2 (5 V), GND → pin 6, SCK → pin 23, SDI(MOSI) → pin 19, SDO(MISO) → pin 21, CS → pin 24, DC/RS → GPIO25 (pin 22), RESET → GPIO24 (pin 18), LED → pin 17 (3.3 V).

## Using the driver
```python
from machine import Pin, SPI
from ili9488 import ILI9488, BLACK, WHITE
Pin(27, Pin.OUT, value=1)                    # backlight
spi = SPI(2, baudrate=20000000, sck=Pin(18), mosi=Pin(23), miso=Pin(19))
tft = ILI9488(spi, dc=26, cs=5, rst=25)
tft.fill(BLACK)
tft.text('HELLO ILI9488', 20, 40, WHITE)
```
Colours are passed as RGB565 numbers for convenience; the driver expands them to the 3-byte RGB666 the chip needs. `blit666()` takes raw 3-byte-per-pixel buffers.

## Gotchas
- Garbled or wrong colours with ILI9341/ST7789 code: the ILI9488 ignores 16-bit mode on SPI. Send 3 bytes per pixel.
- White screen with nothing drawn: init never reached the chip (check CS, DC/RS, RESET and SCK/MOSI wiring).
- Black screen: LED pin not high (backlight off).
- Swapped red/blue: MADCTL BGR bit wrong.
- LCDwiki's web pin table says DC/RS high = command; the datasheet (and the user manual) say low = command.
- The ILI9488's SDO reportedly does not go high-impedance when CS is high; leave SDO(MISO) off a shared SPI bus (e.g. with the SD card).
- A full 320×480 fill is 461 KB; redraw only changed areas for speed.
- Never drive the signal pins from 5 V logic.

## Datasheet
https://www.displayfuture.com/Display/datasheet/controller/ILI9488.pdf (also hosted by LCDwiki: https://www.lcdwiki.com/res/MSP3520/ILI9488%20Data%20Sheet.pdf)
