---
name: part-lsm9ds1
description: Pinout, electrical limits, wiring and MicroPython driver for the LSM9DS1 9-DoF IMU (STMicroelectronics LSM9DS1 accelerometer, gyroscope & magnetometer, Adafruit 9-DOF LSM9DS1 breakout). Use when designing, wiring, simulating or writing code for an LSM9DS1 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# LSM9DS1 9-DoF IMU (LSM9DS1)

## Overview
The **LSM9DS1** from STMicroelectronics combines a 3-axis accelerometer (±2/±4/±8/±16 g), a 3-axis gyroscope (±245/±500/±2000 dps), a 3-axis magnetometer (±4/±8/±12/±16 gauss) and a die temperature sensor. On I2C it shows up as **two chips**: accelerometer + gyroscope at **0x6B** and magnetometer at **0x1E**. This part models the **Adafruit 9-DOF LSM9DS1 Breakout Board - STEMMA QT / Qwiic (product 4634, Rev C)**. That board has a 3.3 V regulator (AP2112K), level-shifted SCL/SDA with 10 kΩ pull-ups, and 10 kΩ pull-ups on CSAG, CSM, SDOAG and SDOM, so it comes up in I2C mode at 0x6B / 0x1E.

## Pinout (Adafruit 4634, as printed on the board)
9-pin header, left to right:

| Pin | Function |
|---|---|
| Vin | Supply, 3–5 V (on-board 3.3 V regulator) |
| 3Vo | 3.3 V regulator output (up to 100 mA); not an input |
| GND | Ground |
| SCL | I2C clock / SPI clock (level-shifted, 10 kΩ pull-up) |
| SDA | I2C data / SPI MOSI (level-shifted, 10 kΩ pull-up) |
| CSAG | Accel/gyro SPI chip select: leave unconnected for I2C |
| CSM | Magnetometer SPI chip select: leave unconnected for I2C |
| SDOAG | Accel/gyro address bit (high = 0x6B, GND = 0x6A) / SPI MISO |
| SDOM | Magnetometer address bit (high = 0x1E, GND = 0x1C) / SPI MISO (printed "DOM" on the back) |

5-pin header, left to right (optional, 3.3 V logic): DEN, INT2, INT1, INTM, DRDY. INT1/INT2 come from the accel/gyro. INTM is the magnetometer interrupt and DRDY is the magnetometer data-ready output.

## Electrical limits
- Chip: 1.9–3.6 V (absolute max 4.8 V). The board: **3–5 V on Vin**. SCL/SDA and the CS pins are level-shifted. The SDO, INT and DRDY pins are 3.3 V outputs.
- Current: about 4.6 mA with everything running (gyro 4.0 mA + accel/mag 0.6 mA).
- I2C up to 400 kHz.

## Interface details
- WHO_AM_I (0x0F) reads **0x68** at 0x6B and **0x3D** at 0x1E.
- Accel/gyro: CTRL_REG8 (0x22) = 0x44 (BDU + IF_ADD_INC), CTRL_REG1_G (0x10) = 0x60 (119 Hz, ±245 dps), CTRL_REG6_XL (0x20) = 0x60 (119 Hz, ±2 g). FS_XL coding: 00 = 2 g, 01 = **16 g**, 10 = 4 g, 11 = 8 g.
- Magnetometer: CTRL_REG1_M (0x20) = 0xF0 (temperature compensation, ultra-high performance, 10 Hz), CTRL_REG2_M (0x21) = 0x00 (±4 gauss), CTRL_REG4_M (0x23) = 0x0C, CTRL_REG5_M (0x24) = 0x40 (BDU), CTRL_REG3_M (0x22) = 0x00 (continuous; **it powers up in power-down**).
- Outputs are 16-bit two's complement, **low byte first**. Gyro 0x18–0x1D, accel 0x28–0x2D and temperature 0x15–0x16 are at 0x6B. Magnetometer 0x28–0x2D is at 0x1E.
- Sensitivity: accel 0.061/0.122/0.244/0.732 mg/LSB. Gyro 8.75/17.5/70 mdps/LSB. Mag 0.14/0.29/0.43/0.58 mgauss/LSB. Temperature: T = 25 + raw/16 °C.
- Magnetometer burst reads need **bit 7 of the register address set** (0xA8). The accel/gyro auto-increments by itself through IF_ADD_INC.

## Wiring
- ESP32: Vin → 3V3, GND → GND, SDA → D21, SCL → D22. Leave every other pin unconnected.
- Pico: Vin → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: Vin → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.
- You can also plug in a STEMMA QT / Qwiic cable instead of using the header.

## Using the driver
```python
from machine import I2C, Pin
from lsm9ds1 import LSM9DS1
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
imu = LSM9DS1(i2c)            # ag_addr=0x6A / mag_addr=0x1C if SDOAG / SDOM are grounded
print(imu.acceleration())     # (x, y, z) in g
print(imu.gyro())             # (x, y, z) in degrees per second
print(imu.magnetic())         # (x, y, z) in gauss
print(imu.temperature())      # die temperature in °C
```

## Gotchas
- A magnetometer that reads all zeros was never taken out of power-down (CTRL_REG3_M = 0x00).
- If all six magnetometer bytes are identical, the 0x80 auto-increment bit is missing from the address.
- Some libraries scale the temperature as raw/8 around 21 °C. The ST datasheet gives 16 LSB/°C with 0 at 25 °C, and it is a die temperature, not air temperature.
- The magnetometer needs hard-iron/soft-iron calibration before you use it as a compass. The gyro has a zero-rate offset (up to ±30 dps at 2000 dps), so subtract the average of a few still readings.
- On the older blue Adafruit 3387 board the DRDY and INTM header positions are swapped.

## Datasheet
https://www.st.com/resource/en/datasheet/lsm9ds1.pdf
