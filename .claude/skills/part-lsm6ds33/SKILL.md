---
name: part-lsm6ds33
description: Pinout, electrical limits, wiring and MicroPython driver for the LSM6DS33 accelerometer & gyroscope (STMicroelectronics LSM6DS33 6-axis IMU, Pololu carrier #2736). Use when designing, wiring, simulating or writing code for an LSM6DS33 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# LSM6DS33 accelerometer & gyroscope (LSM6DS33)

## Overview
The **LSM6DS33** from STMicroelectronics is a 6-axis IMU. It has a 3-axis accelerometer (±2/±4/±8/±16 g), a 3-axis gyroscope (±125/±245/±500/±1000/±2000 dps) and a die temperature sensor, and it talks I2C (or SPI). This part models the **Pololu LSM6DS33 3D Accelerometer and Gyro Carrier with Voltage Regulator (#2736)**. The carrier has a 3.3 V regulator and level shifters on SDA/SCL, so it runs from 2.5–5.5 V. It pulls SDA/SCL up to VIN through 10 kΩ, and SA0 is pulled high, which gives address 0x6B. ST has discontinued the chip, but the board is still widely used (it is also on the Pololu AltIMU-10 v5 and MinIMU-9 v5).

## Pinout (Pololu #2736, one 9-pin header, top to bottom)
| Pin | Function |
|---|---|
| VDD | 3.3 V regulator output (or a 3.3 V input with VIN unconnected): leave unconnected |
| VIN | Supply, 2.5–5.5 V; SDA/SCL are pulled up to this voltage |
| GND | Ground |
| SDA | I2C data / SPI SDI (level-shifted) |
| SCL | I2C / SPI clock (level-shifted) |
| SDO | SA0 address bit (pulled up = 0x6B) / SPI data out, 3.3 V only |
| CS | Pulled up = I2C; low = SPI. 3.3 V only |
| INT2 | Interrupt 2 output, 3.3 V |
| INT1 | Interrupt 1 output, 3.3 V |

## Electrical limits
- Board supply on VIN: 2.5–5.5 V, about 2 mA. The chip itself is rated 1.71–3.6 V (absolute max 4.8 V).
- Only SDA and SCL are level-shifted. SDO, CS, INT1 and INT2 are **not 5 V tolerant**.
- I2C up to 400 kHz.

## Interface details
- **I2C address 0x6B** (SA0 high, board default) or 0x6A (SDO/SA0 tied to GND). WHO_AM_I (0x0F) = **0x69**.
- Both sensors start powered down. Write CTRL3_C (0x12) = 0x44 (BDU + IF_INC; the default is 0x04), CTRL1_XL (0x10) = 0x40 (104 Hz, ±2 g) and CTRL2_G (0x11) = 0x40 (104 Hz, ±245 dps).
- Outputs are 16-bit two's complement, **low byte first**: temperature 0x20–0x21, gyro X/Y/Z 0x22–0x27, accel X/Y/Z 0x28–0x2D. STATUS_REG 0x1E: bit0 XLDA, bit1 GDA, bit2 TDA.
- Accel sensitivity: 0.061 / 0.122 / 0.244 / 0.488 mg/LSB at ±2 / 4 / 8 / 16 g. FS_XL coding: 00 = 2 g, 01 = **16 g**, 10 = 4 g, 11 = 8 g.
- Gyro sensitivity: 4.375 / 8.75 / 17.5 / 35 / 70 mdps/LSB at ±125 / 245 / 500 / 1000 / 2000 dps.
- Temperature: T = 25 + raw / 16 °C (offset up to ±15 °C).

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22. Leave VDD, SDO, CS, INT1 and INT2 unconnected.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.
- Power VIN from 3.3 V on 3.3 V boards. The SDA/SCL pull-ups go to VIN, so 5 V on VIN would put 5 V on the microcontroller's pins.

## Using the driver
```python
from machine import I2C, Pin
from lsm6ds33 import LSM6DS33
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
imu = LSM6DS33(i2c)           # addr=0x6A if SDO/SA0 is grounded; accel_fs=2/4/8/16, gyro_fs=125/245/500/1000/2000
print(imu.acceleration())     # (x, y, z) in g
print(imu.gyro())             # (x, y, z) in degrees per second
print(imu.temperature())      # die temperature in °C
```

## Gotchas
- The LSM6DS3 also reports WHO_AM_I 0x69 and has a near-identical register map, so this driver works on it too. 0x6A means an LSM6DS3TR-C, and 0x6C means an LSM6DSO.
- If every reading is zero, the ODR in CTRL1_XL/CTRL2_G was never set, so the chip is still powered down.
- At rest the accelerometer reads about +1 g on the axis pointing up. The gyro has a zero-rate offset of up to ±10 dps, so average a few readings while it is still and subtract them.
- The Pololu silkscreen shows the axis directions. The LIS3MDL magnetometer on the AltIMU/MinIMU boards shares the same bus at 0x1E.

## Datasheet
https://www.pololu.com/file/0J1087/LSM6DS33.pdf
