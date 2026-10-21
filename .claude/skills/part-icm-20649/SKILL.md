---
name: part-icm-20649
description: Pinout, electrical limits, wiring and MicroPython driver for the ICM-20649 wide-range 6-DoF IMU (TDK InvenSense ICM-20649 ±30 g accelerometer and ±4000 °/s gyroscope, Adafruit #4464). Use when designing, wiring, simulating or writing code for an ICM-20649 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# ICM-20649 wide-range 6-DoF IMU (ICM-20649)

## Overview
The **ICM-20649** from TDK InvenSense is a 6-axis motion sensor built for high-impact use (sports, crashes, fast spins). It has a 3-axis accelerometer (±4/8/16/30 g), a 3-axis gyroscope (±500/1000/2000/4000 °/s) and a temperature sensor, and it talks I2C or SPI. Hobbyists buy it on the **Adafruit ICM-20649 Wide-Range 6-DoF IMU breakout (#4464)**, which has a 3.3 V regulator, level shifters on SCL/SDA and 10 kΩ pull-ups, so it works with 3.3 V and 5 V boards.

## Pinout (Adafruit #4464, header by header, left to right)
Bottom header:

| Pin | Function |
|---|---|
| VIN | Supply, 3–5 V |
| 3Vo | 3.3 V regulator output (not an input; leave unconnected) |
| GND | Ground |
| SCL | I2C clock (SPI SCK), 10 kΩ pull-up |
| SDA | I2C data (SPI SDI), 10 kΩ pull-up |
| INT1 | Interrupt 1 output (3.3 V) |

Top header:

| Pin | Function |
|---|---|
| AD0 | Address select (SPI SDO): low (default) = 0x68, high = 0x69 |
| FS | FSYNC input, grounded by a back jumper |
| SCE | Auxiliary I2C clock (3.3 V) |
| SDE | Auxiliary I2C data (3.3 V) |
| CS | SPI chip select, pulled high for I2C |
| INT2 | Interrupt 2 output (3.3 V) |

## Electrical limits
- Board supply: 3–5 V on VIN (the chip itself: VDD and VDDIO 1.71–3.6 V, fed 3.3 V by the regulator).
- Current: about 3.2 mA with accelerometer and gyroscope on (low-noise mode).
- Only SCL, SDA and CS are 5 V tolerant; INT1, INT2, AD0, FS, SCE, SDE are 3.3 V logic.
- I2C up to 400 kHz.

## Interface details
- **I2C address 0x68** (AD0 pulled down on the board), 0x69 with AD0 high.
- Four register banks chosen with REG_BANK_SEL (0x7F, bank in bits 5:4). Data registers are in bank 0; GYRO_CONFIG_1 (0x01) and ACCEL_CONFIG (0x14) are in bank 2 (reset value 0x01 = ±500 °/s, ±4 g, DLPF on).
- WHO_AM_I (0x00) = **0xE1**. PWR_MGMT_1 (0x06) resets to 0x41 (asleep): write 0x80 to reset (wait up to 100 ms), then 0x01 to wake with the auto clock; the gyro needs about 35 ms.
- Burst-read 14 bytes from **0x2D**: accel X/Y/Z, gyro X/Y/Z, temperature, each a big-endian signed 16-bit word.
- Accel = raw / 8192 g at ±4 g (4096, 2048, 1024 LSB/g for ±8/16/30 g). Gyro = raw / 65.5 °/s at ±500 °/s (32.8, 16.4, 8.2 for ±1000/2000/4000). Temperature = raw / 333.87 + 21 °C.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.
- Or use a STEMMA QT / Qwiic cable.

## Using the driver
```python
from machine import I2C, Pin
from icm20649 import ICM20649
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
imu = ICM20649(i2c)                       # accel_fs=3, gyro_fs=3 for ±30 g / ±4000 °/s
(ax, ay, az), (gx, gy, gz), t = imu.read()
print('A=%.2f,%.2f,%.2f g G=%.1f,%.1f,%.1f dps T=%.1fC' % (ax, ay, az, gx, gy, gz, t))
```

## Gotchas
- The ranges start at ±4 g and ±500 °/s (not ±2 g / ±250 °/s like the ICM-20948), so the scale factors differ.
- WHO_AM_I is 0xE1, not 0xEA: ICM-20948 code will refuse this chip.
- Temperature comes **after** the gyro in the burst (0x39).
- Range writes go to bank 2; always switch back to bank 0 before reading data.
- Wide range means coarse resolution: for gentle motion a ±2 g IMU gives finer readings.
- The Sparkbench simulator models the reset ranges (±4 g, ±500 °/s); other ranges work on real hardware.

## Datasheet
https://datasheet.lcsc.com/datasheet/pdf/398bb9b0577ec4950e08e602fdd05137.pdf?productCode=C475538
