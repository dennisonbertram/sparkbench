---
name: part-sparkfun-qwiic-twist
description: Pinout, electrical limits, wiring and MicroPython driver for the SparkFun Qwiic Twist RGB rotary encoder (DEV-15083, ATtiny84 I2C encoder with RGB LED and push switch). Use when designing, wiring, simulating or writing code for a Qwiic Twist in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# SparkFun Qwiic Twist - RGB Rotary Encoder (DEV-15083)

## Overview
A 24-detent rotary encoder with an RGB LED and a push switch built into the shaft, read over I2C. An **ATtiny84** running SparkFun's firmware counts the detents (signed 16-bit count plus a "difference since last read"), tracks pressed / clicked / moved status and time stamps, sets the knob colour (remembered in EEPROM across power cycles) and drives an open-drain INT line. Two Qwiic connectors plus a 6-pin 0.1" header.

## Pinout (0.1" header, as printed on the back: GND, 3.3V, SDA, SCL, INT, RST)
| Pin | Function |
|---|---|
| GND | Ground |
| 3.3V | Supply, 3.3 V only |
| SDA | I2C data (2.2 kOhm pull-up to 3.3 V on the board) |
| SCL | I2C clock (2.2 kOhm pull-up to 3.3 V on the board) |
| INT | Interrupt output, active low, open drain, 10 kOhm pull-up on the board (optional) |
| RST | ATtiny84 reset, active low (leave unconnected) |

## Electrical limits
- Supply: 3.3 V (SparkFun: "designed to operate at 3.3V, please don't drive it at 5V"). There is no regulator; the ATtiny84 at 8 MHz needs at least 2.7 V.
- Current: a few mA, up to roughly 30 mA with the RGB LED fully white.
- I2C 100/400 kHz.

## Interface details
- **I2C address 0x3F**. Closing the ADR jumper forces **0x3E** (overrides a software address). Any 0x08-0x77 can be stored by writing register 0x18.
- Read: write the register number, then read; the firmware streams bytes from there. 16-bit values are **little-endian**.
- Registers: 0x00 ID = **0x5C**; **0x01 status** (bit 2 clicked, bit 1 pressed now, bit 0 moved; write 0 to clear clicked/moved, pressed is read-only); 0x02/0x03 firmware major/minor; 0x04 interrupt enable (bit 1 button, bit 0 encoder; default both); **0x05 count (int16)**; 0x07 difference (int16, write 0 to clear); 0x09 / 0x0B ms since last turn / button event; **0x0D/0x0E/0x0F red/green/blue 0-255**; 0x10/0x12/0x14 "connect" amounts (int16, colour change per detent); 0x16 turn interrupt timeout ms (default 250); 0x18 I2C address; 0x19 rotation limit (0 = off).

## Wiring
- ESP32: 3.3V → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: 3.3V → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: 3.3V → pin 1, GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from qwiic_twist import QwiicTwist
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
twist = QwiicTwist(i2c)          # checks ID 0x5C
print(twist.count(), twist.pressed())
twist.set_color(0, 0, 255)       # blue knob
if twist.clicked():
    twist.set_count(0)
```
`diff()` returns detents since the last call, `moved()` / `clicked()` read and clear the event flags, `connect_color(r, g, b)` makes the colour follow the knob.

## Gotchas
- SparkFun's Arduino `connectColor()` sends the values big-endian, but the firmware stores them little-endian; this driver sends them little-endian (as `connectRed()` etc. do).
- LED colour and settings are written to EEPROM on every change; don't rewrite the colour in a fast loop.
- The firmware's `isPressed()` in the Arduino library tries to clear the pressed bit, but it is read-only and follows the switch.
- In the Sparkbench simulator the slider sets the count register and the toggle the pressed bit; the difference, click/moved flags, time stamps and LED are not simulated.

## Datasheet
ATtiny84: https://ww1.microchip.com/downloads/en/DeviceDoc/Atmel-7701_Automotive-Microcontrollers-ATtiny24-44-84_Datasheet.pdf ; register map and firmware: https://github.com/sparkfun/Qwiic_Twist ; hookup guide https://learn.sparkfun.com/tutorials/qwiic-twist-hookup-guide/all
