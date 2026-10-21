---
name: part-sh1106
description: Pinout, electrical limits, wiring and MicroPython driver for the 1.3" 128×64 I2C OLED display (Sino Wealth SH1106 controller). Use when designing, wiring, simulating or writing code for an SH1106 OLED in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# SH1106 1.3" 128×64 OLED display (SH1106)

## Overview
The **SH1106** from Sino Wealth is the controller on most 1.3 inch monochrome 128×64 OLED modules. It looks like the SSD1306 (same I2C control bytes and most of the same commands) but has **132 RAM columns**, of which the 128-pixel panel shows columns 2–129, and it only supports page addressing. Hobbyists buy it as the **AZ-Delivery 1.3 inch OLED I2C Display** and its many 4-pin clones, with an on-board 3.3 V regulator and I2C pull-ups.

## Pinout (AZ-Delivery 1.3" OLED I2C, header order)
| Pin | Function |
|---|---|
| VDD | Supply, 3.0–5.0 V (on-board 3.3 V regulator) |
| GND | Ground |
| SCL | I2C clock (printed "SCK" on the AZ-Delivery board) |
| SDA | I2C data |

Other 1.3" modules (e.g. The Pi Hut's) put **GND first: GND, VCC, SCL, SDA**. Always read the silkscreen; swapping VCC and GND destroys the module.

## Electrical limits
- Module supply: 3.0–5.0 V (absolute max 5.5 V). The chip itself runs its logic at 1.65–3.5 V from the module's regulator.
- Current: up to about 40 mA with every pixel lit (much less for text); under 1 mA asleep (display off).
- I2C up to 400 kHz.

## Interface details
- **I2C address 0x3C** (7-bit 0111100, SA0 low). Some boards have a jumper for 0x3D.
- Each write starts with a control byte: **0x80** = one command byte follows, **0x40** = display data follows to the end of the transfer.
- Init (datasheet power-on flow): AE (off), D5 80, A8 3F, D3 00, 40, AD 8B (built-in DC-DC on), 32 (pump 8.0 V), A1, C8, DA 12, 81 80, D9 22, DB 35, A4, A6, clear RAM, **AF (on), wait 100 ms**.
- Drawing: for each page p = 0…7 send B0+p, then column low 0x02 and high 0x10 (column 2), then 128 data bytes. Each byte is a vertical strip of 8 pixels, LSB at the top (framebuf MONO_VLSB).
- There are no 20h/21h/22h addressing-mode commands: SSD1306 code that relies on them shows a shifted picture with noise down one side.

## Wiring
- ESP32: VDD → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VDD → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VDD → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from sh1106 import SH1106_I2C
i2c = I2C(0, sda=Pin(21), scl=Pin(22), freq=400000)
oled = SH1106_I2C(128, 64, i2c)
oled.text('Hello 1.3in', 0, 0)
oled.show()
```
`SH1106_I2C` is a `framebuf.FrameBuffer`, so `text`, `pixel`, `line`, `rect`, `fill_rect` all work; call `show()` to send the picture. Also `contrast(0–255)`, `invert(True/False)`, `poweroff()`, `poweron()`.

## Gotchas
- Picture shifted by 2 pixels with a stripe of noise: an SSD1306 driver is talking to an SH1106. Use this driver.
- Upside-down or mirrored picture: change A1/C8 to A0/C0 in the init list.
- Nothing on the bus (ENODEV): check SDA/SCL are not swapped and the pin order of your particular board.
- OLEDs burn in; blank or power off the screen when idle.

## Datasheet
https://www.pololu.com/file/0J1813/SH1106.pdf
