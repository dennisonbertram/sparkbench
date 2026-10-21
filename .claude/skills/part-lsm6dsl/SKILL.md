---
name: part-lsm6dsl
description: Pinout, electrical limits, wiring and MicroPython driver for the LSM6DSL 6-DoF accelerometer & gyroscope (STMicroelectronics LSM6DSL, MikroElektronika LSM6DSL Click MIKROE-2731). Use when designing, wiring, simulating or writing code for an LSM6DSL in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# LSM6DSL accelerometer & gyroscope (LSM6DSL)

## Overview
The **LSM6DSL** from STMicroelectronics is a 6-axis iNEMO IMU: a 3-axis accelerometer (±2/4/8/16 g) and a 3-axis gyroscope (±125/245/500/1000/2000 dps), plus a die temperature sensor. It talks I2C (or SPI). This part models the **MikroElektronika LSM6DSL Click (MIKROE-2731)**, a 3.3 V mikroBUS board with 4.7 kΩ I2C pull-ups, a power LED and jumpers for interface, interrupt and address selection.

## Pinout (LSM6DSL Click, mikroBUS headers)
| Pin | Function |
|---|---|
| AN, RST, PWM, TX, RX | Not connected |
| CS, SCK, MISO, MOSI | SPI only (disconnected with COMM SEL on I2C) |
| 3V3 | Supply 3.3 V (chip, pull-ups, LED) |
| GND, GND2 | Ground |
| INT | INT1 (INT SEL default) or INT2, optional |
| SCL | I2C clock, 4.7 kΩ pull-up to 3.3 V |
| SDA | I2C data, 4.7 kΩ pull-up to 3.3 V |
| 5V | Not connected |

Left header: AN, RST, CS, SCK, MISO, MOSI, 3V3, GND. Right header: PWM, INT, TX, RX, SCL, SDA, 5V, GND.

## Electrical limits
- Chip supply 1.71–3.6 V (absolute max 4.8 V); the Click is a 3.3 V board. Never feed 5 V.
- Current: 0.65 mA in high-performance mode, plus a few mA for the power LED.
- I2C up to 400 kHz.

## Interface details
- **Jumpers first:** the board ships set to SPI. Move all four COMM SEL jumpers (JP1, JP2, JP3, JP5) to I2C. Keep MODE SEL (JP6, JP7) on 1.
- **I2C address 0x6A** (ADD SEL on 0, default), 0x6B (ADD SEL on 1). WHO_AM_I (0x0F) = **0x6A**.
- Start-up: CTRL3_C (0x12) = 0x44 (BDU + IF_INC), CTRL1_XL (0x10) = 0x40 (104 Hz, ±2 g), CTRL2_G (0x11) = 0x40 (104 Hz, ±245 dps). Both sensors are in power-down after reset.
- Outputs: 16-bit two's complement, low byte first. Gyro X/Y/Z at 0x22–0x27, accel X/Y/Z at 0x28–0x2D, temperature at 0x20–0x21.
- Sensitivity: accel 0.061/0.122/0.244/0.488 mg/LSB (±2/4/8/16 g); gyro 4.375/8.75/17.5/35/70 mdps/LSB (±125/245/500/1000/2000 dps).
- Temperature: T = 25 + raw / 256 °C.
- Full-scale codes: FS_XL 00 = 2 g, 01 = 16 g, 10 = 4 g, 11 = 8 g; FS_G 00 = 245, 01 = 500, 10 = 1000, 11 = 2000 dps, FS_125 = 1 for 125 dps.

## Wiring
- ESP32: 3V3 → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: 3V3 → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: 3V3 → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from lsm6dsl import LSM6DSL
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
imu = LSM6DSL(i2c)
print(imu.acceleration(), imu.gyro(), imu.temperature())
```

## Gotchas
- No answer on I2C almost always means the COMM SEL jumpers are still on SPI.
- WHO_AM_I is 0x6A (the LSM6DSM shares it); the LSM6DS3 is 0x69 and uses 16 LSB/°C for temperature, so its code does not fit this chip.
- The default gyro range is ±245 dps (not 250); 8.75 mdps/LSB.
- Readings are all zero until CTRL1_XL / CTRL2_G set an ODR.
- The temperature is the die temperature with up to ±15 °C offset, not the air temperature.

## Datasheet
https://www.st.com/resource/en/datasheet/lsm6dsl.pdf
