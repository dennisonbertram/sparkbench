---
name: part-si7051
description: Pinout, electrical limits, wiring and MicroPython driver for the Si7051 ±0.1 °C digital temperature sensor (Silicon Labs Si7051-A20). Use when designing, wiring, simulating or writing code for an Si7051 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Si7051 ±0.1 °C temperature sensor (Si7051)

## Overview
The **Si7051-A20** from Silicon Labs is a precision digital thermometer: −40 to 125 °C, ±0.1 °C maximum error (−20 to 70 °C), 14-bit resolution (0.01 °C) by default. It talks I2C at a fixed address. Hobbyists buy it on the **ClosedCube Si7051 breakout (B001)**: a small board with the chip, two I2C pull-ups and a 4-pin header, but **no regulator**.

## Pinout (ClosedCube Si7051 breakout, header order)
| Pin | Function |
|---|---|
| VDD | Supply, 1.9–3.6 V (3.3 V) |
| SCL | I2C clock (pull-up R1 on board) |
| SDA | I2C data (pull-up R2 on board) |
| GND | Ground |

Note the order: VDD, SCL, SDA, GND (GND is last).

## Electrical limits
- Supply: 1.9–3.6 V; absolute maximum 4.2 V. Not 5 V tolerant: never connect VDD or the I2C lines to 5 V.
- Current: 90 µA typical (120 µA max) while converting, 0.06 µA standby; peaks of 3.5 mA for under 5 ms at power-up.
- I2C up to 400 kHz.

## Interface details
- **I2C address 0x40** (fixed).
- Commands: 0xF3 measure (no hold master), 0xE3 measure (hold master, clock stretching), 0xFE reset, 0xE7/0xE6 read/write User Register 1, 0x84 0xB8 firmware revision (0x20 = v2.0).
- Measurement: write **0xF3**, wait ≥ 10.8 ms (14-bit), read 3 bytes: MSB, LSB, CRC. Until the conversion is done the chip NACKs its address, so retry the read.
- CRC-8: polynomial x⁸+x⁵+x⁴+1 (0x31), initial value **0x00**.
- Temperature: T = 175.72 × Temp_Code / 65536 − 46.85 °C (Temp_Code = the 16-bit word; its two lowest bits are always 0).
- Resolution (User Register 1 bits D7, D0): 00 = 14-bit (10.8 ms), 10 = 13-bit (6.2 ms), 01 = 12-bit (3.8 ms), 11 = 11-bit (2.4 ms). Reset value 0x3A. Bit D6 = 1 means VDD is low (1.8–1.9 V).
- Power-up: up to 80 ms before the first conversion; after a soft reset up to 15 ms.

## Wiring
- ESP32: VDD → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VDD → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VDD → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from si7051 import SI7051
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
sensor = SI7051(i2c)
print('T=%.2fC' % sensor.temperature())
```

## Gotchas
- Powering the bare ClosedCube board from 5 V (e.g. an Arduino Uno) destroys the sensor; use 3.3 V.
- A CRC mismatch nearly always means a loose SDA/SCL wire.
- 0x40 is also the address of Si7021, HTU21D and INA219: only one of them per bus without a multiplexer.
- Accuracy is only as good as the thermal coupling: keep the board away from the microcontroller and regulators, and don't hold it in your fingers while reading.

## Datasheet
https://www.silabs.com/documents/public/data-sheets/Si7050-1-3-4-5-A20.pdf
