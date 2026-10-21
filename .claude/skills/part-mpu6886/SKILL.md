---
name: part-mpu6886
description: Pinout, electrical limits, wiring and MicroPython driver for the MPU-6886 6-axis IMU (accelerometer + gyroscope) on the M5Stack Unit Mini IMU. Use when designing, wiring, simulating or writing code for an MPU6886 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MPU-6886 6-axis IMU (MPU-6886)

## Overview
The **MPU-6886** from TDK InvenSense combines a 3-axis accelerometer (±2/4/8/16 g), a 3-axis gyroscope (±250/500/1000/2000 °/s) and a die temperature sensor. It talks I2C (0x68/0x69) or SPI. It is the IMU inside M5Stack controllers; hobbyists buy it on its own as the **M5Stack Unit Mini IMU (U095)**: an HT7533 3.3 V regulator, BSS138 level shifters with 4.7 kΩ pull-ups on SDA/SCL, and a 4-pin HY2.0 (Grove-style) socket. AD0 is tied low, so the address is fixed at 0x68.

## Pinout (Unit Mini IMU, HY2.0-4P socket)
| Pin | Wire | Function |
|---|---|---|
| GND | black | Ground |
| 5V | red | Supply, 3.3–5 V (regulated to 3.3 V on the module) |
| SDA | yellow | I2C data, 4.7 kΩ pull-up to the supply pin |
| SCL | white | I2C clock, 4.7 kΩ pull-up to the supply pin |

## Electrical limits
- Chip VDD/VDDIO: 1.71–3.45 V (absolute max 4 V); the module's regulator accepts 3.3–5 V on the 5V pin.
- The bus pull-ups go to the 5V pin's voltage: with a 3.3 V microcontroller (ESP32, Pico, Raspberry Pi) feed the module 3.3 V.
- Current: about 2.8 mA with accel + gyro in low-noise mode (accel alone 0.32 mA).
- I2C up to 400 kHz.

## Interface details
- **I2C address 0x68**. WHO_AM_I (0x75) = **0x19**.
- Powers up asleep (PWR_MGMT_1 0x6B = 0x41). Write 0x80 (reset), wait 100 ms, write 0x01 (wake, PLL clock). Gyro start-up 35 ms.
- GYRO_CONFIG 0x1B FS_SEL[4:3], ACCEL_CONFIG 0x1C ACCEL_FS_SEL[4:3], CONFIG 0x1A DLPF_CFG, ACCEL_CONFIG2 0x1D A_DLPF_CFG.
- Data: 14-byte burst from 0x3B: accel X/Y/Z, temperature, gyro X/Y/Z, each a big-endian signed 16-bit word.
- Accel 16384 LSB/g (±2 g), gyro 131 LSB/(°/s) (±250 °/s), temperature = raw / 326.8 + 25 °C.

## Wiring
- ESP32: 5V → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: 5V → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: 5V → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.
- Use a Grove/HY2.0-to-Dupont cable; the module has no header pins.

## Using the driver
```python
from machine import I2C, Pin
from mpu6886 import MPU6886
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
imu = MPU6886(i2c)
(ax, ay, az), (gx, gy, gz), t = imu.read()
print('A=%.2f,%.2f,%.2f g G=%.1f,%.1f,%.1f dps T=%.1fC' % (ax, ay, az, gx, gy, gz, t))
```

## Gotchas
- WHO_AM_I 0x19 identifies a real MPU-6886; MPU-6050 code (expects 0x68) refuses it, but the data registers and scales match except the temperature formula (MPU-6886: /326.8 + 25).
- Reading all zeros means the chip is still asleep: write PWR_MGMT_1 = 0x01.
- The temperature is the die temperature, a few degrees above the air.
- Average a few hundred gyro samples at rest and subtract them as the offset.

## Datasheet
https://m5stack.oss-cn-shenzhen.aliyuncs.com/resource/docs/datasheet/core/MPU-6886-000193%2Bv1.1_GHIC_en.pdf
