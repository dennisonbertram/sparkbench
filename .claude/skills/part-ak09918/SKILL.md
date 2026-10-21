---
name: part-ak09918
description: Pinout, electrical limits, wiring and MicroPython driver for the AK09918 3-axis magnetometer / compass (AKM AK09918C, Seeed Grove - IMU 9DOF ICM20600 & AK09918). Use when designing, wiring, simulating or writing code for an AK09918 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# AK09918 3-axis magnetometer (AK09918C)

## Overview
The **AK09918C** from Asahi Kasei (AKM) measures the magnetic field on three axes (±4912 µT, 16-bit, 0.15 µT/LSB) and talks I2C at **0x0C**. Hobbyists buy it on the **Seeed Studio Grove - IMU 9DOF (ICM20600 & AK09918)**, which pairs it with an ICM-20600 accelerometer/gyro (0x69), a 1.8 V regulator and a MOSFET I2C level shifter, so the board runs from 3.3–5 V.

## Pinout (Grove - IMU 9DOF, Grove connector order)
| Pin | Function |
|---|---|
| SCL | I2C clock (yellow), 4.7 kΩ pull-up to VCC |
| SDA | I2C data (white), 4.7 kΩ pull-up to VCC |
| VCC | Supply, 3.3–5 V (red) |
| GND | Ground (black) |

## Electrical limits
- Chip: VDD 1.65–1.95 V (absolute max 2.5 V): never wire a bare AK09918 to 3.3 V. The Grove board's XC6206 regulator makes 1.8 V.
- Current: 1.5 mA while measuring, 1 µA in power-down (plus the ICM-20600 if it is woken).
- I2C up to 400 kHz. The board's pull-ups go to VCC, so power it from 3.3 V with a 3.3 V microcontroller.

## Interface details
- **I2C address 0x0C** (fixed). WIA1 (0x00) = 0x48, WIA2 (0x01) = 0x0C.
- CNTL2 (0x31) mode: 0x00 power-down, 0x01 single measurement (7.2–8.2 ms, then back to power-down), 0x02/0x04/0x06/0x08 continuous 10/20/50/100 Hz, 0x10 self-test. Enter power-down and wait ≥ 100 µs before switching mode.
- CNTL3 (0x32) bit 0 SRST: soft reset.
- ST1 (0x10): bit 0 DRDY, bit 1 DOR (a sample was skipped).
- Data 0x11–0x16: X, Y, Z, 16-bit two's complement, **low byte first**. 0x17 TMPS is a dummy byte.
- ST2 (0x18) **must be read** after the data to end the read; bit 3 HOFL = overflow (|X|+|Y|+|Z| ≥ 4912 µT, data invalid).
- Field in µT = raw × 0.15.

## Wiring
- ESP32: VCC → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VCC → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.
- Use a Grove-to-female-jumper cable.

## Using the driver
```python
from machine import I2C, Pin
from ak09918 import AK09918
import math
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
mag = AK09918(i2c)                     # single-measurement mode
x, y, z = mag.read()                   # microtesla
print('X=%.2fuT Y=%.2fuT Z=%.2fuT' % (x, y, z))
print('heading', math.degrees(math.atan2(y, x)) % 360)
```
For a steady stream use `AK09918(i2c, mode=MODE_100HZ)` (or 10/20/50 Hz).

## Gotchas
- `i2c.scan()` shows two devices: 0x0C (AK09918) and 0x69 (ICM-20600). The magnetometer is on the main bus, not behind the IMU.
- Forgetting to read ST2 freezes the data registers in continuous mode.
- Data is little endian (unlike most InvenSense registers).
- Motors, magnets, speakers and steel nearby distort readings; do a hard-iron calibration (min/max while rotating). atan2(Y, X) heading only holds when the board is level.

## Datasheet
https://files.seeedstudio.com/wiki/Grove-IMU_9DOF-lcm20600_AK09918/res/AK09918.pdf (AKM AK09918C, 016014242-E-00)
