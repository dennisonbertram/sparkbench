---
name: part-icm-42688-p
description: Pinout, electrical limits, wiring and MicroPython driver for the ICM-42688-P 6-axis IMU (TDK InvenSense accelerometer + gyroscope, blue 8-pin "ICM-42688 6-Axis IMU" module). Use when designing, wiring, simulating or writing code for an ICM-42688-P in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# ICM-42688-P 6-axis IMU (ICM-42688-P)

## Overview
The **ICM-42688-P** from TDK InvenSense combines a 16-bit 3-axis accelerometer (±2/4/8/16 g) and a 3-axis gyroscope (±15.625…±2000 °/s), plus a die temperature sensor. It is a low-noise successor to the MPU-6050/6500 and talks I2C (up to 1 MHz), SPI or I3C. Hobbyists buy it on the small blue **"ICM-42688 6-Axis IMU Accelerometer Gyroscope, I2C SPI Interface"** module (Amazon B0F3JWY1XF, QUAINTBYTE): two 4-pin rows, no regulator, and I2C pull-ups that only connect when the back solder jumper is bridged.

## Pinout (two 4-pin headers, as printed)
| Header | Pin | Function |
|---|---|---|
| 1 | SDO | Chip AP_AD0 / SPI data out: **tie to GND = 0x68**, to 3.3 V = 0x69. Never leave floating |
| 1 | SDA | I2C data (printed SDA/SDI; SPI data in) |
| 1 | SCL | I2C clock (SPI clock) |
| 1 | CS | SPI chip select: **tie to 3.3 V for I2C** (datasheet: connect to VDDIO) |
| 2 | INT | Interrupt 1 output (open drain, active low by default); optional |
| 2 | FSY | Chip pin 9: INT2 output by default, or FSYNC/CLKIN input; leave open |
| 2 | GND | Ground |
| 2 | 3V3 | Supply straight to VDD and VDDIO, 1.71–3.6 V |

Because the pins sit on two edges, Sparkbench wires this module with jumper leads (cabled).

## Electrical limits
- Supply 1.71–3.6 V (absolute max 4 V). **No regulator on the board: never connect 5 V.** I/O levels follow the supply, so 3.3 V suits ESP32 and Pico.
- Current: about 0.88 mA with accel + gyro in low-noise mode, 7.5 µA asleep.
- I2C lines are open drain and need pull-ups (datasheet example 10 kΩ). Bridge the "I2C" jumper on the back, or add 4.7 kΩ from SDA and SCL to 3.3 V — not both.

## Interface details
- **I2C address 0x68** (SDO low) / **0x69** (SDO high). WHO_AM_I register 0x75 reads **0x47**.
- Soft reset: write 0x01 to DEVICE_CONFIG (0x11), wait 1 ms before the next access.
- The chip powers up **asleep**: PWR_MGMT0 (0x4E) = **0x0F** puts gyro and accel in low-noise mode. No register writes for 200 µs after that; gyro start-up 30 ms, accel 10 ms. Keep the gyro on at least 45 ms before turning it off.
- ACCEL_CONFIG0 (0x50): FS_SEL bits 7:5 — 0 = ±16 g (2048 LSB/g), 1 = ±8 g (4096), 2 = ±4 g (8192), 3 = ±2 g (16384); ODR bits 3:0 (0x08 = 100 Hz).
- GYRO_CONFIG0 (0x4F): FS_SEL bits 7:5 — 0 = ±2000 °/s (16.4 LSB/°/s), 1 = ±1000 (32.8), 2 = ±500 (65.5), 3 = ±250 (131) … 7 = ±15.625 (2097.2); ODR bits 3:0.
- Data, 16-bit two's complement, **high byte first** (default): TEMP 0x1D–0x1E, accel X/Y/Z 0x1F–0x24, gyro X/Y/Z 0x25–0x2A. A 14-byte burst from 0x1D reads everything.
- Temperature °C = TEMP_DATA / 132.48 + 25.
- Registers are banked (REG_BANK_SEL 0x76); everything above is in bank 0, the reset default.

## Wiring (I2C)
- ESP32: 3V3 → 3V3, GND → GND, SDA → D21, SCL → D22, CS → 3V3, SDO → GND, plus 4.7 kΩ pull-ups on SDA/SCL (or bridge the jumper).
- Pico: 3V3 → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5, CS → 3V3(OUT), SDO → GND, pull-ups as above.
- Raspberry Pi 4: 3V3 → pin 1, GND → pin 6, SDA → pin 3, SCL → pin 5, CS → pin 1, SDO → GND (the Pi has 1.8 kΩ pull-ups on pins 3/5 already).

## Using the driver
```python
from machine import I2C, Pin
from icm42688 import ICM42688
imu = ICM42688(I2C(0, sda=Pin(21), scl=Pin(22), freq=400000))  # tries 0x68 then 0x69; ±4 g, ±500 dps
(ax, ay, az), (gx, gy, gz), t = imu.read()                        # g, deg/s, degC
print(ax, ay, az, gx, gy, gz, t)
```
Other ranges: `ICM42688(i2c, accel_range=16, gyro_range=2000)`.

## Gotchas
- Every axis reads -32768 (-4.00 g): the sensors are still off — write PWR_MGMT0 = 0x0F and wait.
- Not found on the I2C scan: no pull-ups (jumper open), CS floating or low, or SDO floating.
- The full-scale codes run backwards compared with the MPU-6050: FS_SEL 0 is the *widest* range.
- This is not an MPU-6050/6500: different register map, WHO_AM_I 0x47, big-endian data from 0x1D. Their libraries do not work.
- The temperature is the die temperature, a few degrees above the air.

## Datasheet
https://product.tdk.com/system/files/dam/doc/product/sensor/mortion-inertial/imu/data_sheet/ds-000347-icm-42688-p-v1.6.pdf
