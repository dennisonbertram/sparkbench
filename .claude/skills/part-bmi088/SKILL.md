---
name: part-bmi088
description: Pinout, electrical limits, wiring and MicroPython driver for the BMI088 6-axis IMU (Bosch BMI088 accelerometer + gyroscope with separate I2C addresses, Seeed Grove 6-Axis Accelerometer&Gyroscope module). Use when designing, wiring, simulating or writing code for a BMI088 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# BMI088 6-axis IMU (BMI088)

## Overview
The **BMI088** from Bosch Sensortec is a vibration-robust IMU made for drones and robots: a 16-bit 3-axis accelerometer (±3/6/12/24 g) and a 16-bit 3-axis gyroscope (±125…±2000 °/s), plus a die temperature sensor. Inside are **two separate chips with their own I2C addresses and register maps**. Hobbyists buy it as the **Seeed Studio Grove - 6-Axis Accelerometer&Gyroscope (BMI088)** (101020584): a 3.0 V regulator (XC6206), MOSFET level shifters with pull-ups, and a 4-pin Grove connector.

## Pinout (Grove connector, top to bottom as printed)
| Pin | Function |
|---|---|
| GND | Ground (black wire) |
| VCC | Supply 3.3–5 V into the 3.0 V regulator (red wire) |
| SDA | I2C data, level-shifted, pulled up (white wire) |
| SCL | I2C clock, level-shifted, pulled up (yellow wire) |

INT1–INT4 are bare pads on the opposite edge (not needed for basic use). AD0 / AD1 solder pads on the back select the addresses.

## Electrical limits
- Chip: VDD 2.4–3.6 V, VDDIO 1.2–3.6 V. Module VCC: 3.3 V or 5 V (the regulator makes 3.0 V; the bus is level-shifted).
- Current: about 5 mA with the gyro in normal mode, 150 µA for the accelerometer.
- I2C standard and fast mode (400 kHz).

## Interface details
- **Accelerometer at 0x19** (0x18 with AD0 set low), **gyroscope at 0x69** (0x68 with AD1 set low).
- Accelerometer: ACC_CHIP_ID 0x00 = **0x1E**. Starts in **suspend mode**: write ACC_PWR_CONF 0x7C = 0x00, wait ≥ 1 ms, then ACC_PWR_CTRL 0x7D = 0x04, wait ≥ 450 µs.
- ACC_RANGE 0x41: 0x00 ±3 g, **0x01 ±6 g (default)**, 0x02 ±12 g, 0x03 ±24 g. g = raw / 32768 × 1.5 × 2^(range+1).
- Accel X/Y/Z at 0x12–0x17, 16-bit two's complement, **low byte first**.
- Temperature 0x22 (MSB) / 0x23 (bits 7:5): raw11 = MSB×8 + LSB>>5, signed 11-bit; T = 23 + raw11 × 0.125 °C (updated every 1.28 s).
- Gyroscope: GYRO_CHIP_ID 0x00 = **0x0F**, starts in normal mode. GYRO_RANGE 0x0F: **0x00 ±2000 °/s, 16.384 LSB/°/s** … 0x04 ±125 °/s, 262.144 LSB/°/s. Rate X/Y/Z at 0x02–0x07, low byte first.

## Wiring
- ESP32: VCC → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VCC → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.
- Use a Grove-to-female-jumper cable (or a Grove shield); the Grove socket does not plug into a breadboard.

## Using the driver
```python
from machine import I2C, Pin
from bmi088 import BMI088
imu = BMI088(I2C(0, sda=Pin(21), scl=Pin(22)))  # acc_addr=0x18 / gyro_addr=0x68 if the pads are changed
ax, ay, az = imu.acceleration()   # g
gx, gy, gz = imu.gyro()           # deg/s
print(ax, ay, az, gx, gy, gz, imu.temperature())
```

## Gotchas
- Accelerometer reads all zeros: it was never taken out of suspend mode (0x7C = 0x00, then 0x7D = 0x04). This is the most common BMI088 mistake.
- An I2C scan shows two devices (0x19 and 0x69): that is one BMI088, not two sensors.
- The accelerometer's LSB/MSB pairs are latched together: read all six bytes in one burst.
- The temperature reads only while the accelerometer is on, and it is the die temperature, not the air.
- Libraries written for BMI160/BMI270 do not work: different chip IDs, registers and addresses.

## Datasheet
https://www.bosch-sensortec.com/media/boschsensortec/downloads/datasheets/bst-bmi088-ds001.pdf
