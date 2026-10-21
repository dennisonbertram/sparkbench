---
name: part-sh1107-128x128
description: Pinout, electrical limits, wiring and MicroPython driver for the 1.12" 128×128 monochrome I2C OLED (Sino Wealth SH1107 controller, Adafruit #5297 STEMMA QT board). Use when designing, wiring, simulating or writing code for an SH1107 128x128 OLED in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# SH1107 1.12" 128×128 OLED display (SH1107)

## Overview
The **SH1107** from Sino Wealth drives 128×128 monochrome OLED panels. Its RAM is 16 pages × 128 columns, but unlike the SSD1306 the page bits drive the SEG lines and the column address drives the COM lines, and it has its own command set (two-byte DC-DC, offset and start-line commands, 20h/21h addressing modes with no arguments). Hobbyists buy it as the **Adafruit Monochrome 1.12" 128x128 OLED Graphic Display (#5297)**, which adds a 3.3 V regulator, a 12 V boost converter for the panel, level shifters and two STEMMA QT / Qwiic connectors.

## Pinout (Adafruit #5297, header pins 1-8)
Pin numbers follow Adafruit's Eagle board file (JP2 pad 1 = SDA). The silkscreen reads GND ... Data left to right, i.e. pin 8 to pin 1; always wire by the printed label.

| # | Pin | Function |
|---|---|---|
| 1 | Data | I2C SDA (SPI MOSI in SPI mode) |
| 2 | Clk | I2C SCL (SPI SCK in SPI mode) |
| 3 | DC | Printed DC / A0: I2C address select (open = 0x3D, GND = 0x3C); data/command in SPI mode |
| 4 | Rst | Reset, active low; optional (board has a power-on reset chip) |
| 5 | CS | SPI chip select (SPI mode only) |
| 6 | 3Vo | 3.3 V regulator output (about 100 mA spare), leave unconnected |
| 7 | VIN | Supply, 3–5 V (reverse-polarity protected) |
| 8 | GND | Ground |

CS, Rst and DC are diode-isolated inputs with 10 kΩ pull-ups on the board. The two STEMMA QT connectors carry GND, VIN, SDA, SCL in parallel with the header.

## Electrical limits
- Board supply: 3–5 V. The SH1107 logic runs at 3.3 V from the AP2112K regulator; the panel needs 12–14 V, made on the board by a FAN5331 boost.
- Current: about 35 mA typical, up to roughly 80 mA with every pixel lit (panel I_PP up to 18.5 mA at 12 V through the boost). Under 1 mA with the display off.
- SDA/SCL have **10 kΩ pull-ups to VIN** (BSS138 level shifters): feed VIN from 3.3 V when the microcontroller is 3.3 V.
- I2C up to 400 kHz.

## Interface details
- **I2C address 0x3D** by default (SA0 high); 0x3C with the A0 jumper bridged or DC/A0 tied to GND.
- Board ships in I2C mode (jumper J1 open). Bridge J1 for SPI; the STEMMA QT ports then stop working.
- Each write starts with a control byte: **0x00** = command bytes follow, **0x40** = display data follows.
- Init (datasheet + panel maker's power-up example, offset from Adafruit's driver for #5297): AE, D5 51, 81 4F, **AD 8A** (internal DC-DC off; the board has its own 12 V boost), 21 (vertical addressing), A1, C0, DC 00, **D3 00**, D9 22, DB 35, **A8 7F** (128 lines), A4, A6, clear RAM, **AF, wait 100 ms**.
- Drawing: the driver keeps a row-major `MONO_HMSB` frame buffer (16 bytes per pixel row, bit 0 = leftmost pixel). For each row y it sends B0 (page 0), column y (0x00 | y&0x0F, 0x10 | y>>4), then the row's 16 bytes; in vertical addressing mode the page advances after each byte.
- `rotate180(True)` switches to A0 + C8 to turn the picture upside down.

## Wiring
- ESP32: VIN → 3V3, GND → GND, Data → GPIO21, Clk → GPIO22 (or a STEMMA QT cable).
- Pico: VIN → 3V3(OUT), GND → GND, Data → GP4, Clk → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, Data → pin 3, Clk → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from sh1107 import SH1107_I2C
i2c = I2C(0, sda=Pin(21), scl=Pin(22), freq=400000)
oled = SH1107_I2C(128, 128, i2c, addr=0x3D)
oled.text('Hello 128x128', 0, 0)
oled.show()
```
`SH1107_I2C` is a `framebuf.FrameBuffer`, so `text`, `pixel`, `line`, `rect`, `fill_rect` all work; call `show()` to send the picture. Also `contrast(0–255)`, `invert(True/False)`, `rotate180(True/False)`, `poweroff()`, `poweron()`. Pass `res=Pin(n)` to pulse the Rst pin at start-up.

## Gotchas
- Garbage, a stripe or a quarter-screen picture: an SSD1306 or SH1106 driver is talking to an SH1107. Use this driver.
- Picture rolled vertically by 32 or 96 rows: the display offset (D3) is wrong; this board needs 0x00 (the 128×64 FeatherWing uses 0x60).
- Nothing on the bus (ENODEV): the address is 0x3D unless A0 is bridged; check Clk/Data are not swapped and J1 is open.
- Full redraws over I2C take tens of milliseconds; redraw only when something changes.
- OLEDs burn in; blank or power off the screen when idle.

## Datasheet
https://cdn-shop.adafruit.com/product-files/5297/SH1107V2.1.pdf
