---
name: part-ssd1306-spi
description: Pinout, electrical limits, wiring and MicroPython driver for the 0.96" SSD1306 128x64 OLED module with 7-pin SPI header (GND VCC D0 D1 RES DC CS). Use when designing, wiring, simulating or writing code for an SPI SSD1306 OLED in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# 0.96" OLED 128x64, SPI (SSD1306 SPI)

## Overview
A monochrome 128 x 64 OLED driven by the Solomon Systech **SSD1306** over **4-wire SPI**. Hobbyists buy it as the generic **0.96" 7-pin SPI OLED module** (blue PCB, header GND, VCC, D0, D1, RES, DC, CS; sold by HiLetgo, DIYmall, AZ-Delivery and many others). The board has a 3.3 V regulator, so VCC takes 3.3-5 V, and the SSD1306's internal charge pump makes the panel voltage. SPI is much faster than the I2C version, so full-screen updates are quick.

## Pinout (generic 7-pin SPI module, header order)
| Pin | Function |
|---|---|
| GND | Ground |
| VCC | Supply, 3.3-5 V (on-board regulator) |
| D0 | SPI clock (SCLK) |
| D1 | SPI data in (MOSI / SDIN) |
| RES | Reset, active low |
| DC | Data/command select: low = command, high = display data |
| CS | Chip select, active low |

## Electrical limits
- Module supply: 3.3-5 V. The SSD1306 logic (VDD) is 1.65-3.3 V from the module's regulator, so drive the signal pins at 3.3 V logic.
- Current: about 20 mA with text; more with most pixels lit.
- SPI clock up to 10 MHz (datasheet tcycle min 100 ns). Write-only: there is no MISO.
- RES low pulse at least 3 us.

## Interface details
- 4-wire SPI, mode 0 (data latched on the rising edge of D0), MSB first.
- DC is sampled with the 8th bit of each byte: **low = command**, **high = GDDRAM data**.
- Power-on: pulse RES low (at least 3 us), then send the init sequence: AE, D5 80, A8 3F, D3 00, 40, **8D 14** (charge pump on), 20 00, A1, C8, DA 12, 81 CF, D9 F1, DB 40, A4, A6, then AF. SEG/COM come on about 100 ms after AF.
- Frame update: 21 00 7F, 22 00 07 (commands), then 1024 data bytes (8 pages x 128 columns, each byte a vertical strip, LSB on top = framebuf MONO_VLSB).

## Wiring
- ESP32 (SPI(1) remapped): GND -> GND, VCC -> 3V3, D0 -> GPIO18, D1 -> GPIO23, RES -> GPIO4, DC -> GPIO16, CS -> GPIO5.
- Pico (SPI0): GND -> GND, VCC -> 3V3(OUT), D0 -> GP18, D1 -> GP19, RES -> GP20, DC -> GP21, CS -> GP17.
- Raspberry Pi 4: GND -> pin 6, VCC -> pin 1 (3.3 V), D0 -> pin 23 (SCLK), D1 -> pin 19 (MOSI), RES -> pin 22 (GPIO25), DC -> pin 18 (GPIO24), CS -> pin 24 (CE0).

## Using the driver
```python
from machine import Pin, SPI
from ssd1306_spi import SSD1306_SPI
spi = SPI(1, baudrate=8000000, polarity=0, phase=0, sck=Pin(18), mosi=Pin(23))
oled = SSD1306_SPI(128, 64, spi, dc=Pin(16), res=Pin(4), cs=Pin(5))
oled.fill(0)
oled.text('Hello SPI', 0, 0)
oled.show()
```
`SSD1306_SPI` is a `framebuf.FrameBuffer`, so `text`, `line`, `rect`, `pixel` and friends work; call `show()` to send the frame. The stock MicroPython `ssd1306.SSD1306_SPI(128, 64, spi, dc, res, cs)` also works with this module.

## Gotchas
- **D0 and D1 are not GPIO numbers**: D0 is the clock, D1 is MOSI.
- RES must be driven (or pulsed) at start-up; leaving it floating gives a blank or garbled screen on many boards.
- Some boards are labelled "I2C/SPI": the back has resistor jumpers (BS0/BS1) that pick the bus. Shipped as 4-wire SPI.
- Some 0.96" SPI OLEDs ship with an SH1106 controller instead; if the image is shifted 2 columns, it is an SH1106.
- Nothing lights at all: the charge pump command (8D 14) was not sent before AF.

## Datasheet
https://cdn-shop.adafruit.com/datasheets/SSD1306.pdf
