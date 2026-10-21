---
name: part-sts35
description: Pinout, electrical limits, wiring and MicroPython driver for the STS35 high-accuracy temperature sensor (Sensirion STS3x-DIS). Use when designing, wiring, simulating or writing code for an STS35 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# STS35 high-accuracy temperature sensor (STS35)

## Overview
The **STS35-DIS** from Sensirion measures temperature from −40 to 125 °C with ±0.1 °C typical accuracy (20–60 °C) and 0.01 °C resolution. It talks I2C and protects each reading with a CRC. Hobbyists buy it on the **DFRobot Fermion: STS35 High Accuracy Digital Temperature Sensor (SEN0434)**, a small board with 10 kΩ pull-ups on SDA, SCL and ADDR.

## Pinout (DFRobot SEN0434, header order, square pad first)
| Pin | Function |
|---|---|
| VCC | Supply, 3.3–5.5 V |
| GND | Ground |
| SCL | I2C clock (10 kΩ pull-up on board) |
| SDA | I2C data (10 kΩ pull-up on board) |
| RST | Active-low reset, optional (leave unconnected) |
| ADDR | Address select: pulled high on board = 0x4B; tie to GND for 0x4A |

## Electrical limits
- Supply: 2.15–5.5 V (chip); DFRobot specifies the board for 3.3–5.5 V.
- Current: about 0.6 mA while measuring (1.5 mA max), 0.2 µA idle.
- I2C up to 1 MHz. The pull-ups go to VCC, so power the board from 3.3 V when using a 3.3 V microcontroller.

## Interface details
- **I2C address 0x4B** on the DFRobot board (ADDR pulled high); 0x4A with ADDR low (the bare chip's default).
- Single-shot, high repeatability, no clock stretching: write **0x24 0x00**, wait ≥ 15.5 ms, read 3 bytes: T MSB, T LSB, CRC.
- CRC-8: polynomial 0x31, initial value 0xFF (datasheet example: 0xBEEF → 0x92).
- Temperature: T = −45 + 175 × raw / 65535 °C.
- Soft reset: 0x30 0xA2, then wait 1.5 ms.

## Wiring
- ESP32: VCC → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VCC → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from sts35 import STS35
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
print('T=%.2fC' % STS35(i2c).temperature())
```

## Gotchas
- The board answers at **0x4B**, not the 0x4A in the chip datasheet's default; scan the bus if unsure.
- A CRC mismatch nearly always means a loose SDA/SCL wire.
- Keep it away from the regulator and microcontroller, which warm the air nearby; ±0.1 °C is easily spoiled by self-heating of nearby parts.

## Datasheet
https://sensirion.com/file/datasheet_sts3x
