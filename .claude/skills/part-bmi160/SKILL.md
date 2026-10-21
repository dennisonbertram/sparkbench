---
name: part-bmi160
description: Pinout, electrical limits, wiring and MicroPython driver for the BMI160 6-axis IMU (Bosch BMI160 accelerometer + gyroscope, GY-BMI160 module). Use when designing, wiring, simulating or writing code for a BMI160 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# BMI160 6-axis IMU (BMI160)

## Overview
The **BMI160** from Bosch Sensortec combines a 16-bit 3-axis accelerometer (±2/4/8/16 g) and a 3-axis gyroscope (±125…±2000 °/s), plus a die temperature sensor. It talks I2C (or SPI). Hobbyists buy it on the purple **GY-BMI160** module: a 3.3 V LDO regulator on VIN, 10 kΩ pull-ups on SDA, SCL, CS and SAO, and 12 pins on two edges.

## Pinout (GY-BMI160, header by header as printed)
Main header (7 pins):
| Pin | Function |
|---|---|
| VIN | Supply into the 3.3 V regulator, 3.3–5 V |
| 3V3 | 3.3 V straight to the chip (max 3.6 V); use VIN or 3V3, not both |
| GND | Ground |
| SCL | I2C clock (SPI SCK) |
| SDA | I2C data (SPI MOSI) |
| CS | Chip select; pulled high on the board = I2C mode (leave open) |
| SAO | Address select (chip SDO / SPI MISO): open = 0x69, GND = 0x68 |

Second header (5 pins, optional):
| Pin | Function |
|---|---|
| OCS | OCSB, secondary OIS SPI chip select |
| INT2 | Interrupt output 2 |
| INT1 | Interrupt output 1 |
| SCX | ASCX, auxiliary magnetometer clock |
| SDX | ASDX, auxiliary magnetometer data |

## Electrical limits
- Chip: VDD 1.71–3.6 V, VDDIO 1.2–3.6 V (absolute max 4.25 V). Module VIN: 3.3–5 V (vendor rating 3–5 V).
- Current: about 0.9 mA with accel + gyro in normal mode, a few µA in suspend.
- I2C standard and fast mode (400 kHz).

## Interface details
- **I2C address 0x69** on the GY-BMI160 (SAO pulled up); 0x68 with SAO to GND.
- CHIP_ID register 0x00 reads **0xD1**.
- After power-up both sensors are in suspend mode and read zero. Write CMD 0x7E = **0xB6** (soft reset, wait ≥ 1 ms), **0x11** (accel normal, wait 3.8 ms), **0x15** (gyro normal, wait 80 ms).
- ACC_RANGE 0x41: 0x03 = ±2 g (16384 LSB/g), 0x05 ±4 g, 0x08 ±8 g, 0x0C ±16 g.
- GYR_RANGE 0x43: 0x00 = ±2000 °/s (16.4 LSB/°/s) … 0x04 = ±125 °/s (262.4 LSB/°/s).
- Data, 16-bit two's complement, **low byte first**: gyro X/Y/Z 0x0C–0x11, accel X/Y/Z 0x12–0x17. Read all 12 bytes in one burst so the axes belong together.
- Temperature 0x20–0x21: T = 23 + raw / 512 °C (valid while the gyro is in normal mode).

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22 (CS and SAO unconnected → 0x69).
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from bmi160 import BMI160
imu = BMI160(I2C(0, sda=Pin(21), scl=Pin(22)))  # addr=0x68 if SAO is tied to GND
(ax, ay, az), (gx, gy, gz) = imu.read()        # g and deg/s
print(ax, ay, az, gx, gy, gz, imu.temperature())
```

## Gotchas
- Reads of all zeros: the sensors were never switched out of suspend mode (CMD 0x11 / 0x15).
- Scanner finds 0x69, not 0x68: that is normal for this module (SAO pulled up). Some libraries default to 0x68.
- Don't pull CS low or toggle it: a rising edge on CS switches the chip to SPI until the next power cycle.
- The chip temperature runs a few degrees above the air; it is not an ambient thermometer.
- Some sellers ship an LSM6DS3 on an identical-looking board (silkscreen "I160 / 6DS3"); check CHIP_ID = 0xD1.

## Datasheet
https://www.bosch-sensortec.com/media/boschsensortec/downloads/datasheets/bst-bmi160-ds000.pdf
