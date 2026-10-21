---
name: part-sht31
description: Pinout, electrical limits, wiring and MicroPython driver for the SHT31 temperature & humidity sensor (Sensirion SHT3x-DIS). Use when designing, wiring, simulating or writing code for an SHT31 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# SHT31 temperature & humidity sensor (SHT31)

## Overview
The **SHT31-DIS** from Sensirion measures temperature (−40 to 125 °C, ±0.2 °C typical) and relative humidity (0–100 %, ±2 % typical). It talks I2C. Hobbyists buy it on an **SHT31-D breakout** with a regulator-free 2.4–5.5 V supply and pull-ups on SDA/SCL.

## Pinout (SHT31-D breakout, header order)
| Pin | Function |
|---|---|
| VIN | Supply, 2.4–5.5 V (3.3 V recommended) |
| GND | Ground |
| SCL | I2C clock |
| SDA | I2C data |
| ADR | Address select: low/unconnected = 0x44, high = 0x45 |
| ALR | Alert output, open-drain (optional) |

## Electrical limits
- Supply: 2.15–5.5 V (chip); the breakout is specified for 2.4–5.5 V.
- Current: about 0.8 mA while measuring, 0.2 µA idle.
- I2C up to 1 MHz.

## Interface details
- **I2C address 0x44** (ADR low), 0x45 (ADR high).
- Single-shot, high repeatability, no clock stretching: write **0x24 0x00**, wait ≥ 15.5 ms, read 6 bytes: T MSB, T LSB, CRC, RH MSB, RH LSB, CRC.
- CRC-8: polynomial 0x31, initial value 0xFF (datasheet example: 0xBEEF → 0x92).
- Temperature: T = −45 + 175 × raw / 65535 °C. Humidity: RH = 100 × raw / 65535 %.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from sht31 import SHT31
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
t, h = SHT31(i2c).read()
print('T=%.1fC H=%.0f%%' % (t, h))
```

## Gotchas
- A CRC mismatch nearly always means a loose SDA/SCL wire.
- Keep it away from the regulator and the microcontroller, which warm the air nearby.
- Two sensors on one bus: tie one board's ADR to VIN (0x45).

## Datasheet
https://sensirion.com/media/documents/213E6A3B/63A5A569/Datasheet_SHT3x_DIS.pdf
