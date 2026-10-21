---
name: part-ili9341
description: Pinout, electrical limits, wiring and MicroPython driver for the 2.8" ILI9341 240x320 SPI colour TFT module (ILI9341, LCDwiki MSP2806 / MSP2807). Use when designing, wiring, simulating or writing code for an ILI9341 display in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# ILI9341 2.8" 240×320 SPI colour TFT (ILI9341)

## Overview
The **ILI9341** from Ilitek is a TFT LCD controller with 240×320×18-bit frame memory. Hobbyists buy it on the red **2.8" SPI TFT module** (LCDwiki MSP2806 without touch, MSP2807 with an XPT2046 touch controller). It is written over 4-wire SPI plus a data/command (DC) line, using 16-bit RGB565 pixels.

## Pinout (MSP2806 14-pin header, pin 1 first)
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
| T_CLK, T_CS, T_DIN, T_DO, T_IRQ | Touch controller pins; not connected on the no-touch MSP2806 |

A separate 4-pin SD-card header (SD_CS, SD_MOSI, SD_MISO, SD_SCK) is unpopulated by default.

## Electrical limits
- VCC 3.3–5 V. Jumper J1 bypasses the regulator: leave it open at 5 V, short it only for 3.3 V.
- **Signal pins are 3.3 V logic** (ILI9341 VDDI 1.65–3.3 V); there is no level shifter.
- About 0.31 W (≈ 60–95 mA), mostly backlight.
- SPI write clock cycle ≥ 100 ns (10 MHz guaranteed by the datasheet; reads ≥ 150 ns).

## Interface details
- SPI mode 0, MSB first; CS low for each transfer; DC low for the command byte, high for its parameters.
- Hardware reset: RESET low ≥ 10 µs, then wait ≥ 5 ms before commands and 120 ms before Sleep Out.
- Init: Software reset 0x01 (wait 120 ms), vendor power/gamma settings, **0x3A 0x55** (16-bit pixels; default is 18-bit), **0x36 0x08** (portrait, BGR panel; 0x68 landscape), Sleep Out 0x11 (wait 120 ms), Display On 0x29.
- Drawing: 0x2A column start/end, 0x2B page start/end (16-bit big-endian each), then 0x2C followed by RGB565 pixels, high byte first.

## Wiring
- ESP32: VCC → 3V3 (or 5V), GND → GND, SCK → GPIO18, SDI(MOSI) → GPIO23, SDO(MISO) → GPIO19, CS → GPIO5, DC/RS → GPIO26, RESET → GPIO25, LED → GPIO27 (or 3V3).
- Pico: VCC → 3V3(OUT), GND → GND, SCK → GP10, SDI(MOSI) → GP11, SDO(MISO) → GP12, CS → GP13, DC/RS → GP3, RESET → GP2, LED → GP6.
- Raspberry Pi: VCC → pin 1, GND → pin 6, SCK → pin 23, SDI(MOSI) → pin 19, SDO(MISO) → pin 21, CS → pin 24, DC/RS → GPIO25 (pin 22), RESET → GPIO24 (pin 18), LED → pin 17 (3.3 V).

## Using the driver
```python
from machine import Pin, SPI
from ili9341 import ILI9341, BLACK, WHITE
Pin(27, Pin.OUT, value=1)                    # backlight
spi = SPI(2, baudrate=10000000, sck=Pin(18), mosi=Pin(23), miso=Pin(19))
tft = ILI9341(spi, dc=26, cs=5, rst=25)
tft.fill(BLACK)
tft.text('HELLO ILI9341', 20, 40, WHITE)
```

## Gotchas
- White screen with nothing drawn: init never reached the chip (check CS, DC/RS, RESET and SCK/MOSI wiring).
- Black screen: LED pin not high (backlight off).
- Swapped red/blue: MADCTL BGR bit wrong. Odd colours from framebuf images: framebuf RGB565 is little-endian, the ILI9341 wants the high byte first — swap bytes.
- LCDwiki's pin table says DC/RS high = register; the datasheet is the other way round (low = command).
- Never drive the signal pins from 5 V logic.

## Datasheet
https://www.lcdwiki.com/res/MSP2807/ILI9341%20Datasheet.pdf
