---
name: part-qmi8658
description: Pinout, electrical limits, wiring and MicroPython driver for the QMI8658 6-axis IMU (QST QMI8658A/C accelerometer + gyroscope, purple 8-pin module). Use when designing, wiring, simulating or writing code for a QMI8658 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# QMI8658 6-axis IMU (QMI8658)

## Overview
The **QMI8658** (QMI8658A / QMI8658C) from QST combines a 16-bit 3-axis accelerometer (±2/4/8/16 g) and a 3-axis gyroscope (±16…±2048 °/s), plus a die temperature sensor. It talks I2C (also SPI and I3C). Hobbyists buy it on the purple **"QMI8658 Sensor Module Compatible with BMI160"** board (21 × 16.4 mm): a 3.3 V LDO on VCC, 4.7 kΩ pull-ups, a power LED and 8 pins in one row.

## Pinout (purple module, left to right from the square VCC pad)
| Pin | Function |
|---|---|
| VCC | Supply into the 3.3 V regulator, 3–5 V |
| GND | Ground |
| SCL | I2C clock (pulled up on the board) |
| SDA | I2C data (pulled up on the board) |
| XDA | Auxiliary I2C master data (chip SDx), for an external magnetometer; leave open |
| XCL | Auxiliary I2C master clock (chip SCx); leave open |
| AD0 | Address select (chip SDO/SA0): open/high = 0x6A, GND = 0x6B |
| INT | Interrupt output; not needed for basic use (silkscreen may read "NT", cut off at the edge) |

## Electrical limits
- Chip: VDD and VDDIO 1.71–3.6 V (absolute max 3.6 V). Module VCC: 3–5 V through the on-board regulator.
- Current: about 0.7 mA with accel + gyro running, plus the power LED.
- I2C standard and fast mode (400 kHz).

## Interface details
- **I2C address 0x6A** with AD0 open (internal 200 kΩ pull-up on SA0, sampled at reset); **0x6B** with AD0 tied to GND.
- WHO_AM_I register 0x00 reads **0x05**; REVISION_ID 0x01.
- Soft reset: write **0xB0** to 0x60, wait at least 15 ms (the chip NACKs while resetting). Register 0x4D reads 0x80 after a good reset.
- CTRL1 0x02 = **0x60**: bit 6 turns on register auto-increment for burst reads (bit 5 left at its reset value, as QST's reference driver does).
- CTRL2 0x03: aFS bits 6:4 (0 = ±2 g 16384 LSB/g, 1 = ±4 g 8192, 2 = ±8 g 4096, 3 = ±16 g 2048), aODR bits 3:0.
- CTRL3 0x04: gFS bits 6:4 (0 = ±16 °/s 2048 LSB/°/s … 5 = ±512 °/s 64 … 7 = ±2048 °/s 16), gODR bits 3:0.
- CTRL7 0x08 = **0x03** enables accel + gyro. Gyro turn-on takes 150 ms + 3/ODR.
- Data, 16-bit two's complement, **low byte first**: TEMP 0x33–0x34, accel X/Y/Z 0x35–0x3A, gyro X/Y/Z 0x3B–0x40. A 14-byte burst from 0x33 gets everything at once.
- Temperature: T = TEMP_H + TEMP_L / 256 °C (256 LSB/°C).

## Wiring
- ESP32: VCC → 3V3, GND → GND, SDA → D21, SCL → D22 (AD0 open → 0x6A).
- Pico: VCC → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from qmi8658 import QMI8658
imu = QMI8658(I2C(0, sda=Pin(21), scl=Pin(22)))   # tries 0x6A then 0x6B; ±4 g, ±512 dps
(ax, ay, az), (gx, gy, gz), t = imu.read()          # g, deg/s, degC
print(ax, ay, az, gx, gy, gz, t)
```
Other ranges: `QMI8658(i2c, accel_range=8, gyro_range=2048)`.

## Gotchas
- All readings zero: the sensors were never enabled (CTRL7 = 0x03), or you read before the 150 ms gyro start-up.
- Some libraries default to 0x6B (boards that tie SA0 low, like many Waveshare ESP32 boards). On this module with AD0 open it is 0x6A.
- Burst reads return the same register repeatedly unless CTRL1 bit 6 (auto-increment) is set.
- Right after the soft reset the chip NACKs for a few ms; wait before talking to it again.
- This is not an MPU6050 or BMI160 despite the listing title: register map, chip ID and address all differ, so their libraries will not work.
- The chip temperature runs above the air temperature; it is not an ambient thermometer.

## Datasheet
https://www.qstcorp.com/upload/pdf/202301/13-52-25%20QMI8658A%20Datasheet%20Rev%20A.pdf
