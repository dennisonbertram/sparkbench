---
name: part-lsm303dlhc
description: Pinout, electrical limits, wiring and MicroPython driver for the LSM303DLHC accelerometer & magnetometer (STMicroelectronics LSM303DLHC, GY-511 module). Use when designing, wiring, simulating or writing code for an LSM303DLHC in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# LSM303DLHC accelerometer & magnetometer (LSM303DLHC)

## Overview
The **LSM303DLHC** from STMicroelectronics combines a 3-axis accelerometer (±2/4/8/16 g) and a 3-axis magnetometer (±1.3 to ±8.1 gauss) in one package. Over I2C it shows up as **two chips**: the accelerometer at **0x19** and the magnetometer at **0x1E**. It is used for tilt sensing and as a tilt-compensated compass. Hobbyists buy it on the **GY-511 module**, which has a 3.3 V regulator, I2C level shifting and pull-ups, so it runs from 3.3-5 V.

## Pinout (GY-511, header order as printed)
| Pin | Function |
|---|---|
| VIN | Supply, 3.3-5 V |
| 3V3 | 3.3 V regulator output, leave unconnected |
| GND | Ground |
| SCL | I2C clock (level-shifted, pull-up on board) |
| SDA | I2C data (level-shifted, pull-up on board) |
| INT2 | Accelerometer interrupt 2, 3.3 V logic (optional) |
| INT1 | Accelerometer interrupt 1, 3.3 V logic (optional) |
| DRDY | Magnetometer data ready, 3.3 V logic (optional) |

## Electrical limits
- Chip: Vdd 2.16-3.6 V (absolute max 4.8 V). The GY-511 regulates VIN down to 3.3 V.
- Current: about 110 µA (mag 7.5 Hz + accel 50 Hz), plus the module's LED and regulator.
- INT1/INT2/DRDY are 3.3 V only, not level-shifted.

## Interface details
- Accelerometer (0x19): CTRL_REG1_A 0x20 = **0x57** (100 Hz, X/Y/Z on); CTRL_REG4_A 0x23 = **0x88** (BDU, ±2 g, HR). STATUS_REG_A 0x27 bit 3 = new XYZ data.
- Read 6 bytes from OUT_X_L_A 0x28 **with bit 7 set (0xA8)** for auto-increment. Each axis is little-endian, 12-bit left-justified: `raw >> 4`, then × **1 mg/LSB** at ±2 g (2, 4, 12 mg/LSB at ±4, ±8, ±16 g).
- Magnetometer (0x1E): CRA_REG_M 0x00 = **0x10** (15 Hz), CRB_REG_M 0x01 = **0x20** (±1.3 gauss), MR_REG_M 0x02 = **0x00** (continuous). IRA/IRB/IRC 0x0A-0x0C read `H43`.
- Read 6 bytes from 0x03 (the pointer auto-increments without bit 7): **big-endian, order X, Z, Y**. At ±1.3 gauss divide X/Y by **1100** and Z by **980** LSB/gauss.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from lsm303dlhc import LSM303DLHC
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
imu = LSM303DLHC(i2c)
ax, ay, az = imu.acceleration()   # mg
mx, my, mz = imu.magnetic()       # mgauss
```

## Gotchas
- An I2C scan shows two addresses (0x19 and 0x1E); that is one board.
- The magnetometer registers are high byte first and ordered X, Z, Y, unlike the accelerometer (low byte first, X, Y, Z).
- Z has a different gain from X/Y on the magnetometer.
- Not the LSM303AGR: that chip has different magnetometer registers (0x60-0x6D) and scale.
- Lying flat and still, the accelerometer Z reads about +1000 mg.
- Keep the magnetometer away from motors, magnets and current-carrying wires; calibrate hard-iron offsets.

## Datasheet
https://cdn-shop.adafruit.com/datasheets/LSM303DLHC.PDF
