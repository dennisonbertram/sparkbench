---
name: part-bmi323
description: Pinout, electrical limits, wiring and MicroPython driver for the BMI323 6-axis IMU (Bosch BMI323 accelerometer + gyroscope, 7Semi BMI323 IMU Breakout Board with Qwiic, ES-12252). Use when designing, wiring, simulating or writing code for a BMI323 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# BMI323 6-axis IMU (BMI323)

## Overview
The **BMI323** from Bosch Sensortec is a 16-bit 3-axis accelerometer (±2/4/8/16 g) plus 3-axis gyroscope (±125…±2000 °/s) with a die temperature sensor, on I2C, I3C or SPI. Unlike the BMI270 it needs **no configuration file**: write two config registers and it runs. Its registers are **16-bit words** (low byte first) and **every I2C read starts with 2 dummy bytes**. The modelled board is the **7Semi BMI323 IMU Breakout Board – 6DOF Accelerometer + Gyroscope with Qwiic (ES-12252)**: one 9-pin 0.1" header, two Qwiic connectors, a 3.3 V regulator, MOSFET level shifters with 2.2 kΩ pull-ups on SCL/SDA.

## Pinout (7Semi ES-12252, header order as printed)
| Pin | Function |
|---|---|
| VIN | Supply into the 3.3 V regulator (vendor: 3.6–5 V; the Qwiic 3V3 line feeds the same input at 3.3 V) |
| 3V3 | 3.3 V regulator output, up to 50 mA (not an input) |
| GND | Ground |
| SCL | I2C clock / SPI SCK – level shifted, 2.2 kΩ pull-up |
| SDA | I2C data / SPI MOSI – level shifted, 2.2 kΩ pull-up |
| SDO | Address select (SPI MISO): low = 0x68, high = 0x69 – 3.3 V only |
| CS | SPI chip select; leave open for I2C – 3.3 V only |
| IT1 | Interrupt INT1 (3.3 V push-pull, off until configured) |
| IT2 | Interrupt INT2 (3.3 V push-pull, off until configured) |

## Electrical limits
- Chip: VDD 1.71–3.63 V, VDDIO 1.08–3.63 V (absolute max 4 V); the board's regulator supplies both.
- Feed VIN from **3.3 V** on ESP32/Pico: the SCL/SDA pull-ups go to the board's supply side, so 5 V on VIN can put 5 V on the bus lines.
- Current: under 1 mA accel + gyro normal mode, plus the regulator.
- I2C up to 1 MHz (fast mode plus); 400 kHz is a safe default.

## Interface details
- **I2C address 0x68** (SDO low, vendor example code); 0x69 with SDO high (the vendor page states 0x69 – the driver scans both).
- Reads: send the 8-bit register address, then read **2 dummy bytes + 2 bytes per word** (low byte first). The address auto-increments by word.
- Writes: register address, then low byte, high byte.
- CHIP_ID 0x00: low byte **0x43**. ERR_REG 0x01 bit 0 = fatal error. STATUS 0x02 (clear on read): bit 0 por_detected, bits 7/6/5 accel/gyro/temp data ready.
- Soft reset: write **0xDEAF** to CMD 0x7E, wait ≥ 1.5 ms. After reset the sensors are off (suspend) and data reads 0x8000.
- ACC_CONF 0x20: mode bits 14:12 (0 off, 3 low power, 4 normal, 7 high performance), avg 10:8, bw bit 7, range 6:4 (0 ±2 g = 16384 LSB/g … **2 = ±8 g, 4096 LSB/g, reset default**, 3 ±16 g), ODR 3:0 (8 = 100 Hz). Driver writes **0x4028**.
- GYR_CONF 0x21: same layout, range 0 ±125 … **4 = ±2000 °/s (16.4 LSB/°/s, reset default)**. Driver writes **0x4048**.
- Data words, two's complement: **ACC X/Y/Z 0x03–0x05, GYR X/Y/Z 0x06–0x08, TEMP 0x09**; read all 7 in one burst (2 + 14 bytes). 0x8000 = no valid sample.
- Temperature: T = raw / 512 + 23 °C.
- Bus idle time after a write: 450 µs in suspend mode, 2 µs otherwise.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22 (SDO, CS, IT1, IT2 unconnected). Or a Qwiic cable.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1, GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from bmi323 import BMI323
imu = BMI323(I2C(0, sda=Pin(21), scl=Pin(22), freq=400000))  # or addr=0x68 / 0x69
(ax, ay, az), (gx, gy, gz) = imu.read()   # g (±8 g) and deg/s (±2000 deg/s)
print(ax, ay, az, gx, gy, gz, imu.temperature())
```

## Gotchas
- Forgetting the 2 dummy bytes shifts every reading by one register (chip ID reads 0x00, axes swap).
- All readings 0x8000 (driver returns None): the sensor is still in suspend – ACC_CONF/GYR_CONF mode bits not set.
- The driver fixes ±8 g and ±2000 °/s (the chip's reset ranges); change ACC_CONF/GYR_CONF and the scale together if you need more resolution.
- SDO/CS/IT1/IT2 are not level shifted: 3.3 V logic only.
- The die temperature runs above ambient; it is not an air thermometer.

## Datasheet
https://www.bosch-sensortec.com/media/boschsensortec/downloads/datasheets/bst-bmi323-ds000.pdf
