---
name: part-ili9163c
description: Pinout, electrical limits, wiring and MicroPython driver for the 1.44" 128x128 ILI9163C colour TFT display module (red "1.44' SPI 128*128 V1.1" clone, SPI). Use when designing, wiring, simulating or writing code for an ILI9163C / ILI9163 TFT in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# ILI9163C 1.44" 128x128 colour TFT (ILI9163C)

## Overview
The **Ilitek ILI9163C** drives a 1.44-inch 128×128 colour TFT (65K colours, RGB565). It takes commands and pixels over a write-only 4-wire SPI bus with a separate data/command pin (A0). This part is modelled on the common **red "1.44' SPI 128*128 V1.1" module**: an 8-pin 2.54 mm header, an on-board 3.3 V LDO with bypass jumper J1, and a backlight fed through a 10 Ω resistor.

## Pinout (red 1.44" ILI9163C module, header order)
| Pin | Function |
|---|---|
| VCC | Supply 3.3–5 V into the on-board 3.3 V LDO |
| GND | Ground |
| CS | Chip select, active low |
| RESET | Reset, active low |
| A0 | Data/command (D/CX): low = command, high = data |
| SDA | SPI MOSI (not I2C despite the name) |
| SCK | SPI clock |
| LED | Backlight through 10 Ω: connect to 3.3 V |

## Electrical limits
- ILI9163C: VDD 2.6–3.3 V, VDDI (logic) 1.65–3.3 V. The LDO makes 3.3 V from VCC (3.3–5 V). Short J1 only when VCC is exactly 3.3 V, never at 5 V.
- Signals are **3.3 V logic only** (no level shifter): fine from an ESP32 or Pico, use a level shifter or divider from 5 V boards.
- Backlight: LED has only a 10 Ω series resistor, so feed it 3.3 V (add ~82–100 Ω for 5 V). Total current about 50 mA.
- SPI write clock period ≥ 66 ns (about 15 MHz); 10 MHz is safe on jumper wires.

## Interface details
- SPI mode 0, MSB first, write-only. CS low for a transfer; A0 low for the command byte, high for its parameters/pixels.
- Init (datasheet): RESET low ≥ 10 µs, wait 120 ms; SWRESET **0x01** + 120 ms; SLPOUT **0x11** + 120 ms; COLMOD **0x3A = 0x05** (16-bit; reset default is 0x66 = 18-bit); gamma/power (0x26, 0xB1, 0xB4, 0xC0, 0xC1, 0xC5, 0xC7); MADCTL **0x36**; NORON 0x13; DISPON **0x29**.
- Drawing: CASET **0x2A** (x0, x1 as 16-bit), PASET **0x2B** (y0, y1), then RAMWR **0x2C** and pixels, 2 bytes each, high byte first.
- The board leaves the chip in 128×160 memory mode while the glass is 128×128, so the visible picture is RAM rows 32–159. MADCTL 0xC8 (default rotation 2) and 0xA8 need no offset; 0x08 needs +32 on rows and 0x68 needs +32 on columns. The panel is BGR, so keep bit 3 set.

## Wiring
- ESP32: VCC → 3V3, GND → GND, CS → D5, RESET → D26, A0 → D25, SDA → D23, SCK → D18, LED → 3V3.
- Pico: VCC → 3V3(OUT), GND → GND, CS → GP17, RESET → GP3, A0 → GP2, SDA → GP19, SCK → GP18 (SPI0), LED → 3V3(OUT).
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, CS → pin 24 (CE0), RESET → pin 13, A0 → pin 22, SDA → pin 19 (MOSI), SCK → pin 23 (SCLK), LED → pin 17 (3.3 V).

## Using the driver
```python
from machine import Pin, SPI
from ili9163c import ILI9163C, YELLOW
spi = SPI(2, baudrate=10000000, sck=Pin(18), mosi=Pin(23))   # Pico: SPI(0, ..., sck=Pin(18), mosi=Pin(19))
tft = ILI9163C(spi, dc=25, cs=5, rst=26)                     # rotation=0..3, default 2 (no RAM offset)
tft.fill(0x0000)
tft.text('HELLO', 10, 10, YELLOW)
tft.fill_rect(10, 30, 50, 20, 0xF800)                        # red box
```

## Gotchas
- A band of garbage 32 pixels tall (or the image cut off) means the row/column offset does not match the MADCTL rotation; the driver's rotation table handles this board.
- Red and blue swapped: MADCTL bit 3 (BGR) is missing.
- MicroPython's `framebuf.RGB565` stores pixels low byte first; the driver swaps colours so they reach the chip high byte first.
- Forgetting COLMOD 0x05 leaves the chip in 18-bit mode: 2-byte pixels then come out as noise.
- Dark screen with text drawn: LED is not connected to 3.3 V.

## Datasheet
https://www.displayfuture.com/Display/datasheet/controller/ILI9163.pdf
