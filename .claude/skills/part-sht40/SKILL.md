---
name: part-sht40
description: Pinout, electrical limits, wiring and MicroPython driver for the SHT40 temperature & humidity sensor (Sensirion SHT4x, also SHT41/SHT45). Use when designing, wiring, simulating or writing code for an SHT40 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# SHT40 temperature & humidity sensor (SHT40)

## Overview
The **SHT40** from Sensirion (SHT4x family) measures temperature (−40 to 125 °C, ±0.2 °C typical) and relative humidity (0–100 %, ±1.8 % typical). It talks I2C at the fixed address 0x44. Hobbyists buy it on the **Adafruit Sensirion SHT40 Temperature & Humidity Sensor - STEMMA QT / Qwiic (#4885)**, which adds a 3.3 V regulator, I2C level shifting and 10 kΩ pull-ups, so it runs from 3.3–5 V. The Adafruit SHT41 and SHT45 boards share the same header and driver.

## Pinout (Adafruit SHT40 #4885, header order)
| Pin | Function |
|---|---|
| VIN | Supply, 3.3–5 V (same voltage as your board's logic) |
| 3Vo | 3.3 V output from the on-board regulator (up to 100 mA); leave unconnected |
| GND | Ground |
| SCL | I2C clock (pull-up and level shifter on board) |
| SDA | I2C data (pull-up and level shifter on board) |

The two STEMMA QT / Qwiic sockets carry the same GND, VIN, SDA, SCL.

## Electrical limits
- Board supply: 3.3–5 V on VIN. The bare chip is 1.08–3.6 V; never feed 5 V to a bare SHT40.
- Current: about 0.32 mA while measuring (0.5 mA max), 0.08 µA idle. The heater draws up to 100 mA.
- I2C up to 1 MHz (Fast-mode Plus).

## Interface details
- **I2C address 0x44**, fixed (SHT40-AD1B).
- Single-shot, high precision: write the single byte **0xFD**, wait ≥ 8.3 ms (10 ms is safe), read 6 bytes: T MSB, T LSB, CRC, RH MSB, RH LSB, CRC. Reading too early gets a NACK.
- Other commands: 0xF6 medium / 0xE0 low precision, 0x89 serial number, 0x94 soft reset.
- CRC-8: polynomial 0x31, initial value 0xFF (datasheet example: 0xBEEF → 0x92).
- Temperature: T = −45 + 175 × raw / 65535 °C.
- Humidity: RH = **−6 + 125** × raw / 65535 % (different from the SHT3x!), then crop to 0–100 %.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from sht40 import SHT40
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
t, h = SHT40(i2c).read()
print('T=%.1fC H=%.0f%%' % (t, h))
```

## Gotchas
- An SHT3x driver will not work: the SHT40 takes a one-byte command (0xFD) and uses a different humidity formula.
- A CRC mismatch nearly always means a loose SDA/SCL wire.
- Only one SHT40 per bus (address fixed at 0x44); use a different variant (0x45/0x46 parts) or a mux for more.
- Keep it away from the regulator and the microcontroller, which warm the air nearby.
- Do not power anything from 3Vo by mistake as an input; it is an output.

## Datasheet
https://sensirion.com/resource/datasheet/sht4x
