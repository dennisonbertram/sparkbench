---
name: part-st7735-0-96
description: Pinout, electrical limits, wiring and MicroPython driver for the 0.96" 80x160 IPS ST7735S colour TFT module (LCDwiki/QDtech MSP0961 and its clones, SPI). Use when designing, wiring, simulating or writing code for a 0.96 inch ST7735 / ST7735S 80x160 TFT in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# ST7735S 0.96" 80x160 IPS colour TFT (ST7735S)

## Overview
The **Sitronix ST7735S** drives a tiny 0.96-inch 80×160 IPS colour TFT (65K colours, RGB565). It takes commands and pixels over a write-only 4-wire SPI bus with a separate data/command (DC) pin. This part is modelled on the **LCDwiki/QDtech MSP0961 0.96inch IPS Module**, the common blue-PCB module sold by many sellers: an 8-pin 2.54 mm header, a transistor-switched backlight with a pull-up, and no voltage regulator.

## Pinout (MSP0961 module, header order)
| Pin | Function |
|---|---|
| GND | Ground |
| VCC | Supply, 3.3 V only (feeds the chip and backlight directly) |
| SCL | SPI clock (SCK) — SPI, not I2C, despite the name |
| SDA | SPI MOSI — SPI, not I2C, despite the name |
| RES | Reset, active low |
| DC | Data/command: low = command, high = data (D/CX) |
| CS | Chip select, active low |
| BLK | Backlight: high or unconnected = on (10 kΩ pull-up on the board), low = off, PWM to dim (optional) |

## Electrical limits
- ST7735S: VDD 2.5–4.8 V, VDDI (logic) 1.65–3.7 V. The module ties both to VCC, and the maker's manual says 3.3 V only: use **3.3 V** (3.0–3.6 V). Never 5 V.
- Logic levels follow VCC: 3.3 V GPIO from an ESP32 or Pico is correct.
- Current: about 30 mA, mostly the backlight (about 23 mA through a 10 Ω resistor).
- SPI write clock period ≥ 66 ns (about 15 MHz max); 10 MHz is a safe choice on jumper wires.

## Interface details
- SPI mode 0, MSB first, write-only. Keep CS low for a transfer; DC low for the command byte, high for its parameters/pixels.
- Init (datasheet + maker's code): RES low ≥ 10 µs, wait 120 ms; SWRESET **0x01** + 120 ms; SLPOUT **0x11** + 120 ms; **INVON 0x21** (IPS glass needs inverted data); frame-rate/power/gamma (0xB1–0xB4, 0xC0–0xC5, 0xE0/0xE1); COLMOD **0x3A = 0x05** (RGB565); MADCTL **0x36 = 0xC8** portrait or **0xA8** landscape (both with BGR bit 3); NORON 0x13; DISPON **0x29**.
- Drawing: CASET **0x2A** (x0, x1 as 16-bit), RASET **0x2B** (y0, y1), then RAMWR **0x2C** followed by pixels, 2 bytes each, high byte first.
- The chip's RAM is 132×162 and the glass is 80×160, centred: the visible area starts at **column 26, row 1** in portrait (**column 1, row 26** in landscape). Because it is centred, mirroring (MX/MY) does not change the offsets.

## Wiring
- ESP32: GND → GND, VCC → 3V3, SCL → D18, SDA → D23, RES → D25, DC → D26, CS → D5, BLK unconnected (or any GPIO).
- Pico: GND → GND, VCC → 3V3(OUT), SCL → GP18, SDA → GP19, RES → GP2, DC → GP3, CS → GP17 (SPI0).
- Raspberry Pi 4: GND → pin 6, VCC → pin 1 (3.3 V), SCL → pin 23 (SCLK), SDA → pin 19 (MOSI), RES → pin 13, DC → pin 22, CS → pin 24 (CE0), BLK → pin 12.

## Using the driver
```python
from machine import Pin, SPI
from st7735_096 import ST7735, YELLOW
spi = SPI(2, baudrate=10000000, sck=Pin(18), mosi=Pin(23))   # Pico: SPI(0, ..., sck=Pin(18), mosi=Pin(19))
tft = ST7735(spi, dc=26, cs=5, rst=25)                       # landscape=True for 160x80
tft.fill(0x0000)
tft.text('HELLO', 4, 10, YELLOW)                             # 10 characters fit per portrait line
tft.fill_rect(10, 30, 50, 20, 0xF800)                        # red box
```

## Gotchas
- Black background shows white and colours look like a negative: INVON 0x21 was not sent (needed for this IPS glass).
- Red and blue swapped: the BGR bit (MADCTL bit 3) is wrong for your panel.
- Random pixels along the edges or the picture cut off: wrong offsets. This module needs 26/1 (portrait); 1.8" drivers use 2/1 and draw off-screen.
- SCL/SDA are SPI pins: wiring them to an I2C bus does nothing.
- MicroPython's `framebuf.RGB565` stores pixels low byte first; the driver swaps colours so they reach the chip high byte first.
- In the Sparkbench simulator the screen is the 80×160 glass without the RAM offsets, so drawings appear shifted; on the real module they appear where the driver puts them.
- Do not power from 5 V: this module has no regulator.

## Datasheet
https://www.lcdwiki.com/res/MSP0961/ST7735S_V1.1_20111121.pdf
