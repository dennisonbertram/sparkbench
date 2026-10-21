---
name: part-adxl313
description: Pinout, electrical limits, wiring and MicroPython driver for the ADXL313 3-axis accelerometer (Analog Devices ADXL313, SparkFun Qwiic SEN-17241 breakout). Use when designing, wiring, simulating or writing code for an ADXL313 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# ADXL313 3-axis accelerometer (ADXL313)

## Overview
The **ADXL313** from Analog Devices is a low-noise 3-axis MEMS accelerometer with a selectable ±0.5/±1/±2/±4 g range, a fixed **1024 LSB/g** sensitivity in full-resolution mode, a 32-sample FIFO and activity/inactivity interrupts. It talks I2C (or SPI). Hobbyists buy it on the **SparkFun Triple Axis Digital Accelerometer Breakout - ADXL313 (Qwiic), SEN-17241**: a 3.3 V-only board (no regulator, no level shifter) with 4.7 kΩ I2C pull-ups and two Qwiic connectors.

## Pinout (SparkFun SEN-17241, header by header)
6-pin header (bottom edge):

| Pin | Function |
|---|---|
| GND | Ground |
| 3.3V | Supply 2.0–3.6 V (3.3 V nominal), no regulator |
| SDA | I2C data (4.7 kΩ pull-up on board) / SPI SDI |
| SCL | I2C clock (4.7 kΩ pull-up on board) / SPI SCLK |
| ADR | SDO / ALT ADDRESS: 10 kΩ pull-up = 0x1D, to GND = 0x53 |
| CS | Chip select: 10 kΩ pull-up = I2C mode (leave open) |

2-pin header (top edge): INT2, INT1 (interrupt outputs, optional).

Because the pins sit on two edges, Sparkbench wires this board with jumper leads.

## Electrical limits
- Supply: 2.0–3.6 V. **Never 5 V** on any pin.
- Current: about 170 µA at 100 Hz (57–170 µA depending on data rate), 0.1 µA standby, plus about 1.5 mA for the power LED (cut the LED jumper to save it).
- I2C up to 400 kHz. Output data rate 6.25–3200 Hz.

## Interface details
- **I2C address 0x1D** (ADR high, board default), 0x53 with ADR pulled low or the ADR jumper closed.
- IDs: DEVID_0 0x00 = **0xAD**, DEVID_1 0x01 = 0x1D, PARTID 0x02 = **0xCB**.
- Powers up in standby: write 0x08 (Measure) to POWER_CTL 0x2D. Keep bit 6 (I2C_DISABLE) clear. BW_RATE 0x2C sets the data rate (0x0A = 100 Hz).
- DATA_FORMAT 0x31: FULL_RES bit 3, range bits 1:0 (0 = ±0.5 g … 3 = ±4 g). With FULL_RES set the sensitivity is **1024 LSB/g in every range**; in 10-bit mode it is 1024/512/256/128 LSB/g.
- Data: 0x32–0x37 = X0 X1 Y0 Y1 Z0 Z1, little-endian twos complement. Read all six bytes in one burst.
- acceleration (g) = raw / 1024 (full resolution); × 9.80665 for m/s².
- Soft reset: write 0x52 to 0x18.

## Wiring
- ESP32: 3.3V → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: 3.3V → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: 3.3V → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.
- Or just use a Qwiic cable. Leave ADR and CS unconnected for address 0x1D in I2C mode.

## Using the driver
```python
from machine import I2C, Pin
from adxl313 import ADXL313
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
accel = ADXL313(i2c)            # 0x1D, ±4 g, full resolution, 100 Hz
x, y, z = accel.read()          # g
print('X=%.2f Y=%.2f Z=%.2f g' % (x, y, z))
```

## Gotchas
- All-zero readings mean the Measure bit was never set (still in standby).
- Lying flat it reads about +1 g on Z: that is gravity.
- The range tops out at ±4 g, so hard knocks clip; use an ADXL343/ADXL375 for bigger shocks.
- Pulling CS low puts the chip into SPI mode and it stops answering on I2C.
- Many examples for the ADXL345 use address 0x53 and DEVID 0xE5; the ADXL313 defaults to 0x1D here and reads 0xAD.

## Datasheet
https://www.analog.com/media/en/technical-documentation/data-sheets/adxl313.pdf
