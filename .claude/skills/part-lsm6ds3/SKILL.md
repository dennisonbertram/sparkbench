---
name: part-lsm6ds3
description: Pinout, electrical limits, wiring and MicroPython driver for the LSM6DS3 accelerometer & gyroscope (STMicroelectronics LSM6DS3 6-axis IMU). Use when designing, wiring, simulating or writing code for an LSM6DS3 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# LSM6DS3 accelerometer & gyroscope (LSM6DS3)

## Overview
The **LSM6DS3** from STMicroelectronics is a 6-axis IMU: a 3-axis accelerometer (±2/±4/±8/±16 g) and a 3-axis gyroscope (±125/±245/±500/±1000/±2000 dps), plus a die temperature sensor. It talks I2C (or SPI). This part models the **SparkFun 6 Degrees of Freedom Breakout - LSM6DS3 (SEN-13339)**. That board has no regulator, so it must run from 3.3 V. It has 4.7 kΩ pull-ups on SDA/SCL and its ADDR jumper sets address 0x6B.

## Pinout (SparkFun SEN-13339, main 6-pin header, left to right)
| Pin | Function |
|---|---|
| GND | Ground |
| 3.3V | Supply VDD, 1.8–3.6 V (never 5 V) |
| SDA | I2C data (SPI MOSI) |
| SCL | I2C / SPI clock |
| SDO/SA0 | I2C address bit (set by ADDR jumper) / SPI MISO: leave unconnected for I2C |
| CS | Leave unconnected for I2C (10 kΩ pull-up); SPI chip select |

The second 5-pin header (INT2, INT1, OCS, SCX, SDX) carries the interrupt outputs and the auxiliary sensor bus. You don't need it for basic use.

## Electrical limits
- Supply: 1.71–3.6 V (absolute max 4.8 V on any pin). The pins are **not 5 V tolerant**.
- Current: 0.9 mA (both sensors, normal mode) to 1.25 mA (high-performance mode).
- I2C up to 400 kHz.

## Interface details
- **I2C address 0x6B** (SA0 high, board default) or 0x6A (SA0 low). WHO_AM_I (0x0F) = **0x69**.
- Both sensors start powered down. Write CTRL3_C (0x12) = 0x44 (BDU + IF_INC auto-increment), CTRL1_XL (0x10) = 0x40 (104 Hz, ±2 g) and CTRL2_G (0x11) = 0x40 (104 Hz, ±245 dps).
- Outputs are 16-bit two's complement, **low byte first**: temperature 0x20–0x21, gyro X/Y/Z 0x22–0x27, accel X/Y/Z 0x28–0x2D. STATUS_REG 0x1E: bit0 XLDA, bit1 GDA, bit2 TDA.
- Accel sensitivity: 0.061 / 0.122 / 0.244 / 0.488 mg/LSB at ±2 / 4 / 8 / 16 g. FS_XL coding: 00 = 2 g, 01 = **16 g**, 10 = 4 g, 11 = 8 g.
- Gyro sensitivity: 4.375 / 8.75 / 17.5 / 35 / 70 mdps/LSB at ±125 / 245 / 500 / 1000 / 2000 dps.
- Temperature: T = 25 + raw / 16 °C (offset up to ±15 °C).

## Wiring
- ESP32: GND → GND, 3.3V → 3V3, SDA → D21, SCL → D22. Leave SDO/SA0 and CS unconnected.
- Pico: GND → GND, 3.3V → 3V3(OUT), SDA → GP4, SCL → GP5.
- Raspberry Pi 4: 3.3V → pin 1, GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from lsm6ds3 import LSM6DS3
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
imu = LSM6DS3(i2c)            # addr=0x6A if SA0 is low; accel_fs=2/4/8/16, gyro_fs=125/245/500/1000/2000
print(imu.acceleration())     # (x, y, z) in g
print(imu.gyro())             # (x, y, z) in degrees per second
print(imu.temperature())      # die temperature in °C
```

## Gotchas
- WHO_AM_I 0x6A means you have an LSM6DS3TR-C, and 0x6C an LSM6DSO. Their registers are similar but not the same.
- Reading all zeros means you forgot to set the ODR in CTRL1_XL/CTRL2_G, so the chip is still powered down.
- At rest the accelerometer reads about +1 g on the axis pointing up. The gyro has a zero-rate offset of up to ±10 dps, so average a few still readings and subtract them.
- If CS is pulled low, the chip switches to SPI and stops answering on I2C.

## Datasheet
https://www.st.com/resource/en/datasheet/lsm6ds3.pdf
