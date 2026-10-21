---
name: part-sh1106-spi
description: Pinout, electrical limits, wiring and MicroPython driver for the 1.3" 128x64 SPI OLED display, 7-pin (Sino Wealth SH1106 controller in 4-wire SPI mode, Pololu #3761/#3760 and clones). Use when designing, wiring, simulating or writing code for an SH1106 SPI OLED in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# SH1106 1.3" 128x64 OLED display, SPI (SH1106)

## Overview
The **SH1106** from Sino Wealth is the controller on most 1.3 inch monochrome 128x64 OLED modules. It is close to the SSD1306 but has **132 RAM columns** (the 128-pixel panel shows columns 2-129) and only supports page addressing. The 7-pin modules run it in **4-wire SPI** mode. This part models the **Pololu Graphical OLED Display 128x64, 1.3", White Pixels, SPI, Black PCB (#3761)**, which is the same as the blue-PCB #3760. The many 7-pin 1.3" SH1106 SPI clones work the same way.

## Pinout (Pololu #3761, header order)
| Pin | Function |
|---|---|
| GND | Ground |
| VCC | Supply, 3.1-5.5 V (on-board regulator) |
| CLK | SPI clock (SH1106 D0), 3.3 V logic only |
| MOS | SPI data in, MOSI (SH1106 D1), 3.3 V logic only |
| RES | Reset, active low |
| DC | Data/command (SH1106 A0): low = command, high = display data |
| CS | Chip select, active low |

Clones often print D0/D1 or SCK/SDA instead of CLK/MOS. On these boards SDA is the SPI data input (MOSI), not I2C.

## Electrical limits
- VCC: 3.1-5.5 V. About 40 mA with every pixel lit.
- Signal pins are **3.3 V logic only**. The SH1106 VDD1 maximum is 3.6 V and its inputs allow at most VDD1 + 0.3 V. A 5 V microcontroller needs level shifters.
- SPI clock cycle at least 250 ns (VDD1 2.4-3.5 V), so **4 MHz maximum**.
- RES low pulse at least 10 ms (5 ms at VDD1 >= 2.4 V). The chip is ready within 2 ms after RES goes high.

## Interface details
- SPI mode 0: data is shifted in on the rising edge of the clock, MSB first. DC (A0) is sampled on every 8th clock. Pulling CS high resets the serial interface. The chip cannot be read over SPI.
- Init: AE, D5 80, A8 3F, D3 00, 40, AD 8B (built-in DC-DC), 32, A1, C8, DA 12, 81 80, D9 22, DB 35, A4, A6. Then clear all 132 columns of the 8 pages, send AF and wait 100 ms before sending display data.
- Frame update, for each page p: commands B0+p, 02, 10 (column 2), then 128 data bytes with DC high (vertical bytes, LSB on top).

## Wiring
- ESP32: GND -> GND, VCC -> 3V3, CLK -> D14, MOS -> D13, RES -> D25, DC -> D26, CS -> D15 (SPI(1) = HSPI).
- Pico: GND -> GND, VCC -> 3V3(OUT), CLK -> GP10, MOS -> GP11, RES -> GP2, DC -> GP3, CS -> GP13 (SPI(1)).
- Raspberry Pi 4: GND -> pin 6, VCC -> pin 1 (3.3 V), CLK -> pin 23 (SCLK), MOS -> pin 19 (MOSI), CS -> pin 24 (CE0), DC and RES -> any free GPIO.

## Using the driver
```python
from machine import Pin, SPI
from sh1106_spi import SH1106_SPI
spi = SPI(1, baudrate=4000000, polarity=0, phase=0, sck=Pin(14), mosi=Pin(13))
oled = SH1106_SPI(128, 64, spi, dc=Pin(26), res=Pin(25), cs=Pin(15))
oled.fill(0)
oled.text('Hello SH1106', 0, 0)
oled.show()
```
`SH1106_SPI` is a `framebuf.FrameBuffer`, so `text`, `line`, `rect`, `pixel` and the other framebuf drawing calls all work. Call `show()` to send the frame. `contrast()`, `invert()`, `poweroff()` and `poweron()` are also there.

## Gotchas
- **Not an SSD1306.** The `ssd1306` driver shows a picture shifted by 2 pixels with a garbage stripe, because the SH1106 has 132 columns and no 21h/22h address-window commands. Use `sh1106_spi.py`.
- **Do not drive the signal pins from 5 V logic**, even though VCC accepts 5 V.
- Keep the SPI clock at 4 MHz or below. The driver caps it even if the bus is faster.
- Check the pin order printed on clone boards before you power them. Some put VCC first.
- OLEDs burn in. Blank the screen or call `poweroff()` when nothing needs showing.

## Datasheet
https://www.pololu.com/file/0J1813/SH1106.pdf
