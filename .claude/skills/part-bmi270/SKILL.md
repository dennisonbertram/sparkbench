---
name: part-bmi270
description: Pinout, electrical limits, wiring and MicroPython driver for the BMI270 6-axis IMU (Bosch BMI270 accelerometer + gyroscope, SparkFun 6DoF IMU Breakout - BMI270 (Qwiic) SEN-22397). Use when designing, wiring, simulating or writing code for a BMI270 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# BMI270 6-axis IMU (BMI270)

## Overview
The **BMI270** from Bosch Sensortec is an ultra-low-power IMU: a 16-bit 3-axis accelerometer (±2/4/8/16 g), a 16-bit 3-axis gyroscope (±125…±2000 °/s) and a die temperature sensor, over I2C or SPI. Unlike the older BMI160 it has an internal feature engine that must be loaded with an **8 kB configuration file after every power-up**; until then the sensors do not run. The modelled board is the **SparkFun 6DoF IMU Breakout - BMI270 (Qwiic), SEN-22397**: 1×1 inch, two Qwiic connectors, 2.2 kΩ I2C pull-ups, no voltage regulator, and two 6-pin 0.1" headers on opposite edges.

## Pinout (SparkFun SEN-22397, header by header as printed)
Bottom header (6 pins):
| Pin | Function |
|---|---|
| GND | Ground |
| 3V3 | Supply straight to the chip, 1.71–3.6 V (no regulator: never 5 V) |
| SDA | I2C data (SPI PICO) – 2.2 kΩ pull-up on the board |
| SCL | I2C clock (SPI SCK) – 2.2 kΩ pull-up on the board |
| ADR | Address select (chip SDO / SPI POCI): default 100 kΩ to GND = 0x68 |
| CS | Chip select, 100 kΩ pull-up = I2C mode (leave open) |

Top header (6 pins, optional):
| Pin | Function |
|---|---|
| ASDX | Auxiliary I2C data (external magnetometer) |
| ASCX | Auxiliary I2C clock |
| INT1 | Interrupt output 1 |
| INT2 | Interrupt output 2 |
| OCS | OIS secondary SPI chip select |
| OSDO | OIS secondary SPI data out |

## Electrical limits
- VDD 1.71–3.6 V, VDDIO 1.2–3.6 V, absolute max 4 V on any supply pin. The board ties both to 3V3: **3.3 V only**.
- Current: about 0.7 mA accel + gyro normal mode (970 µA performance mode), plus the power LED (~1 mA, cut the PWR jumper to remove).
- I2C up to 400 kHz fast mode (1 MHz fast-mode plus per datasheet).

## Interface details
- **I2C address 0x68** (ADR jumper default, GND side); 0x69 with the jumper moved to the 3.3 V side.
- CHIP_ID register 0x00 reads **0x24**.
- Init (datasheet 4.4): optional soft reset CMD 0x7E = 0xB6 → PWR_CONF 0x7C = 0x00, wait ≥ 450 µs → INIT_CTRL 0x59 = 0x00 → write the 8192-byte `bmi270_config_file` (Bosch BMI270_SensorAPI, bmi270.c) to INIT_DATA 0x5E (in chunks: before each chunk write INIT_ADDR_0/1 0x5B/0x5C = offset/2, low 4 bits then bits 11:4) → INIT_CTRL = 0x01 → wait 20 ms, INTERNAL_STATUS 0x21 bits 3:0 must be 1.
- INIT_CTRL = 0x01 may be written only once per power-on or soft reset, so the driver soft-resets first.
- Normal mode: ACC_CONF 0x40 = 0xA8, GYR_CONF 0x42 = 0xA9, PWR_CTRL 0x7D = 0x0E, PWR_CONF 0x7C = 0x02; gyro start-up 45 ms.
- ACC_RANGE 0x41: 0 = ±2 g (16384 LSB/g), 1 = ±4 g, **2 = ±8 g (reset default, 4096 LSB/g)**, 3 = ±16 g.
- GYR_RANGE 0x43: 0 = ±2000 °/s (16.4 LSB/°/s) … 4 = ±125 °/s (262.4 LSB/°/s).
- Data, 16-bit two's complement, **low byte first**: **accel X/Y/Z 0x0C–0x11, gyro X/Y/Z 0x12–0x17** (the reverse of the BMI160). Read all 12 bytes in one burst.
- Temperature 0x22–0x23: T = 23 + raw / 512 °C; 0x8000 = invalid (no sample yet).

## Wiring
- ESP32: 3V3 → 3V3, GND → GND, SDA → D21, SCL → D22 (ADR and CS unconnected → 0x68). Or use a Qwiic cable.
- Pico: 3V3 → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: 3V3 → pin 1, GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from bmi270 import BMI270
imu = BMI270(I2C(0, sda=Pin(21), scl=Pin(22), freq=400000))  # addr=0x69 if the ADR jumper is moved
(ax, ay, az), (gx, gy, gz) = imu.read()   # g and deg/s (default ±2 g, ±2000 deg/s)
print(ax, ay, az, gx, gy, gz, imu.temperature())
```
The driver embeds Bosch's 8 kB config blob (base64, ~11 kB of source), so the file is large; on tiny boards precompile it with mpy-cross.

## Gotchas
- All-zero readings or INTERNAL_STATUS ≠ 1: the config file was not loaded (or was loaded twice without a reset). Power-cycle or soft-reset and re-run the init.
- Do not power from 5 V: there is no regulator on this board.
- Some libraries default to 0x69; this SparkFun board is 0x68 out of the box.
- Several Qwiic boards on one bus: cut the I2C pull-up jumper on all but one.
- The die temperature runs above ambient; it is not an air thermometer.

## Datasheet
https://www.bosch-sensortec.com/media/boschsensortec/downloads/datasheets/bst-bmi270-ds000.pdf
