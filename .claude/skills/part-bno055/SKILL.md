---
name: part-bno055
description: Pinout, electrical limits, wiring and MicroPython driver for the BNO055 9-DOF absolute orientation sensor (Bosch BNO055, fused Euler angles). Use when designing, wiring, simulating or writing code for a BNO055 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# BNO055 9-DOF absolute orientation sensor (BNO055)

## Overview
The **BNO055** from Bosch Sensortec combines an accelerometer, gyroscope and magnetometer with a processor that runs sensor fusion on the chip, so it reports absolute orientation directly: Euler angles (heading 0–360°, roll −90…+90°, pitch −180…+180°) or quaternions. It talks I2C. Hobbyists usually buy the **Adafruit 9-DOF Absolute Orientation IMU Fusion Breakout - BNO055 (#2472)**, which adds a 3.3 V regulator, level shifting and 10 kΩ pull-ups on SDA/SCL.

## Pinout (Adafruit #2472, header by header)
Main header (6 pins):

| Pin | Function |
|---|---|
| VIN | Supply, 3.3–5 V |
| 3Vo | 3.3 V regulator output (leave unconnected) |
| GND | Ground |
| SDA | I2C data |
| SCL | I2C clock |
| RST | Reset, active low (optional) |

Second header on the opposite edge (4 pins):

| Pin | Function |
|---|---|
| PS0 | Protocol select, leave unconnected |
| PS1 | Protocol select, leave unconnected |
| INT | Interrupt output, 3 V (optional) |
| ADR | Address select: low/unconnected = 0x28, high = 0x29 |

Because the pins sit on two edges, wire the board with jumper leads.

## Electrical limits
- Chip: VDD 2.4–3.6 V, VDDIO 1.7–3.6 V; the breakout's VIN accepts 3.3–5 V.
- Current: up to about 12.3 mA in NDOF fusion mode.
- I2C up to 400 kHz; the chip stretches the clock, so 100 kHz is the safe choice.

## Interface details
- **I2C address 0x28** (ADR low), 0x29 (ADR high). CHIP_ID register 0x00 reads **0xA0**.
- Power-on reset takes up to 650 ms; the chip starts in CONFIG mode, where all outputs read 0.
- Setup in CONFIG mode: PAGE_ID 0x07 = 0, PWR_MODE 0x3E = 0 (normal), UNIT_SEL 0x3B = 0x80 (degrees, °C), SYS_TRIGGER 0x3F = 0.
- Start fusion: OPR_MODE 0x3D = **0x0C** (NDOF); switching from CONFIG takes 7 ms, back to CONFIG 19 ms.
- Euler angles: read 6 bytes from **0x1A**: heading, roll, pitch, each a signed 16-bit little-endian word; **degrees = raw / 16** (radians = raw / 900 if UNIT_SEL bit 2 is set).
- CALIB_STAT 0x35: two bits each for system, gyro, accel, mag (3 = fully calibrated).

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from bno055 import BNO055
i2c = I2C(0, sda=Pin(21), scl=Pin(22), freq=100000)
imu = BNO055(i2c)
h, r, p = imu.euler()
print('H=%.1f R=%.1f P=%.1f' % (h, r, p))
```

## Gotchas
- Readings are all 0 until the chip is out of CONFIG mode: the driver switches to NDOF for you.
- Heading is only trustworthy once the magnetometer is calibrated (move the board in a slow figure-eight; check `calibration_status()`).
- Clock stretching can upset some I2C ports; use freq=100000 if reads fail.
- Keep it away from motors, speakers, magnets and steel, which pull the compass heading.

## Datasheet
https://www.bosch-sensortec.com/media/boschsensortec/downloads/datasheets/bst-bno055-ds000.pdf
