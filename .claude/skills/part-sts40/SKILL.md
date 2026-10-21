---
name: part-sts40
description: Pinout, electrical limits, wiring and MicroPython driver for the STS40 high-accuracy temperature sensor (Sensirion STS4x, MikroE Thermo 24 Click). Use when designing, wiring, simulating or writing code for an STS40 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# STS40 high-accuracy temperature sensor (STS40)

## Overview
The **STS40** from Sensirion is a 4th-generation 16-bit digital temperature sensor: −40 to 125 °C, ±0.2 °C typical accuracy, 0.01 °C resolution and an ultra-low 0.4 µA average current. It talks I2C and protects each reading with a CRC. Hobbyists buy it on the **MikroElektronika Thermo 24 Click (MIKROE-5110)**, a mikroBUS board with the STS40-AD1B (address 0x44), a PCA9306 I2C level translator, a VIO SEL jumper (3V3 default / 5V) and a power LED.

## Pinout (Thermo 24 Click, two 8-pin mikroBUS headers)
| Left header | Function | Right header | Function |
|---|---|---|---|
| AN | not connected | PWM | not connected |
| RST | not connected | INT | not connected |
| CS | not connected | RX | not connected |
| SCK | not connected | TX | not connected |
| MISO | not connected | SCL | I2C clock (via PCA9306) |
| MOSI | not connected | SDA | I2C data (via PCA9306) |
| 3V3 | Supply, 3.3 V (powers the sensor) | 5V | only used as logic level with VIO SEL on 5V |
| GND | Ground | GND | Ground |

Only 3V3, GND, SCL and SDA are needed. Wire them with jumper leads.

## Electrical limits
- Sensor supply: 1.08–3.6 V. The 3V3 pin feeds the sensor directly: never put 5 V on it.
- Current: 320 µA typical (500 µA max) while measuring, 80 nA idle; the power LED draws more than the sensor.
- I2C standard, fast and fast-mode plus. Keep VIO SEL in the left (3V3) position for 3.3 V boards.

## Interface details
- **I2C address 0x44**, fixed in the chip (STS40-AD1B; other variants BD1B = 0x45, CD1B = 0x46).
- Single-shot measurement: write **0xFD** (high repeatability, max 8.3 ms), **0xF6** (medium, 4.5 ms) or **0xE0** (low, 1.6 ms), wait, then read 3 bytes: T MSB, T LSB, CRC.
- CRC-8: polynomial 0x31, initial value 0xFF (datasheet example: 0xBEEF → 0x92).
- Temperature: T = −45 + 175 × raw / 65535 °C.
- Serial number: 0x89, read 6 bytes (two words, each with CRC). Soft reset: 0x94, then wait 1 ms.
- If you read before the measurement is done, the sensor NACKs the read header.

## Wiring
- ESP32: 3V3 → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: 3V3 → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: 3V3 → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from sts40 import STS40
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
print('T=%.2fC' % STS40(i2c).temperature())
```

## Gotchas
- The command is a single byte (0xFD), unlike the STS3x's two-byte commands; STS3x code will not work.
- Wait at least 8.3 ms after 0xFD before reading, or the read is NACKed (OSError).
- A CRC mismatch nearly always means a loose SDA/SCL wire.
- Only one board per I2C bus: the address cannot be changed.
- The power LED and nearby microcontroller warm the sensor slightly; ±0.2 °C is easily spoiled by self-heating of nearby parts.

## Datasheet
https://sensirion.com/resource/datasheet/sts4x
