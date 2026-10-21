---
name: part-lsm6dso32
description: Pinout, electrical limits, wiring and MicroPython driver for the LSM6DSO32 6-DoF accelerometer (±4–32 g) & gyroscope (STMicroelectronics LSM6DSO32, Adafruit #4692). Use when designing, wiring, simulating or writing code for an LSM6DSO32 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# LSM6DSO32 accelerometer & gyroscope (LSM6DSO32)

## Overview
The **LSM6DSO32** from STMicroelectronics is a 6-axis IMU: a 3-axis accelerometer with an extended range (±4/8/16/32 g) and a 3-axis gyroscope (±125/250/500/1000/2000 dps), plus a die temperature sensor. It talks I2C (or SPI). Hobbyists buy it as the **Adafruit LSM6DSO32 6-DoF Accelerometer and Gyroscope (#4692)**, which adds a 3.3 V regulator, level shifting, 10 kΩ I2C pull-ups and two STEMMA QT connectors. Newer boards may carry the pin- and register-compatible LSM6DSO32X.

## Pinout (Adafruit #4692, main header order)
| Pin | Function |
|---|---|
| VIN | Supply 3–5 V (on-board 3.3 V regulator) |
| 3Vo | 3.3 V regulator output (up to 100 mA), leave unconnected |
| GND | Ground |
| SCL | I2C clock / SPI SCK |
| SDA | I2C data / SPI SDI |
| DO | SDO/SA0: address bit (low/unconnected = 0x6A, high = 0x6B) / SPI data out |
| CS | Leave unconnected for I2C (pulled up); SPI chip select |
| I1 | INT1 interrupt output (optional) |
| I2 | INT2 interrupt output (optional) |

A second 5-pin header (SCX, SDX, CS, DO, GND) is the auxiliary sensor-hub / OIS interface; it is not needed for normal use and is not modelled.

## Electrical limits
- Chip supply 1.71–3.6 V; the breakout takes 3–5 V on VIN.
- Current: about 0.55 mA with both sensors in high-performance mode.
- I2C up to 1 MHz.

## Interface details
- **I2C address 0x6A** (DO low), 0x6B (DO high / AD0 jumper bridged). WHO_AM_I (0x0F) = **0x6C** (same as the LSM6DSOX).
- Start-up: CTRL3_C (0x12) = 0x44 (BDU + IF_INC), CTRL1_XL (0x10) = 0x40 (104 Hz, ±4 g), CTRL2_G (0x11) = 0x40 (104 Hz, ±250 dps). Both sensors are in power-down after reset.
- Outputs: 16-bit two's complement, low byte first. Gyro X/Y/Z at 0x22–0x27, accel X/Y/Z at 0x28–0x2D, temperature at 0x20–0x21.
- Sensitivity: accel 0.122/0.244/0.488/0.976 mg/LSB (±4/8/16/32 g); gyro 4.375/8.75/17.5/35/70 mdps/LSB (±125/250/500/1000/2000 dps).
- Temperature: T = 25 + raw / 256 °C.
- Full-scale codes: FS_XL 00 = 4 g, 01 = 32 g, 10 = 8 g, 11 = 16 g; FS_G 00 = 250, 01 = 500, 10 = 1000, 11 = 2000 dps, FS_125 = 1 for 125 dps.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from lsm6dso32 import LSM6DSO32
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
imu = LSM6DSO32(i2c, accel_fs=16)
print(imu.acceleration(), imu.gyro(), imu.temperature())
```

## Gotchas
- WHO_AM_I is 0x6C, the same as the LSM6DSOX, so LSM6DSOX code "finds" this chip but uses the wrong accelerometer scale: every FS code means double the range here (00 = ±4 g, not ±2 g). Use the LSM6DSO32 sensitivities.
- Readings are all zero until CTRL1_XL / CTRL2_G set an ODR.
- The temperature is the die temperature, not the air temperature.

## Datasheet
https://www.st.com/resource/en/datasheet/lsm6dso32.pdf
