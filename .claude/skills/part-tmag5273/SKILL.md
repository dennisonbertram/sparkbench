---
name: part-tmag5273
description: Pinout, electrical limits, wiring and MicroPython driver for the TMAG5273 3D linear Hall-effect sensor (Texas Instruments TMAG5273A1, Adafruit TMAG5273 3D Hall Effect Magnetometer Breakout). Use when designing, wiring, simulating or writing code for a TMAG5273 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# TMAG5273 3D Hall-effect sensor (TMAG5273)

## Overview
The **TMAG5273** from Texas Instruments measures the magnetic field along X, Y and Z (A1 version: ±40 or ±80 mT; A2: ±133 or ±266 mT) and its own temperature, and reports them over I2C as 16-bit numbers. It is made for magnets close by (rotary knobs, joysticks, lid/position sensing), not for the Earth's field. Hobbyists buy it on the **Adafruit TMAG5273 3D Hall Effect Magnetometer Breakout** (A1 or A2), which adds a 3.3 V regulator, I2C level shifting, 10 kΩ pull-ups and two STEMMA QT connectors.

## Pinout (Adafruit breakout, header order)
| Pin | Function |
|---|---|
| VIN | Supply 3–5 V (same as your board's logic level) |
| 3Vo | 3.3 V regulator output (up to 100 mA), leave unconnected |
| GND | Ground |
| SCL | I2C clock (level shifted, 10 kΩ pull-up) |
| SDA | I2C data (level shifted, 10 kΩ pull-up) |
| INT | Interrupt output / trigger input, optional |

## Electrical limits
- Chip supply 1.7–3.6 V (absolute max 4 V); the breakout's VIN takes 3–5 V.
- A few mA on the breakout, mostly the power LED and regulator; the chip itself draws only a few mA at most in continuous mode.
- I2C up to 1 MHz (Fast-mode Plus at 2.3–3.6 V).

## Interface details
- **I2C address 0x35** (TMAG5273A1/A2). Other orderables use 0x22 (B), 0x78 (C), 0x44 (D).
- IDs: MANUFACTURER_ID 0x0E/0x0F = 0x49, 0x54; DEVICE_ID 0x0D bits 1-0 = 1 (A1) or 2 (A2).
- Set-up: 0x00 = 0x14 (32x average), 0x02 = 0x70 (X, Y, Z on), 0x03 = 0x00 (±40 mT) or 0x03 (±80 mT), 0x07 = 0x01 (temperature on), 0x01 = 0x12 (low-noise, continuous measure).
- CONV_STATUS 0x18 bit 0 = result ready. Read 8 bytes from 0x10: T, X, Y, Z (16-bit two's complement, MSB first).
- Register-address bit 7 is a conversion trigger in the standard read; keep it 0.
- Field: **B = raw × 2 × range / 65536 mT** (±40 mT → 1.2207 µT/LSB). Temperature: **T = 25 + (raw − 17508) / 58 °C**.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from tmag5273 import TMAG5273
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
x, y, z, t = TMAG5273(i2c).read()
print('X=%.2f Y=%.2f Z=%.2f mT T=%.1fC' % (x, y, z, t))
```
Pass `wide_range=True` for ±80 mT (A1) / ±266 mT (A2). The driver reads DEVICE_ID and scales for A1 or A2 by itself.

## Gotchas
- A strong neodymium magnet held right on the chip easily exceeds ±40 mT: the reading clips. Use the wide range or move the magnet away.
- Steel screws, the breadboard's metal clips and current-carrying wires shift the zero reading; subtract a baseline taken without the magnet.
- The I2C address can be changed in register 0x0C, but it reverts at every power cycle.

## Datasheet
https://www.ti.com/lit/ds/symlink/tmag5273.pdf
