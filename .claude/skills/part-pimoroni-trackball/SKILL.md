---
name: part-pimoroni-trackball
description: Pinout, electrical limits, wiring and MicroPython driver for the Pimoroni Trackball Breakout (PIM447), a mini I2C trackball with click switch and RGBW LEDs read by a Nuvoton MS51XB9AE running Pimoroni's firmware. Use when designing, wiring, simulating or writing code for a Pimoroni trackball in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Pimoroni Trackball Breakout (PIM447)

## Overview
A mini trackball with a dome click switch under the ball and red, green, blue and white LEDs around it. Each of the four rollers spins a small magnet past a Hall-effect sensor. An on-board **Nuvoton MS51XB9AE** (older boards use an N76E003AQ20) running Pimoroni's firmware counts the movement, reads the switch, dims the LEDs and talks I2C. Boards made after April 2024 also have a Qw/ST (Qwiic / STEMMA QT) connector.

## Pinout (5-pin header, as printed on the front, left to right)
| Pin | Function |
|---|---|
| 3-5V | Supply, 3.3-5 V (pin labelled 3-5V; reverse polarity protected) |
| SDA | I2C data (pulled up on the breakout) |
| SCL | I2C clock (pulled up on the breakout) |
| INT | Interrupt output, active low (optional) |
| GND | Ground |

With the supplied right-angle socket it plugs onto Raspberry Pi header pins 1, 3, 5, 7, 9.

## Electrical limits
- Supply: 3.3-5 V ("3.3V or 5V compatible", "5V OK" on the back). Like Pimoroni's other 3-5 V breakouts it keeps its logic at 3.3 V; powering it from 3V3 is the simplest choice.
- Current: a few mA, up to about 20 mA with the LEDs bright.
- I2C: 100 kHz (Pimoroni's Pico library refuses faster; the Raspberry Pi needs 250 kHz or less because of clock stretching).

## Interface details
- **I2C address 0x0A**; cut the ADDR+1 trace on the back for **0x0B**. A new address written to 0xFD is stored in flash.
- Chip ID: registers 0xFA (low) / 0xFB (high) read **0xBA11**. 0xFC = firmware version.
- Registers: 0x00-0x03 LED red/green/blue/white brightness (0-255); **0x04 LEFT, 0x05 RIGHT, 0x06 UP, 0x07 DOWN**: counts rolled since the previous read, cleared when read; **0x08 SWITCH**: bit 7 = pressed now, bits 6-0 = press/release changes since the last read; 0xF9 INT (bit 0 triggered, bit 1 enable the INT pin); 0xFE CTRL (bit 0 sleep, bit 1 reset, bits 2/3 flash read/write).
- Read: register number, then data; the pointer auto-increments, so one 5-byte read from 0x04 gets all four directions and the switch.

## Wiring
- ESP32: 3-5V → 3V3, GND → GND, SDA → D21, SCL → D22 (INT → any input if wanted).
- Pico: 3-5V → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi: plug onto pins 1 (3V3), 3 (SDA), 5 (SCL), 7 (GPIO4 = INT), 9 (GND).

## Using the driver
```python
from machine import I2C, Pin
from trackball import Trackball
i2c = I2C(0, sda=Pin(21), scl=Pin(22), freq=100000)
ball = Trackball(i2c)
ball.set_rgbw(0, 0, 0, 64)
x = y = 0
while True:
    left, right, up, down, changes, pressed = ball.read()
    x += right - left
    y += down - up
```

## Gotchas
- The direction counts reset on every read: poll every 10-50 ms and add them up yourself. Reading registers one at a time and then again loses movement.
- Keep the bus at 100 kHz; faster speeds give read errors with the firmware's clock stretching.
- The firmware drops and raises the interrupt while it writes the new address to flash; the driver waits for that.
- In the Sparkbench simulator each slider is the count the next read returns (the ball kept rolling at that rate); the real chip clears the counters after each read.

## Datasheet
MCU: https://www.nuvoton.com/products/microcontrollers/8bit-8051-mcus/industrial-8051-series/ms51xb9ae/
Register map: https://github.com/pimoroni/trackball-python and https://github.com/pimoroni/pimoroni-pico/tree/main/drivers/trackball
