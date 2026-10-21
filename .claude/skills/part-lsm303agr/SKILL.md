---
name: part-lsm303agr
description: Pinout, electrical limits, wiring and MicroPython driver for the LSM303AGR accelerometer & magnetometer (STMicroelectronics LSM303AGR). Use when designing, wiring, simulating or writing code for an LSM303AGR in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# LSM303AGR accelerometer & magnetometer (LSM303AGR)

## Overview
The **LSM303AGR** from STMicroelectronics combines a 3-axis accelerometer (±2/4/8/16 g) and a 3-axis magnetometer (±50 gauss) in one package. Over I2C it shows up as **two chips**: the accelerometer at **0x19** and the magnetometer at **0x1E**. It is used for tilt sensing and as a tilt-compensated compass. Hobbyists buy it on the **Adafruit LSM303AGR Accelerometer Magnetometer (STEMMA QT, product 4413)**, which has a 3.3 V regulator, I2C level shifting and 10 kΩ pull-ups, so it runs from 3-5 V.

## Pinout (Adafruit 4413, header by header as printed)
Main header (6 pins):
| Pin | Function |
|---|---|
| VIN | Supply, 3-5 V |
| 3V | 3.3 V regulator output (up to 100 mA), leave unconnected |
| GND | Ground |
| SCL | I2C clock (level-shifted, 10 kΩ pull-up) |
| SDA | I2C data (level-shifted, 10 kΩ pull-up) |
| INTM | Magnetometer interrupt/data-ready, 3.3 V logic (optional) |

Second header (4 pins, opposite edge):
| Pin | Function |
|---|---|
| CSM | Magnetometer SPI chip select, pulled up (leave open for I2C) |
| CSA | Accelerometer SPI chip select, pulled up (leave open for I2C) |
| IA1 | Accelerometer interrupt 1, 3.3 V logic (optional) |
| IA2 | Accelerometer interrupt 2, 3.3 V logic (optional) |

## Electrical limits
- Chip: Vdd 1.71-3.6 V (absolute max 4.8 V). The Adafruit board regulates VIN (3-5 V) down to 3.3 V.
- Current: about 22 µA accelerometer (100 Hz, HR) plus about 0.2 mA magnetometer (10 Hz continuous); the board's power LED adds about 1 mA.
- Interrupt and CS pins are 3.3 V only, not level-shifted.

## Interface details
- Accelerometer (0x19): WHO_AM_I_A 0x0F = 0x33. CTRL_REG1_A 0x20 = **0x57** (100 Hz, X/Y/Z on, LPen 0); CTRL_REG4_A 0x23 = **0x88** (BDU, ±2 g, HR 12-bit). STATUS_REG_A 0x27 bit 3 = new XYZ data.
- Read 6 bytes from OUT_X_L_A 0x28 **with bit 7 set (0xA8)** so the address auto-increments. Each axis is little-endian, 12-bit two's complement left-justified: `raw >> 4`, then × **0.98 mg/LSB** (±2 g HR; 1.95 at ±4 g, 3.9 at ±8 g, 11.72 at ±16 g).
- Magnetometer (0x1E): WHO_AM_I_M 0x4F = 0x40. CFG_REG_A_M 0x60 = **0x80** (COMP_TEMP_EN must be 1; HR, 10 Hz, continuous); CFG_REG_C_M 0x62 = **0x10** (BDU). STATUS_REG_M 0x67 bit 3 = new data.
- Read 6 bytes from OUTX_L_REG_M 0x68: little-endian 16-bit two's complement × **1.5 mgauss/LSB**.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.
- Or use a STEMMA QT / Qwiic cable.

## Using the driver
```python
from machine import I2C, Pin
from lsm303agr import LSM303AGR
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
imu = LSM303AGR(i2c)
ax, ay, az = imu.acceleration()   # mg
mx, my, mz = imu.magnetic()       # mgauss
```

## Gotchas
- An I2C scan shows two addresses (0x19 and 0x1E); that is one board, not two.
- Forgetting bit 7 on the accelerometer register address reads the same byte six times.
- Accelerometer values must be shifted right by 4 (HR mode) before scaling.
- Keep the magnetometer away from motors, speakers, magnets and current-carrying wires; calibrate hard-iron offsets for a real compass.
- Lying flat and still, Z reads about +1000 mg (gravity).

## Datasheet
https://www.st.com/resource/en/datasheet/lsm303agr.pdf
