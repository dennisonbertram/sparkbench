---
name: part-mag3110
description: Pinout, electrical limits, wiring and MicroPython driver for the MAG3110 3-axis magnetometer / compass (NXP Freescale MAG3110, SparkFun SEN-12670 breakout). Use when designing, wiring, simulating or writing code for a MAG3110 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MAG3110 3-axis magnetometer (MAG3110)

## Overview
The **MAG3110** from NXP (formerly Freescale) measures the magnetic field on three axes: ±1000 µT full scale, 0.1 µT per count, output data rates 0.08–80 Hz with 16–128x over-sampling, plus a die temperature sensor. It talks I2C. Hobbyists buy it on the **SparkFun Triple Axis Magnetometer Breakout - MAG3110 (SEN-12670)**: no regulator, 4.7 kΩ pull-ups on SDA/SCL.

## Pinout (SparkFun SEN-12670, header order)
| Pin | Function |
|---|---|
| GND | Ground |
| VCC | Supply, 1.95–3.6 V (no regulator) |
| SDA | I2C data (4.7 kΩ pull-up on board) |
| SCL | I2C clock (4.7 kΩ pull-up on board) |
| INT | Data-ready output, active high (optional) |

## Electrical limits
- Supply: 1.95–3.6 V (absolute max 3.6 V). **Not 5 V tolerant**; SDA/SCL max VCC + 0.3 V.
- Current: 900 µA at 1280 Hz ADC rate (80 Hz ODR), down to 8.6 µA at low rates, 2 µA standby.
- I2C up to 400 kHz.

## Interface details
- **I2C address 0x0E** (fixed). WHO_AM_I (0x07) = **0xC4**.
- Start-up: CTRL_REG1 (0x10) = 0x00 (standby), CTRL_REG2 (0x11) = 0xA0 (AUTO_MRST_EN + RAW), CTRL_REG1 = (DR<<5)|(OS<<3)|1 (e.g. 0x19 = 10 Hz, 128x over-sampling, ACTIVE).
- DR_STATUS (0x00) bit 3 ZYXDR = new data. Burst-read 6 bytes from **0x01**: X, Y, Z as signed 16-bit MSB first; **B (µT) = raw × 0.1**.
- DIE_TEMP (0x0F): signed 8-bit, 1 °C/LSB, offset not trimmed.

## Wiring
- ESP32: VCC → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VCC → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from mag3110 import MAG3110
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
mag = MAG3110(i2c)
x, y, z = mag.read()          # microtesla
print('X=%.1f Y=%.1f Z=%.1f uT' % (x, y, z))
mag.calibrate(10)             # rotate the board in every direction for 10 s
print('heading', mag.heading())
```

## Gotchas
- It powers up in STANDBY and reads stale zeros until AC is set in CTRL_REG1.
- Always read from 0x01 first; the other data registers only refresh after OUT_X_MSB is read.
- Raw readings carry a fixed offset (sensor zero-flux plus nearby iron) that can be far bigger than the Earth's 25–65 µT field: calibrate before computing headings.
- heading() is only right with the board level; tilt needs an accelerometer for compensation.
- The SparkFun board's X/Z silkscreen arrows are wrong (known erratum); use the datasheet axes.

## Datasheet
https://www.nxp.com/docs/en/data-sheet/MAG3110.pdf
