---
name: part-ism330dhcx
description: Pinout, electrical limits, wiring and MicroPython driver for the ISM330DHCX 6-DoF industrial accelerometer & gyroscope (STMicroelectronics ISM330DHCX, Adafruit #4502). Use when designing, wiring, simulating or writing code for an ISM330DHCX in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# ISM330DHCX accelerometer & gyroscope (ISM330DHCX)

## Overview
The **ISM330DHCX** from STMicroelectronics is an industrial-grade 6-axis IMU: a 3-axis accelerometer (±2/4/8/16 g) and a 3-axis gyroscope (±125/250/500/1000/2000/4000 dps), plus a die temperature sensor and a machine-learning core, rated -40 to +105 °C. It talks I2C (or SPI). Hobbyists buy it as the **Adafruit ISM330DHCX 6 DoF IMU (#4502)**, which adds a 3.3 V regulator, level shifting, 10 kΩ I2C pull-ups and two STEMMA QT connectors. Early boards are silkscreened "ISM330DLC" but carry the ISM330DHCX.

## Pinout (Adafruit #4502, main header order)
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
- Chip supply 1.71–3.6 V (absolute max 4.8 V); the breakout takes 3–5 V on VIN.
- Current: about 1.2 mA typ. with both sensors in high-performance mode.
- I2C up to 1 MHz (fast-mode plus).

## Interface details
- **I2C address 0x6A** (DO low), 0x6B (DO high / AD0 jumper bridged). WHO_AM_I (0x0F) = **0x6B**.
- Start-up: CTRL9_XL (0x18) = 0xE2 (DEVICE_CONF, recommended by the datasheet), CTRL3_C (0x12) = 0x44 (BDU + IF_INC), CTRL1_XL (0x10) = 0x40 (104 Hz, ±2 g), CTRL2_G (0x11) = 0x40 (104 Hz, ±250 dps). Both sensors are in power-down after reset.
- Outputs: 16-bit two's complement, low byte first. Gyro X/Y/Z at 0x22–0x27, accel X/Y/Z at 0x28–0x2D, temperature at 0x20–0x21.
- Sensitivity: accel 0.061/0.122/0.244/0.488 mg/LSB (±2/4/8/16 g); gyro 4.375/8.75/17.5/35/70/140 mdps/LSB (±125/250/500/1000/2000/4000 dps).
- Temperature: T = 25 + raw / 256 °C.
- Full-scale codes: FS_XL 00 = 2 g, 01 = 16 g, 10 = 4 g, 11 = 8 g; CTRL2_G[3:0] = FS1_G FS0_G FS_125 FS_4000: 0000 = 250, 0100 = 500, 1000 = 1000, 1100 = 2000, 0010 = 125, 0001 = 4000 dps.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from ism330dhcx import ISM330DHCX
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
imu = ISM330DHCX(i2c)
print(imu.acceleration(), imu.gyro(), imu.temperature())
```

## Gotchas
- WHO_AM_I is 0x6B (LSM6DSOX is 0x6C, LSM6DS3 0x69): code for those chips will reject this one.
- 0x6B is also the I2C address with DO high; an I2C scan showing 0x6B does not mean you read WHO_AM_I.
- Readings are all zero until CTRL1_XL / CTRL2_G set an ODR.
- The temperature is the die temperature with up to ±15 °C offset, not the air temperature.

## Datasheet
https://www.st.com/resource/en/datasheet/ism330dhcx.pdf
