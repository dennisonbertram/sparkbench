---
name: part-ssd1309
description: Pinout, electrical limits, wiring and MicroPython driver for the 2.42" SSD1309 128x64 I2C OLED display (SSD1309). Use when designing, wiring, simulating or writing code for an SSD1309 OLED in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# SSD1309 2.42" OLED display 128x64 (SSD1309)

## Overview
The **SSD1309** from Solomon Systech drives a 128x64 monochrome OLED panel. It uses the SSD1306 command set but has **no internal charge pump**, so the module's own boost converter makes the panel supply. Hobbyists buy it as a **2.42" I2C module**. This part models the **DIYables 2.4-inch OLED Display Module SSD1309 128x64**, whose board is marked "2.42OLED-IIC VER:1.1" and has a 4-pin header.

## Pinout (DIYables 2.42OLED-IIC, header order)
| Pin | Function |
|---|---|
| GND | Ground (pin 1, **not** VCC) |
| VDD | Supply, 3.3-5 V |
| SCL | I2C clock |
| SDA | I2C data |

## Electrical limits
- Supply: 3.3-5 V (module). The SSD1309 logic itself runs on 1.65-3.3 V behind the module's regulator.
- Current: about 20 mA showing text. An all-white screen draws far more, around 200 mA on the similar Waveshare 2.42" module.
- RES# low pulse at least 3 us (datasheet 8.8). This module resets itself at power-up.

## Interface details
- **I2C address 0x3C** (jumper at "0X78"). Moving the jumper to "0X7A" gives 0x3D.
- Control byte: 0x00 = command stream, 0x40 = display RAM data stream.
- Init: AE, D5 70, A8 3F, D3 00, 40, 20 00 (horizontal addressing), A1, C8, DA 12, 81 7F, D9 22, DB 34, A4, A6, then AF. There is no 8Dh (charge pump) command on the SSD1309.
- Frame update: 21 00 7F, 22 00 07, then 1024 bytes of data (vertical bytes, LSB on top).

## Wiring
- ESP32: GND -> GND, VDD -> 3V3, SCL -> D22, SDA -> D21.
- Pico: GND -> GND, VDD -> 3V3(OUT), SCL -> GP5, SDA -> GP4.
- Raspberry Pi 4: GND -> pin 6, VDD -> pin 1 (3.3 V), SCL -> pin 5, SDA -> pin 3.

## Using the driver
```python
from machine import I2C, Pin
from ssd1309 import SSD1309_I2C
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
oled = SSD1309_I2C(128, 64, i2c, addr=0x3C)
oled.fill(0)
oled.text('Hello 2.42', 0, 0)
oled.show()
```
`SSD1309_I2C` is a `framebuf.FrameBuffer`, so `text`, `line`, `rect`, `pixel` and the other framebuf drawing calls all work. Call `show()` to send the frame. On boards that have a RES pin, pass `res=Pin(n, Pin.OUT)` to pulse reset first.

## Gotchas
- **GND is the first pin**, unlike most 0.96" OLEDs. Check the silkscreen before you power it.
- The back of the board says (in Chinese) "if you need the ACK reply, short D2". The SSD1309 has separate SDA-in and SDA-out pins, and the acknowledge only reaches SDA when the D2 pads are bridged. MicroPython raises `OSError: ENODEV` on a missing ACK, so bridge D2 if `i2c.scan()` finds nothing.
- Do not send SSD1306 charge-pump commands (8Dh 14h). They are not part of the SSD1309 command set.
- A full-white screen can draw about 200 mA. Keep most of the screen dark if you run from a weak 3.3 V regulator.

## Datasheet
https://files.waveshare.com/wiki/2.42inch-OLED-Module/SSD1309Datasheet.pdf
