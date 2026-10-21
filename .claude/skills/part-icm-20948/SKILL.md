---
name: part-icm-20948
description: Pinout, electrical limits, wiring and MicroPython driver for the ICM-20948 9-DoF IMU (TDK InvenSense ICM-20948 accelerometer, gyroscope and AK09916 magnetometer). Use when designing, wiring, simulating or writing code for an ICM-20948 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# ICM-20948 9-DoF IMU (ICM-20948)

## Overview
The **ICM-20948** from TDK InvenSense combines a 3-axis accelerometer (±2/4/8/16 g), a 3-axis gyroscope (±250/500/1000/2000 °/s), a temperature sensor and an AK09916 3-axis magnetometer (±4900 µT) in one 3×3 mm chip. It talks I2C or SPI. The chip runs at 1.8 V, so hobbyists buy it on the **Adafruit ICM-20948 9-DoF IMU breakout (#4554)**, which has a 1.8 V regulator, level shifters and 10 kΩ pull-ups so it works with 3.3 V and 5 V boards.

## Pinout (Adafruit #4554, header by header, left to right)
Bottom header:

| Pin | Function |
|---|---|
| VIN | Supply, 3–5 V |
| 1V8 | 1.8 V regulator output (not an input; leave unconnected) |
| GND | Ground |
| SCL | I2C clock (SPI SCK), 10 kΩ pull-up |
| SDA | I2C data (SPI SDI), 10 kΩ pull-up |
| INT | Interrupt output (optional) |

Top header:

| Pin | Function |
|---|---|
| FS | FSYNC input, 1.8 V logic only |
| AD | Auxiliary I2C data, 1.8 V logic only |
| AC | Auxiliary I2C clock, 1.8 V logic only |
| G | Ground |
| SDO | Address select (SPI SDO): high (default) = 0x69, low = 0x68 |
| CS | SPI chip select, pulled high for I2C |

## Electrical limits
- Board supply: 3–5 V on VIN (the chip itself: VDD 1.71–3.6 V, VDDIO 1.71–1.95 V, supplied by the regulator).
- Current: about 3 mA with accelerometer and gyroscope on.
- FS, AD and AC are 1.8 V logic only: never connect them to 3.3 V or 5 V.
- I2C up to 400 kHz.

## Interface details
- **I2C address 0x69** (SDO pulled high on the board), 0x68 with SDO tied low.
- Four register banks, chosen with REG_BANK_SEL (0x7F, bank in bits 5:4). Data registers are in bank 0; GYRO_CONFIG_1 (0x01) and ACCEL_CONFIG (0x14) are in bank 2 (reset value 0x01 = ±250 °/s, ±2 g, DLPF on).
- WHO_AM_I (0x00) = **0xEA**. PWR_MGMT_1 (0x06) resets to 0x41 (asleep): write 0x80 to reset, then 0x01 to wake with the auto clock; the gyro needs about 35 ms.
- Burst-read 14 bytes from **0x2D**: accel X/Y/Z, gyro X/Y/Z, temperature, each a big-endian signed 16-bit word.
- Accel = raw / 16384 g (±2 g). Gyro = raw / 131 °/s (±250 °/s). Temperature = raw / 333.87 + 21 °C.
- Magnetometer: clear I2C_MST_EN (USER_CTRL 0x03 bit 5), set BYPASS_EN (INT_PIN_CFG 0x0F bit 1); the AK09916 answers at **0x0C** (WIA2 0x01 = 0x09). CNTL2 (0x31) = 0x08 for continuous 100 Hz; read 0x11–0x18 (X/Y/Z little-endian, 0.15 µT/LSB, then ST2 last).

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.
- Or use a STEMMA QT / Qwiic cable.

## Using the driver
```python
from machine import I2C, Pin
from icm20948 import ICM20948
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
imu = ICM20948(i2c)            # addr=0x68 if SDO is tied low
(ax, ay, az), (gx, gy, gz), t = imu.read()
print('A=%.2f,%.2f,%.2f g G=%.1f,%.1f,%.1f dps T=%.1fC' % (ax, ay, az, gx, gy, gz, t))
mx, my, mz = imu.magnetic()    # µT, real hardware only
```

## Gotchas
- Temperature comes **after** the gyro in the burst (0x39), unlike the MPU-6050/9250.
- The board's default address is 0x69, not 0x68.
- The Sparkbench simulator models the accelerometer, gyroscope and temperature, not the AK09916 magnetometer; `magnetic()` only works on real hardware.
- The magnetometer's axes differ from the accelerometer's; align them before computing a compass heading.
- At rest, Z reads about +1 g and the gyro reads a small offset; average readings at rest and subtract.

## Datasheet
https://cdn.sparkfun.com/assets/7/f/e/c/d/DS-000189-ICM-20948-v1.3.pdf
