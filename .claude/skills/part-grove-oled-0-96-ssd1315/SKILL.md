---
name: part-grove-oled-0-96-ssd1315
description: Pinout, electrical limits, wiring and MicroPython driver for the Seeed Grove - OLED Display 0.96" (SSD1315, 128x64, I2C). Use when designing, wiring, simulating or writing code for a Grove SSD1315 OLED in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Grove - OLED Display 0.96" (SSD1315)

## Overview
The **Solomon Systech SSD1315** drives a 128x64 monochrome OLED panel. It uses the SSD1306 command set and has an **internal charge pump** (turned on with 8Dh 14h). This part models the **Seeed Grove - OLED Display 0.96" (SSD1315)**, a blue Grove board with a 4-pin Grove socket, a 3.3 V regulator (XC6206), a MOSFET I2C level shifter with 4.7 kΩ pull-ups on both sides, a power-on reset circuit and an I2C address jumper.

## Pinout (Grove connector, pin 1 to 4, printed SCL SDA VCC GND)
| Pin | Name | Wire colour | Function |
|-----|------|-------------|----------|
| 1 | SCL | yellow | I2C clock |
| 2 | SDA | white | I2C data |
| 3 | VCC | red | Supply, 3.3-5 V |
| 4 | GND | black | Ground |

Source: Seeed schematic v1.0 (J1: 1 HSCL, 2 HSDA, 3 VCC_IN, 4 GND) and the silkscreen in Seeed's pinout photo.

## Electrical limits
- Module supply 3.3-5 V. The XC6206 regulator makes 3.3 V for the SSD1315's VDD (1.65-3.5 V) and VBAT (3.0-4.5 V).
- SDA/SCL are level shifted to the VCC you supply, so they are safe on 3.3 V and 5 V boards. Pull-ups (4.7 kΩ) are on the board.
- Current: a few mA with little lit; up to about 25-32 mA (VBAT, datasheet IBAT) with the whole screen white.

## Interface details
- **I2C address 0x3C** (jumper "0x78", default). Move the jumper to "0x7A" for 0x3D.
- Control byte: 0x00 = command stream, 0x40 = display RAM data stream.
- Power-on (datasheet 6.9.2): wait at least 20 ms after power, init, 8Dh 14h (charge pump on), AFh; SEG/COM come on 100 ms later.
- Init used: AE, D5 80, A8 3F, D3 00, 40, 20 00, A1, C8, DA 12, 81 7F, D9 22, DB 30, A4, A6, 8D 14, AF.
- Frame update: 21 00 7F, 22 00 07, then 1024 bytes (vertical bytes, LSB on top).
- Power-off: AEh then 8Dh 10h (charge pump off).

## Wiring
Use a Grove-to-female-jumper cable, or a Grove shield I2C port.
- ESP32: SCL -> GPIO22, SDA -> GPIO21, VCC -> 3V3, GND -> GND.
- Pico: SCL -> GP5, SDA -> GP4, VCC -> 3V3(OUT), GND -> GND.
- Raspberry Pi 4: SCL -> pin 5, SDA -> pin 3, VCC -> pin 1 (3.3 V), GND -> pin 6.

## Using the driver
```python
from machine import I2C, Pin
from grove_oled_ssd1315 import SSD1315_I2C
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
oled = SSD1315_I2C(i2c)          # addr=0x3D if the jumper is on 0x7A
oled.fill(0)
oled.text('Hello Grove', 0, 0)
oled.show()
```
`SSD1315_I2C` is a `framebuf.FrameBuffer`, so `text`, `line`, `rect`, `pixel` and the other drawing calls work. Call `show()` to send the frame. `contrast()`, `invert()`, `poweroff()` and `poweron()` are also there.

## Gotchas
- **SCL is pin 1**, not GND or VCC. Follow the Grove wire colours: yellow SCL, white SDA, red VCC, black GND.
- The board has a 2 mm Grove socket, not 2.54 mm header pins. Use a Grove-to-jumper cable on a breadboard.
- MicroPython's stock `ssd1306` driver and U8g2's SSD1306 128x64 driver also work, because the SSD1315 keeps the SSD1306 command set.
- Older Grove OLED 0.96" boards use the SSD1308 (and the 1.12" uses the SH1107G); their init differs.

## Datasheet
https://store.comet.bg/download-file.php?id=25847
