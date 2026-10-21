---
name: part-mma8452q
description: Pinout, electrical limits, wiring and MicroPython driver for the MMA8452Q 3-axis accelerometer (NXP/Freescale MMA8452Q). Use when designing, wiring, simulating or writing code for an MMA8452Q in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MMA8452Q 3-axis accelerometer (MMA8452Q)

## Overview
The **MMA8452Q** from NXP (formerly Freescale) is a 12-bit, 3-axis digital accelerometer with selectable ±2 / ±4 / ±8 g ranges, output data rates from 1.56 to 800 Hz, and orientation, tap and free-fall detection on two interrupt pins. It talks I2C. Hobbyists buy it on the **SparkFun Triple Axis Accelerometer Breakout - MMA8452Q** (SEN-12756, or BOB-13926 with headers), which has no regulator, 10 kΩ pull-ups on SDA/SCL and an SA0 address jumper.

## Pinout (SparkFun MMA8452Q breakout, header order)
| Pin | Function |
|---|---|
| 3.3V | Supply, 1.95–3.6 V (no regulator) |
| SDA | I2C data (10 kΩ pull-up on board) |
| SCL | I2C clock (10 kΩ pull-up on board) |
| I2 | Interrupt 2 output (optional) |
| I1 | Interrupt 1 output (optional) |
| GND | Ground |

## Electrical limits
- Supply: 1.95–3.6 V (VDD); I/O 1.62–3.6 V. **Not 5 V tolerant**, on the supply or the I2C pins.
- Current: 6–165 µA in active mode depending on data rate (about 24 µA at 100 Hz, normal mode); 1.8 µA standby.
- I2C up to 400 kHz. Reads need a repeated start (MicroPython's `readfrom_mem` does this).

## Interface details
- **I2C address 0x1D** (SA0 high, SparkFun default); 0x1C with the SA0 jumper on the back closed.
- WHO_AM_I (0x0D) = **0x2A**.
- Powers up in standby. Configure in standby, then set ACTIVE: CTRL_REG1 (0x2A) = 0x00, XYZ_DATA_CFG (0x0E) = FS (00 = 2 g, 01 = 4 g, 10 = 8 g), CTRL_REG1 = (DR << 3) | 1 (DR = 3 for 100 Hz). Turn-on time 2/ODR + 1 ms.
- Data: OUT_X_MSB..OUT_Z_LSB at 0x01–0x06, read in one 6-byte burst. Each axis is 12-bit two's complement, MSB first, left-justified: `raw = int16(MSB<<8 | LSB) >> 4`.
- Sensitivity: 1024 counts/g (±2 g), 512 (±4 g), 256 (±8 g). g = raw / sensitivity.
- STATUS (0x00) bit 3 (ZYXDR) = new X/Y/Z sample ready.

## Wiring
- ESP32: 3.3V → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: 3.3V → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: 3.3V → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from mma8452q import MMA8452Q
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
accel = MMA8452Q(i2c)          # 0x1D, ±2 g, 100 Hz
x, y, z = accel.read()         # in g
print('X=%.2f Y=%.2f Z=%.2f g' % (x, y, z))
```

## Gotchas
- Never power it from 5 V, and never connect it to a 5 V microcontroller's I2C pins without a level shifter.
- All zeros means the chip is still in standby (ACTIVE not set).
- XYZ_DATA_CFG and the data rate are ignored unless written while in standby.
- WHO_AM_I not 0x2A, or OSError on the first read: check wiring and the address (0x1D vs 0x1C).
- Lying flat and still, Z reads about +1 g and X/Y about 0 g.

## Datasheet
https://www.nxp.com/docs/en/data-sheet/MMA8452Q.pdf
