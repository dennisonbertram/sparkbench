---
name: part-lcd2004-i2c
description: Pinout, electrical limits, wiring and MicroPython driver for the LCD2004 20x4 character LCD with a PCF8574 I2C backpack (HD44780-compatible controller, FC-113 / HW-061 backpack). Use when designing, wiring, simulating or writing code for an LCD2004 I2C display in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# LCD2004 I2C 20x4 character LCD (LCD2004 + PCF8574)

## Overview
The **LCD2004** is a 20-character by 4-line character LCD with an HD44780-compatible controller and an LED backlight. Hobbyists buy it with a **PCF8574T I2C backpack** (FC-113 / HW-061 clone) soldered on, so it needs only four wires. The PCF8574 drives the LCD in 4-bit mode: P0 = RS, P1 = RW, P2 = E, P3 = backlight, P4–P7 = D4–D7.

## Pinout (backpack header, order printed on the board)
| Pin | Function |
|---|---|
| GND | Ground |
| VCC | Supply, 5 V (4.5–5.5 V) |
| SDA | I2C data (4.7 kΩ pull-up to VCC on the backpack) |
| SCL | I2C clock (4.7 kΩ pull-up to VCC on the backpack) |

## Electrical limits
- Supply: 5 V (HD44780 4.5–5.5 V; PCF8574 2.5–6 V). At 3.3 V the text is faint or invisible.
- Current: roughly 20–60 mA, almost all of it the backlight.
- I2C up to 100 kHz (PCF8574).

## Interface details
- **I2C address 0x27** (PCF8574T, A0–A2 pads open); **0x3F** if the backpack has a PCF8574AT. Soldering the pads lowers the address.
- There are no registers: every byte written goes straight to the 8 port lines. A nibble is sent by writing it with E high, then with E low (the LCD latches on the falling edge).
- Init (HD44780 datasheet, 4-bit): wait > 40 ms, nibble 0x3, wait > 4.1 ms, 0x3, wait > 100 µs, 0x3, then 0x2; then 0x28 (function set), 0x08, 0x01 (clear, 1.52 ms), 0x06 (entry mode), 0x0C (display on).
- Line starts in display RAM: 0x00, 0x40, 0x14, 0x54. Set the cursor with command 0x80 | address.

## Wiring
- ESP32: VCC → 5V (VIN), GND → GND, SDA → D21, SCL → D22.
- Pico: VCC → VBUS (5 V), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VCC → pin 2 (5 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from lcd2004_i2c import LCD2004
i2c = I2C(0, sda=Pin(21), scl=Pin(22), freq=100000)
lcd = LCD2004(i2c, 0x27, 20, 4)
lcd.move_to(0, 0)
lcd.putstr('Hello, Sparkbench!')
lcd.move_to(3, 3)
lcd.putstr('Count: 42')
```

## Gotchas
- Blank screen or a row of solid blocks: turn the blue contrast trimmer on the backpack.
- Nothing at 0x27? Run `i2c.scan()`; PCF8574AT backpacks answer at 0x3F.
- The backpack's pull-ups go to 5 V. On a 3.3 V board remove them and use 3.3 V pull-ups, or use a level shifter.
- Text longer than 20 characters runs on from row 1 into row 3 (and row 2 into row 4).
- Keep the backlight jumper fitted or the backlight stays dark.

## Datasheet
https://www.sparkfun.com/datasheets/LCD/HD44780.pdf (controller), https://www.ti.com/lit/ds/symlink/pcf8574.pdf (backpack I/O expander)
