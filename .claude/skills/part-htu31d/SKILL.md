---
name: part-htu31d
description: Pinout, electrical limits, wiring and MicroPython driver for the HTU31D temperature & humidity sensor (TE Connectivity HTU31D). Use when designing, wiring, simulating or writing code for an HTU31D in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# HTU31D temperature & humidity sensor (HTU31D)

## Overview
The **HTU31D** from TE Connectivity (MEAS) measures temperature (−40 to 125 °C, ±0.2 °C typical) and relative humidity (0–100 %, ±2 % typical). It talks I2C, adds a CRC to every reading and has a built-in heater. Hobbyists buy it on the **Adafruit HTU31 breakout (#4832)**, which has 10 kΩ pull-ups on SDA/SCL, a pull-up on RST, a pull-down on ADDR and two STEMMA QT sockets. There is no regulator: VIN feeds the chip directly.

## Pinout (Adafruit HTU31 #4832, header order)
| Pin | Function |
|---|---|
| VIN | Supply, 3–5 V (straight to the chip; match your board's logic voltage) |
| GND | Ground |
| SCL | I2C clock |
| SDA | I2C data |
| RST | Reset, active low (optional; pulled up on the board) |
| ADDR | Address select: low/unconnected = 0x40, high = 0x41 |

## Electrical limits
- Supply: 3.0–5.5 V (chip); the board is marked 3–5 V.
- Current: up to 450 µA while measuring, 0.05 µA asleep.
- I2C fast mode, up to 1 MHz.

## Interface details
- **I2C address 0x40** (ADDR low), 0x41 (ADDR high).
- Commands (one byte): Conversion 0x40 | OSR_RH<<3 | OSR_T<<1 (0x5E = finest resolution), Read T&RH 0x00, Read RH 0x10, Reset 0x1E, Heater on 0x04, Heater off 0x02, Diagnostic 0x08, Serial number 0x0A.
- Sequence: write the Conversion command, wait (typical 8.34 ms RH + 11.98 ms T at OSR 3), write 0x00, read 6 bytes: T MSB, T LSB, CRC, RH MSB, RH LSB, CRC. End the read with NACK + stop (MicroPython's readfrom does this).
- CRC-8: polynomial 0x31 (x⁸+x⁵+x⁴+1), initial value 0x00 (datasheet example: 0x683A → 0x7C).
- Temperature: T = −40 + 165 × S / 65535 °C. Humidity: RH = 100 × S / 65535 %.
- Power-up time 10 ms; soft reset takes up to 15 ms.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from htu31d import HTU31D
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
t, h = HTU31D(i2c).read()
print('T=%.1fC H=%.0f%%' % (t, h))
```

## Gotchas
- Unlike the HTU21D, a reading takes two commands: start a conversion, then read. Reading without a conversion returns the old values.
- A CRC mismatch nearly always means a loose SDA/SCL wire.
- VIN also powers the on-board pull-ups, so do not run it from 5 V with a 3.3 V microcontroller.
- Turn the heater off (or reset) before trusting the temperature.
- Two sensors on one bus: tie one board's ADDR to VIN (0x41).

## Datasheet
https://www.farnell.com/datasheets/3049619.pdf
