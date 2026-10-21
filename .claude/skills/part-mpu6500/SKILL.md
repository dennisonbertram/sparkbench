---
name: part-mpu6500
description: Pinout, electrical limits, wiring and MicroPython driver for the MPU-6500 6-axis IMU, an accelerometer plus gyroscope (TDK InvenSense MPU-6500, MPU-92/65 module). Use when designing, wiring, simulating or writing code for an MPU-6500 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MPU-6500 6-axis IMU (MPU-6500)

## Overview
The **MPU-6500** from TDK InvenSense combines a 3-axis accelerometer (±2/4/8/16 g) and a 3-axis gyroscope (±250/500/1000/2000 °/s) with 16-bit ADCs, a die temperature sensor, a FIFO and a DMP. It talks I2C (400 kHz) or SPI (up to 20 MHz). It is the same die as the one inside the MPU-9250, but without the magnetometer. Hobbyists buy it on the blue **MPU-92/65 module**, which has a 3.3 V regulator, pull-ups on SCL/SDA/NCS and pull-downs on ADO/FSYNC.

## Pinout (MPU-92/65 module, header order)
| Pin | Function |
|---|---|
| VCC | Supply, 3.3–5 V (on-board 3.3 V LDO) |
| GND | Ground |
| SCL | I2C clock (SPI SCLK) |
| SDA | I2C data (SPI SDI) |
| EDA | Auxiliary I2C master data, for an external sensor (leave open) |
| ECL | Auxiliary I2C master clock (leave open) |
| ADO | AD0 address select (SPI SDO): low = 0x68, high = 0x69 |
| INT | Interrupt output (optional) |
| NCS | SPI chip select, pulled up: leave open for I2C |
| FSYNC | Frame sync input, pulled down (leave open) |

## Electrical limits
- Chip VDD/VDDIO: 1.71–3.45 V (absolute max 4 V). The module's LDO makes VCC 3.3–5 V safe. I/O is at 3.3 V.
- Current: about 3.4 mA with all six axes on, 6 µA in full-chip sleep.
- I2C up to 400 kHz.

## Interface details
- **I2C address 0x68** (ADO low, the module default), 0x69 (ADO high). **WHO_AM_I (0x75) = 0x70.**
- Start-up: wait up to 100 ms after power-up, then write PWR_MGMT_1 (0x6B) = 0x80 (reset), wait, then 0x01 (wake, PLL clock). Gyro data is valid 35 ms after leaving sleep.
- Config: CONFIG 0x1A (gyro DLPF), SMPLRT_DIV 0x19, GYRO_CONFIG 0x1B (FS_SEL bits 4:3), ACCEL_CONFIG 0x1C (FS_SEL bits 4:3), ACCEL_CONFIG2 0x1D (accel DLPF).
- Data: burst-read 14 bytes from 0x3B: accel X/Y/Z, temperature, gyro X/Y/Z, each a big-endian signed 16-bit word.
- Scale: accel 16384 / 8192 / 4096 / 2048 LSB/g; gyro 131 / 65.5 / 32.8 / 16.4 LSB/(°/s).
- Temperature: T = raw / 333.87 + 21 °C (room-temperature offset 0 LSB at 21 °C).

## Wiring
- ESP32: VCC → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VCC → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.
- Leave EDA, ECL, ADO, INT, NCS and FSYNC unconnected for basic I2C use.

## Using the driver
```python
from machine import I2C, Pin
from mpu6500 import MPU6500
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
imu = MPU6500(i2c)            # accel_range=2 g, gyro_range=250 deg/s
(ax, ay, az), (gx, gy, gz), t = imu.read()
print('A=%.2f,%.2f,%.2f g G=%.1f,%.1f,%.1f dps T=%.1fC' % (ax, ay, az, gx, gy, gz, t))
```

## Gotchas
- Boards sold as "MPU-9250" often carry an MPU-6500 (WHO_AM_I 0x70): they have no magnetometer at 0x0C.
- Do not use MPU-6050 code for the temperature: the MPU-6050 formula (/340 + 36.53) gives wrong values here.
- Pulling NCS low switches the chip to SPI, and the chip then stops answering on I2C.
- The temperature reading is the die temperature, a few degrees above the air.
- Gyros have a small offset at rest: average a few hundred readings while the module is still and subtract it.

## Datasheet
https://invensense.tdk.com/wp-content/uploads/2020/06/PS-MPU-6500A-01-v1.3.pdf
