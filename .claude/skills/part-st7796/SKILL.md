---
name: part-st7796
description: Pinout, electrical limits, wiring and MicroPython driver for the 4.0" ST7796S 320x480 SPI colour TFT module (ST7796 / ST7796S, LCDwiki MSP4020 / MSP4021). Use when designing, wiring, simulating or writing code for an ST7796 display in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# ST7796S 4.0" 320×480 SPI colour TFT (ST7796S)

## Overview
The **ST7796S** from Sitronix is a TFT LCD controller with 320×480×24-bit frame memory. Hobbyists buy it on the red **4.0" SPI TFT module** (LCDwiki MSP4020 without touch, MSP4021 with an XPT2046 resistive touch controller); 3.5" ST7796 modules with the same header are also sold. It is written over 4-wire SPI plus a data/command (DC) line, using 16-bit RGB565 pixels.

## Pinout (MSP4020 14-pin header, pin 1 first)
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
| T_CLK, T_CS, T_DIN, T_DO, T_IRQ | Touch controller pins; not connected on the no-touch MSP4020 |

A separate 4-pin SD-card header (SD_CS, SD_MOSI, SD_MISO, SD_SCK) sits on the other edge; it is not modelled.

## Electrical limits
- VCC 3.3–5 V. Jumper J1 bypasses the regulator: leave it open at 5 V, short it only for 3.3 V.
- **Signal pins are 3.3 V logic** (ST7796S VDDI 1.65–3.3 V); there is no level shifter.
- Up to about 0.93 W (≈ 190 mA at 5 V) without touch, mostly backlight.
- SPI write clock cycle ≥ 66 ns (about 15 MHz); reads ≥ 150 ns.

## Interface details
- SPI mode 0, MSB first; CS low for each transfer; DC low for the command byte, high for its parameters.
- Hardware reset: RESET low, then wait ≥ 5 ms before commands and 120 ms before Sleep Out.
- Init: Software reset 0x01 (wait ≥ 5 ms; 120 ms before Sleep Out), 0xF0 0xC3 / 0xF0 0x96 (unlock command 2), vendor power/gamma settings, **0x3A 0x55** (16-bit pixels; hardware-reset default is 18-bit), 0xF0 0x3C / 0xF0 0x69 (lock), Normal mode 0x13, Sleep Out 0x11 (wait 120 ms), Display On 0x29, then **0x36 0x48** (portrait, BGR panel; 0x28 landscape).
- Drawing: 0x2A column start/end, 0x2B page start/end (16-bit big-endian each), then 0x2C followed by RGB565 pixels, high byte first.

## Wiring
- ESP32: VCC → 5V (or 3V3 with J1 shorted), GND → GND, SCK → GPIO18, SDI(MOSI) → GPIO23, SDO(MISO) → GPIO19, CS → GPIO5, DC/RS → GPIO26, RESET → GPIO25, LED → GPIO27 (or 3V3).
- Pico: VCC → VBUS (5 V), GND → GND, SCK → GP10, SDI(MOSI) → GP11, SDO(MISO) → GP12, CS → GP13, DC/RS → GP3, RESET → GP2, LED → GP6.
- Raspberry Pi: VCC → pin 2 (5 V), GND → pin 6, SCK → pin 23, SDI(MOSI) → pin 19, SDO(MISO) → pin 21, CS → pin 24, DC/RS → GPIO25 (pin 22), RESET → GPIO24 (pin 18), LED → pin 17 (3.3 V).

## Using the driver
```python
from machine import Pin, SPI
from st7796 import ST7796, BLACK, WHITE
Pin(27, Pin.OUT, value=1)                    # backlight
spi = SPI(2, baudrate=10000000, sck=Pin(18), mosi=Pin(23), miso=Pin(19))
tft = ST7796(spi, dc=26, cs=5, rst=25)
tft.fill(BLACK)
tft.text('HELLO ST7796', 20, 40, WHITE)
```

## Gotchas
- White screen with nothing drawn: init never reached the chip (check CS, DC/RS, RESET and SCK/MOSI wiring).
- Black screen: LED pin not high (backlight off).
- Swapped red/blue: MADCTL BGR bit wrong. Odd colours from framebuf images: framebuf RGB565 is little-endian, the ST7796S wants the high byte first — swap bytes.
- LCDwiki's web pin table says DC/RS high = command; the datasheet (and the user manual) say low = command.
- The vendor demo re-locks command 2 with 0xF0 0xC3; the datasheet's lock value is 0x3C (the driver uses 0x3C).
- A full 320×480 fill is 307 KB; redraw only changed areas for speed.
- Never drive the signal pins from 5 V logic.

## Datasheet
https://www.lcdwiki.com/res/MSP4021/ST7796S-Sitronix.pdf
