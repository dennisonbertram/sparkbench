---
name: part-mpu9250
description: Pinout, electrical limits, wiring and MicroPython driver for the MPU-9250 9-axis IMU (accelerometer, gyroscope, AK8963 magnetometer) on the GY-9250 module. Use when designing, wiring, simulating or writing code for an MPU9250 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MPU-9250 9-axis IMU (MPU-9250)

## Overview
The **MPU-9250** from TDK InvenSense combines a 3-axis accelerometer (±2/4/8/16 g), a 3-axis gyroscope (±250/500/1000/2000 °/s), a die temperature sensor and an AKM **AK8963** 3-axis magnetometer in one package. It talks I2C (up to 400 kHz) or SPI. Hobbyists buy it on the **GY-9250 module**, which has a 3.3 V regulator (3.3–5 V supply), pull-ups on SDA/SCL and pull-downs on AD0 and FSYNC.

## Pinout (GY-9250 module, header order)
| Pin | Function |
|---|---|
| VCC | Supply, 3.3–5 V (on-board 3.3 V regulator) |
| GND | Ground |
| SCL | I2C clock (SPI SCLK) |
| SDA | I2C data (SPI SDI) |
| EDA | Auxiliary I2C data (for external sensors), leave unconnected |
| ECL | Auxiliary I2C clock, leave unconnected |
| AD0 | Address select: low/unconnected = 0x68, high = 0x69 (SPI SDO) |
| INT | Interrupt output (optional) |
| NCS | SPI chip select: leave unconnected or high for I2C |
| FSYNC | Frame sync input, pulled low on the module; leave unconnected |

## Electrical limits
- Chip VDD: 2.4–3.6 V; the module's regulator accepts 3.3–5 V on VCC. The I/O pins are 3.3 V logic.
- Current: about 3.2 mA gyro + 0.45 mA accel + 0.28 mA magnetometer (3.5 mA with all 9 axes).
- I2C up to 400 kHz. Register access is valid up to 100 ms after power-up.

## Interface details
- **I2C address 0x68** (AD0 low), 0x69 (AD0 high). WHO_AM_I (0x75) = **0x71** (MPU-9255: 0x73; an MPU-6500 relabelled as a 9250 reads 0x70 and has no magnetometer).
- Wake: PWR_MGMT_1 (0x6B) = 0x01 (SLEEP off, PLL clock). Optional H_RESET first (0x80, wait 100 ms).
- Ranges: GYRO_CONFIG (0x1B) bits 4:3, ACCEL_CONFIG (0x1C) bits 4:3. Filters: CONFIG (0x1A), ACCEL_CONFIG2 (0x1D).
- Data: burst-read 14 bytes from **0x3B**: accel X, Y, Z, temperature, gyro X, Y, Z, each big-endian two's complement.
- Accel: 16384 LSB/g at ±2 g (8192, 4096, 2048 for ±4/8/16 g). Gyro: 131 LSB/(°/s) at ±250 °/s (65.5, 32.8, 16.4).
- Temperature: T = (TEMP_OUT − 0) / 333.87 + 21 °C.
- Magnetometer: set BYPASS_EN (INT_PIN_CFG 0x37 = 0x02); AK8963 answers at **0x0C** (WIA 0x00 = 0x48). Read the fuse-ROM ASA values (mode 0x0F, regs 0x10–0x12), power down, then CNTL1 (0x0A) = 0x16 (16-bit, 100 Hz continuous). Read HXL..HZH (0x03–0x08, little-endian) **and ST2 (0x09)**; H_adj = H × ((ASA − 128) × 0.5 / 128 + 1) × 0.15 µT.

## Wiring
- ESP32: VCC → 3V3 (or 5V), GND → GND, SDA → D21, SCL → D22.
- Pico: VCC → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from mpu9250 import MPU9250
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
imu = MPU9250(i2c)                 # ±2 g, ±250 °/s
(ax, ay, az), (gx, gy, gz), t = imu.read()
print('A=%.2f,%.2f,%.2f g G=%.1f,%.1f,%.1f dps T=%.1fC' % (ax, ay, az, gx, gy, gz, t))
mx, my, mz = imu.magnetic()        # µT, real hardware with an AK8963 only
```

## Gotchas
- Many GY-9250 boards carry an MPU-6500 (WHO_AM_I 0x70): accel and gyro work, `magnetic()` raises an error.
- The magnetometer's axes differ from the accelerometer's (X and Y swapped, Z inverted); account for it in sensor fusion.
- The gyro has a small offset at rest: average readings while still and subtract.
- Never pull NCS low with I2C; it switches the chip into SPI mode.
- In the Sparkbench simulator only the accelerometer, gyroscope and temperature are modelled (fixed ±2 g / ±250 °/s scaling); the AK8963 at 0x0C is not simulated.

## Datasheet
https://invensense.tdk.com/wp-content/uploads/2015/02/PS-MPU-9250A-01-v1.1.pdf
(register map: RM-MPU-9250A-00; magnetometer: AK8963 datasheet)
