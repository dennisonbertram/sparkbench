---
name: part-sht35
description: Pinout, electrical limits, wiring and MicroPython driver for the SHT35 high-accuracy temperature & humidity sensor (Sensirion SHT3x-DIS, Seeed Grove SHT35 board). Use when designing, wiring, simulating or writing code for an SHT35 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# SHT35 temperature & humidity sensor (SHT35)

## Overview
The **SHT35-DIS** is the top-accuracy member of Sensirion's SHT3x family: temperature −40 to 125 °C (±0.1 °C typical) and relative humidity 0–100 % (±1.5 % typical), over I2C. Hobbyists usually buy it as the **Seeed Studio Grove - I2C High Accuracy Temp&Humi Sensor (SHT35)** (101020592), which has a 4-pin Grove socket, 10 kΩ SDA/SCL pull-ups and the ADDR pin tied to VCC.

## Pinout (Grove connector, pin 1 to 4)
| Pin | Wire | Function |
|---|---|---|
| SCL | yellow | I2C clock |
| SDA | white | I2C data |
| VCC | red | Supply, 3.3 V or 5 V |
| GND | black | Ground |

ALERT and nRESET go to an unpopulated 2-pin header (J2); not needed for basic use.

## Electrical limits
- Supply: 2.15–5.5 V (no regulator on the board, so the I2C lines run at VCC; use 3.3 V with an ESP32 or Pico).
- Current: up to about 1.5 mA while measuring, 0.2 µA idle.
- I2C up to 1 MHz.

## Interface details
- **I2C address 0x45** on the Grove board (ADDR jumper bridged to VCC). Re-solder the jumper to GND for 0x44. ADDR must never float.
- Single-shot, high repeatability, no clock stretching: write **0x24 0x00**, wait ≥ 15.5 ms, read 6 bytes: T MSB, T LSB, CRC, RH MSB, RH LSB, CRC.
- CRC-8: polynomial 0x31, initial value 0xFF (datasheet example: 0xBEEF → 0x92).
- Temperature: T = −45 + 175 × raw / 65535 °C. Humidity: RH = 100 × raw / 65535 %.
- Soft reset: 0x30 0xA2.

## Wiring
Use a Grove-to-female-jumper cable (the socket is 2 mm pitch, not breadboard-friendly).
- ESP32: VCC → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VCC → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from sht35 import SHT35
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
t, h = SHT35(i2c).read()          # default address 0x45
print('T=%.1fC H=%.0f%%' % (t, h))
```

## Gotchas
- Scanning finds nothing at 0x44: that is expected, the Grove board answers at 0x45.
- A CRC mismatch nearly always means a loose SDA/SCL wire.
- Powering the board from 5 V pulls SDA/SCL up to 5 V; an ESP32 or Pico is not 5 V tolerant, so feed it 3.3 V.
- Keep it away from the regulator and the microcontroller, which warm the air nearby.

## Datasheet
https://sensirion.com/media/documents/213E6A3B/63A5A569/Datasheet_SHT3x_DIS.pdf
