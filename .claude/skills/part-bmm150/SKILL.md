---
name: part-bmm150
description: Pinout, electrical limits, wiring and MicroPython driver for the BMM150 geomagnetic sensor / 3-axis magnetometer (Bosch Sensortec BMM150, Waveshare BMM150 module). Use when designing, wiring, simulating or writing code for a BMM150 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# BMM150 geomagnetic sensor (BMM150)

## Overview
The **BMM150** from Bosch Sensortec is a 3-axis geomagnetic sensor (magnetometer) used as an electronic compass. It measures ±1300 µT on X and Y and ±2500 µT on Z with about 0.3 µT resolution (Earth's field is roughly 25–65 µT). It talks I2C (or SPI). Raw counts must be **compensated with factory trim values** stored in the chip, using Bosch's formula. Hobbyists buy it on the **Waveshare BMM150 3-Axis Magnetometer Sensor** board: 3.3 V regulator (RT9193), MOSFET level shifters with 4.7 kΩ pull-ups, so it runs from 3.3 V or 5 V. It ships with a PH2.0 5-pin cable.

## Pinout (Waveshare board, 5-pin PH2.0 connector, pin 1 first)
| Pin | Function |
|---|---|
| INT | Interrupt output (3.3 V logic, high-Z unless enabled), optional |
| SCL | I2C clock |
| SDA | I2C data |
| GND | Ground |
| VCC | Supply, 3.3–5 V |

The same signals are also on a 7-pin 2.54 mm header (DRY, CS (A1), SCK (SCL), SDI (SDA), SDO (A0), GND, VCC) and a 4-pin header (SCL, SDA, GND, VCC). Because the connectors sit on three edges, Sparkbench wires this board with jumper leads.

## Electrical limits
- Chip: VDD 1.62–3.6 V (absolute max 4.0 V); the board's regulator lets VCC be 3.3–5 V.
- Current: about 0.5 mA average with the regular preset at 10 Hz, about 1 µA in suspend.
- I2C standard and fast mode (400 kHz).

## Interface details
- **I2C address 0x13** on this board (CSB and SDO pulled high). Chip table: CSB/SDO = 0/0 → 0x10, 0/1 → 0x11, 1/0 → 0x12, 1/1 → 0x13.
- Power-up: write **0x4B = 0x01** (suspend → sleep), wait **3 ms**. Chip ID **0x40 = 0x32** (only readable after that).
- Repetitions (datasheet table 3, regular preset): **0x51 = 0x04** (nXY = 1 + 2·REPXY = 9), **0x52 = 0x0E** (nZ = 1 + REPZ = 15).
- Forced mode: write **0x4C = 0x02**, wait ≈ 145 µs·nXY + 500 µs·nZ + 980 µs (≈ 10 ms regular), poll data-ready **0x48 bit 0**, read 8 bytes from **0x42**.
- Data: X, Y = 13-bit two's complement (LSB register bits 7:3, MSB register = bits 12:5) → `int16(lsb | msb<<8) >> 3`; Z = 15-bit (`>> 1`); RHALL = 14 bits (`msb<<6 | lsb>>2`). Overflow codes: X/Y = −4096, Z = −16384.
- Trim registers: dig_x1 0x5D, dig_y1 0x5E, dig_z4 0x62/63, dig_x2 0x64, dig_y2 0x65, dig_z2 0x68/69, dig_z1 0x6A/6B, dig_xyz1 0x6C/6D (MSB & 0x7F), dig_z3 0x6E/6F, dig_xy2 0x70, dig_xy1 0x71.
- Compensation (Bosch SensorAPI, float): r = xyz1·16384/RHALL − 16384; X µT = (x·((xy2·r²/2²⁸ + r·xy1/16384 + 256)·(x2 + 160))/8192 + 8·x1)/16 (Y the same with y1, y2); Z µT = ((z − z4)·131072 − z3·(RHALL − xyz1)) / (4·(z2 + z1·RHALL/32768)) / 16.

## Wiring
- ESP32: VCC → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VCC → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from bmm150 import BMM150
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
mag = BMM150(i2c)            # 0x13, regular preset
x, y, z = mag.read()         # microtesla; None for an axis that overflowed
print('X=%.1f Y=%.1f Z=%.1f uT' % (x, y, z))
```
Heading (board flat): `math.degrees(math.atan2(y, x)) % 360`, after removing hard-iron offsets.

## Gotchas
- No ACK / chip ID 0x00: you skipped the power control bit or the 3 ms wait.
- The Waveshare wiki's sample code mentions 0x10 as a default; the board as shipped answers at 0x13. Run an I2C scan if unsure.
- Bosch's SensorAPI uses REPZ values (0x07 for "regular") that differ from the datasheet's table; this driver follows the datasheet (nZ = 1 + REPZ).
- Magnets, steel screws, motors and nearby current-carrying wires distort the reading; calibrate by rotating the board and subtracting the min/max midpoint of each axis.
- In Sparkbench the simulated chip carries a fixed, representative set of trim values; real chips each have their own, which the driver reads at start-up.

## Datasheet
https://www.bosch-sensortec.com/media/boschsensortec/downloads/datasheets/bst-bmm150-ds001.pdf
