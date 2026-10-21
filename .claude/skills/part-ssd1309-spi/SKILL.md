---
name: part-ssd1309-spi
description: Pinout, electrical limits, wiring and MicroPython driver for the 2.42" SSD1309 128x64 OLED display in 4-wire SPI mode (7-pin module, LCDwiki MSP242X and clones). Use when designing, wiring, simulating or writing code for an SPI SSD1309 OLED in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# SSD1309 2.42" OLED display 128x64, SPI (SSD1309)

## Overview
The **SSD1309** from Solomon Systech drives a 128x64 monochrome OLED panel. It uses the SSD1306 command set but has **no internal charge pump**, so the module's own boost converter (SX1308) makes the panel supply and an XC6206 regulator makes the 3.3 V logic supply. This part models the **LCDwiki / QDtech MSP242X 2.42inch SPI OLED Module** (MSP242W white, MSP242B blue, MSP242Y yellow), the common 7-pin board that ships in 4-wire SPI mode. The same board is sold under HiLetgo, Teyleten Robot, DWEII and other names as "2.42 inch OLED SSD1309 7 Pin SPI/IIC".

## Pinout (MSP242X 7-pin header, header order)
| Pin | Function |
|---|---|
| GND | Ground (pin 1) |
| VCC | Supply, 3.3-5 V |
| SCL | SPI clock (SSD1309 D0/SCLK) |
| SDA | SPI data in, connect to MOSI (SSD1309 D1/SDIN) |
| RES | Reset, active low |
| DC | Data/command: low = command, high = display data |
| CS | Chip select, active low |

## Electrical limits
- Supply: 3.3-5 V (module spec). The SSD1309 logic runs at 3.3 V behind the module's regulator, and the signal pins go straight to the chip, so use 3.3 V logic.
- Current: 52 mA maximum (module spec), much less with a mostly dark screen.
- SPI clock: cycle time at least 100 ns, so 10 MHz maximum (datasheet table 13-4). The driver uses 8 MHz.
- RES# low pulse at least 3 us (datasheet 8.8).

## Interface details
- 4-wire SPI, write only (no MISO). MSB first, sampled on the SCLK rising edge: SPI mode 0 works. DC is sampled on the 8th clock of each byte.
- Mode select resistors: only R5 fitted = SPI (default); R4 + R9 fitted = I2C. R8 (CS to GND) is not fitted, so CS must be driven.
- Init (module maker's sequence): AE, FD 12, D5 A0, A8 3F, D3 00, 40, 20 00 (horizontal addressing), A1, C8, DA 12, 81 BF, D9 F1, DB 34, A4, A6, then AF. There is no 8Dh (charge pump) command on the SSD1309.
- Frame update: 21 00 7F, 22 00 07 (DC low), then 1024 bytes of data with DC high (vertical bytes, LSB on top).

## Wiring
- ESP32: GND -> GND, VCC -> 3V3, SCL -> D18 (SCK), SDA -> D23 (MOSI), RES -> D25, DC -> D26, CS -> D5.
- Pico: GND -> GND, VCC -> 3V3(OUT), SCL -> GP10 (SPI1 SCK), SDA -> GP11 (SPI1 TX), RES -> GP2, DC -> GP3, CS -> GP13.
- Raspberry Pi 4: GND -> pin 6, VCC -> pin 1 (3.3 V), SCL -> pin 23 (SCLK), SDA -> pin 19 (MOSI), RES -> pin 22, DC -> pin 18, CS -> pin 24 (CE0).

## Using the driver
```python
from machine import Pin, SPI
from ssd1309_spi import SSD1309_SPI
spi = SPI(1, baudrate=8000000, polarity=0, phase=0, sck=Pin(18), mosi=Pin(23))
oled = SSD1309_SPI(128, 64, spi, dc=Pin(26), res=Pin(25), cs=Pin(5))
oled.fill(0)
oled.text('Hello 2.42', 0, 0)
oled.show()
```
`SSD1309_SPI` is a `framebuf.FrameBuffer`, so `text`, `line`, `rect`, `pixel` and the other framebuf drawing calls all work. Call `show()` to send the frame.

## Gotchas
- **GND is the first pin.** Check the silkscreen before you power it.
- The pins are labelled SCL and SDA even in SPI mode. They are the SPI clock and MOSI, not an I2C bus.
- If the screen stays black, check that the board is still in SPI mode (R5 fitted, R4/R9 empty) and lower the SPI rate.
- Do not send SSD1306 charge-pump commands (8Dh 14h). They are not part of the SSD1309 command set.

## Datasheet
https://www.lcdwiki.com/res/MSP242X/SSD1309.pdf
