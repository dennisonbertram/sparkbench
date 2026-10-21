---
name: part-sht30
description: Pinout, electrical limits, wiring and MicroPython driver for the SHT30 temperature & humidity sensor (Sensirion SHT30-DIS). Use when designing, wiring, simulating or writing code for an SHT30 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# SHT30 temperature & humidity sensor (SHT30)

## Overview
The **SHT30-DIS** from Sensirion measures temperature (−40 to 125 °C, ±0.2 °C typical) and relative humidity (0–100 %, ±2 % typical). It talks I2C and is the lower-cost member of the SHT3x family (same commands as the SHT31). Modelled here on the **DFRobot Fermion: SHT30 Digital Temperature & Humidity Sensor (SEN0330)**, a regulator-free 2.15–5.5 V breakout with 10 kΩ pull-ups on SDA/SCL.

## Pinout (DFRobot SEN0330, header order)
| Pin | Function |
|---|---|
| VCC | Supply, 2.15–5.5 V (3.3 V recommended) |
| GND | Ground |
| SCL | I2C clock (10 kΩ pull-up to VCC) |
| SDA | I2C data (10 kΩ pull-up to VCC) |
| INT | Alert output (chip ALERT pin), optional |
| RST | Reset, active low, internal pull-up; optional |

## Electrical limits
- Supply: 2.15–5.5 V (chip and board).
- Current: about 0.6 mA while measuring (1.5 mA max), 0.2 µA idle.
- I2C up to 1 MHz.
- The pull-ups go to VCC, so power it from 3.3 V when using an ESP32 or Pico.

## Interface details
- **I2C address 0x45** as shipped on the DFRobot board (ADDR pulled high); jumper J1 to GND gives 0x44. Generic clone modules usually default to 0x44.
- Single-shot, high repeatability, no clock stretching: write **0x24 0x00**, wait ≥ 15.5 ms, read 6 bytes: T MSB, T LSB, CRC, RH MSB, RH LSB, CRC.
- CRC-8: polynomial 0x31, initial value 0xFF (datasheet example: 0xBEEF → 0x92).
- Temperature: T = −45 + 175 × raw / 65535 °C. Humidity: RH = 100 × raw / 65535 %.
- Soft reset: 0x30 0xA2, ready after 1.5 ms.

## Wiring
- ESP32: VCC → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VCC → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from sht30 import SHT30
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
t, h = SHT30(i2c).read()          # SHT30(i2c, 0x44) for ADDR-low boards
print('T=%.1fC H=%.0f%%' % (t, h))
```

## Gotchas
- Nothing at 0x45? Your module may be a clone at 0x44: run `i2c.scan()`.
- A CRC mismatch nearly always means a loose SDA/SCL wire.
- Keep it away from the regulator and the microcontroller, which warm the air nearby.

## Datasheet
https://sensirion.com/media/documents/213E6A3B/63A5A569/Datasheet_SHT3x_DIS.pdf
