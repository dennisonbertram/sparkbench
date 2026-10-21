---
name: part-gy-91
description: Pinout, electrical limits, wiring and MicroPython driver for the GY-91 10-DoF module (TDK InvenSense MPU-9250 accelerometer/gyroscope/AK8963 magnetometer + Bosch BMP280 barometer). Use when designing, wiring, simulating or writing code for a GY-91 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# GY-91 10-DoF module (MPU-9250 + BMP280)

## Overview
The **GY-91** is a small purple board carrying two sensors on one I2C bus:
- **MPU-9250** (0x68): 3-axis accelerometer (±2/4/8/16 g), 3-axis gyroscope (±250–2000 °/s), die temperature, and an **AK8963** magnetometer (0.15 µT/LSB) that appears at **0x0C** once I2C bypass is enabled.
- **BMP280** (0x76): air pressure (300–1100 hPa, ±1 hPa) and temperature.

It has a 662K 3.3 V LDO and MOSFET level shifters on SDA/SCL, so VIN takes 3.0–5.0 V.

## Pinout (GY-91 header order)
| Pin | Function |
|---|---|
| VIN | Supply 3.0–5.0 V into the on-board 3.3 V regulator |
| 3V3 | Regulator **output**: leave unconnected |
| GND | Ground |
| SCL | I2C clock (SPI SCLK) |
| SDA | I2C data (SPI SDI) |
| SDO/SAO | Address select for both chips: low (default) = 0x68 / 0x76, 3.3 V = 0x69 / 0x77 |
| NCS | MPU-9250 SPI chip select: leave unconnected for I2C |
| CSB | BMP280 SPI chip select: leave unconnected for I2C |

## Electrical limits
- VIN 3.0–5.0 V; chips run at 3.3 V (MPU-9250 VDD 2.4–3.6 V, BMP280 1.71–3.6 V, abs. max 4.0 / 4.25 V).
- About 5 mA with everything running.
- SDA/SCL are pulled up to **VIN** on the host side of the level shifter: with a 3.3 V microcontroller, feed VIN from 3.3 V so the bus never sees 5 V.
- SDO/SAO, NCS and CSB connect straight to the 3.3 V chips: never drive them with 5 V.

## Interface details
- MPU-9250: WHO_AM_I 0x75 = 0x71. Wake with PWR_MGMT_1 (0x6B) = 0x01. Burst-read 14 bytes from 0x3B: accel X/Y/Z, temperature, gyro X/Y/Z, big-endian signed. ±2 g: 16384 LSB/g; ±250 °/s: 131 LSB/(°/s); T = raw / 333.87 + 21 °C.
- AK8963: set INT_PIN_CFG (0x37) = 0x02, then at 0x0C: WIA 0x00 = 0x48; read ASA (0x10–0x12) in fuse-ROM mode (CNTL1 0x0A = 0x0F); CNTL1 = 0x16 for 16-bit continuous 100 Hz; read HXL..HZH + ST2 (0x03–0x09, little-endian). µT = raw × 0.15 × ((ASA − 128)/256 + 1).
- BMP280: chip id 0xD0 = 0x58; calibration 0x88–0x9F; forced mode ctrl_meas 0xF4 = 0x25, wait ≥ 6.4 ms, read 0xF7–0xFC; Bosch compensation formulas (section 8.1), temperature first (t_fine).

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → GPIO21, SCL → GPIO22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from gy91 import GY91
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
gy = GY91(i2c)
(ax, ay, az), (gx, gy_, gz), t = gy.imu.read()
mx, my, mz = gy.imu.magnetic()
temp, hpa = gy.baro.read()
```

## Gotchas
- Many GY-91 boards carry an MPU-6500 (WHO_AM_I 0x70) instead of an MPU-9250: no magnetometer, 0x0C never answers.
- The magnetometer only shows up after BYPASS_EN is set; the driver does this.
- AK8963 axes are not the accelerometer's (X/Y swapped, Z inverted); account for it in sensor fusion.
- Pulling CSB low (even briefly) switches the BMP280 to SPI until power is cycled.
- Calibrate the gyro offset (average at rest) and the compass hard-iron offset (rotate in all directions).

## Datasheets
- MPU-9250: https://invensense.tdk.com/wp-content/uploads/2015/02/PS-MPU-9250A-01-v1.1.pdf
- AK8963: https://download.mikroe.com/documents/datasheets/ak8963c-datasheet.pdf
- BMP280: https://www.bosch-sensortec.com/media/boschsensortec/downloads/datasheets/bst-bmp280-ds001.pdf
