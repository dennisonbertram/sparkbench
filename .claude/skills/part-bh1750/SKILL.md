---
name: part-bh1750
description: Pinout, electrical limits, wiring and MicroPython driver for the BH1750 ambient light sensor (ROHM BH1750FVI, GY-302 module). Use when designing, wiring, simulating or writing code for a BH1750 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# BH1750 ambient light sensor (BH1750FVI)

## Overview
The **BH1750FVI** from ROHM measures illuminance from 1 to 65535 lx and returns it as a 16-bit count over I2C (no calibration maths needed beyond dividing by 1.2). Hobbyists buy it on the blue **GY-302 module**, which adds a 3.3 V regulator, 4.7 k pull-ups on SDA/SCL (to the regulated 3.3 V) and a 4.7 k pull-down on ADDR.

## Pinout (GY-302 module, header order)
| Pin | Function |
|---|---|
| VCC | Module supply, 3-5 V (regulated to 3.3 V on board) |
| GND | Ground |
| SCL | I2C clock |
| SDA | I2C data |
| ADDR | Address select: unconnected/low = 0x23, high (3.3 V) = 0x5C (optional) |

## Electrical limits
- Chip: VCC 2.4-3.6 V (abs. max 4.5 V). Module: 3-5 V on VCC thanks to the on-board regulator.
- Current: 120 µA typ, 190 µA max while measuring; about 1 µA in power-down.
- I2C up to 400 kHz. The bus pull-ups go to 3.3 V, so the module is safe on 3.3 V boards.

## Interface details
- **I2C address 0x23** (ADDR low), 0x5C (ADDR high).
- One opcode per write, each followed by a STOP. Opcodes: Power Down 0x00, Power On 0x01, Reset 0x07 (only in power-on), Continuous H-Res 0x10, One-Time H-Res 0x20, One-Time L-Res 0x23.
- One-time H-resolution reading: write 0x01, write 0x20, wait 180 ms (120 ms typ), read 2 bytes MSB first. The chip powers down by itself afterwards.
- Illuminance: **lux = raw / 1.2** (default MTreg = 69). Datasheet example: 0x8390 → 28067 lx. H-resolution full scale is 65535 / 1.2 = 54612 lx.

## Wiring
- ESP32: VCC → 3V3, GND → GND, SDA → D21, SCL → D22, ADDR unconnected.
- Pico: VCC → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5, ADDR unconnected.
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from bh1750 import BH1750
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
print('Light: %.1f lx' % BH1750(i2c).lux())
```

## Gotchas
- Sending two opcodes in one write does not work; the chip needs a STOP after each.
- ADDR is wired straight to the chip: tie it to 3.3 V for 0x5C, never to 5 V (the chip's absolute maximum is 4.5 V).
- Direct sunlight can exceed 54612 lx and saturate at 65535 counts; lower MTreg (e.g. 31) to extend the range.
- Readings jump around under mains lighting at short measurement times; H-resolution mode (120 ms) averages out 50/60 Hz flicker.

## Datasheet
https://www.elechouse.com/elechouse/images/product/Digital%20light%20Sensor/bh1750fvi-e.pdf
