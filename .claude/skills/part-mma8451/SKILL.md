---
name: part-mma8451
description: Pinout, electrical limits, wiring and MicroPython driver for the MMA8451 14-bit 3-axis accelerometer (NXP/Freescale MMA8451Q). Use when designing, wiring, simulating or writing code for an MMA8451 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MMA8451 14-bit 3-axis accelerometer (MMA8451Q)

## Overview
The **MMA8451Q** from NXP (formerly Freescale) is a 14-bit, 3-axis digital accelerometer with selectable ±2 / ±4 / ±8 g ranges, output data rates from 1.56 to 800 Hz, a 32-sample FIFO, and orientation, tap, motion and free-fall detection on two interrupt pins. It talks I2C. Hobbyists buy it on the **Adafruit Triple-Axis Accelerometer - ±2/4/8g @ 14-bit - MMA8451** (product #2019), which adds a MIC5225 3.3 V regulator, BSS138 level shifters with 10 kΩ pull-ups on SDA/SCL, and a pulled-up address pin.

## Pinout (Adafruit MMA8451 breakout #2019, header order)
| Pin | Function |
|---|---|
| VIN | Supply, 3.3–5 V (regulated to 3.3 V on board); sets the I2C logic level |
| GND | Ground |
| 3Vo | 3.3 V regulator output (up to 100 mA), leave unconnected |
| I2 | Interrupt 2 output, 3.3 V logic (optional) |
| I1 | Interrupt 1 output, 3.3 V logic (optional) |
| SCL | I2C clock (level shifted, 10 kΩ pull-up) |
| SDA | I2C data (level shifted, 10 kΩ pull-up) |
| A | Address select SA0: pulled up = 0x1D, tie to GND = 0x1C |

## Electrical limits
- Chip: VDD 1.95–3.6 V, VDDIO 1.62–3.6 V. On the Adafruit board power VIN from 3.3–5 V.
- SDA/SCL are shifted to VIN; I1, I2 and A are 3.3 V signals (do not drive A or the interrupts from 5 V).
- Current: 6–165 µA active depending on data rate; 1.8 µA standby (plus the regulator's quiescent current).
- I2C up to 400 kHz. Reads need a repeated start (MicroPython's `readfrom_mem` does this).

## Interface details
- **I2C address 0x1D** (A pulled high, Adafruit default); 0x1C with A tied to GND.
- WHO_AM_I (0x0D) = **0x1A** (the 12-bit MMA8452Q reads 0x2A).
- Powers up in standby. Configure in standby, then set ACTIVE: CTRL_REG1 (0x2A) = 0x00, XYZ_DATA_CFG (0x0E) = FS (00 = 2 g, 01 = 4 g, 10 = 8 g), CTRL_REG1 = (DR << 3) | 1 (DR = 3 for 100 Hz). Turn-on time 2/ODR + 1 ms.
- Data: OUT_X_MSB..OUT_Z_LSB at 0x01–0x06, read in one 6-byte burst. Each axis is 14-bit two's complement, MSB first, left-justified: `raw = int16(MSB<<8 | LSB) >> 2`.
- Keep F_READ (CTRL_REG1 bit 1) at 0; with it set, auto-increment skips the LSB registers (8-bit data only).
- Sensitivity: 4096 counts/g (±2 g), 2048 (±4 g), 1024 (±8 g). g = raw / sensitivity.
- STATUS (0x00) bit 3 (ZYXDR) = new X/Y/Z sample ready.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from mma8451 import MMA8451
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
accel = MMA8451(i2c)           # 0x1D, ±2 g, 100 Hz
x, y, z = accel.read()         # in g
print('X=%.3f Y=%.3f Z=%.3f g' % (x, y, z))
```

## Gotchas
- All zeros means the chip is still in standby (ACTIVE not set).
- XYZ_DATA_CFG and the data rate are ignored unless written while in standby.
- WHO_AM_I not 0x1A, or OSError on the first read: check wiring and the address (0x1D vs 0x1C). 0x2A means you have an MMA8452Q (12-bit, 1024 counts/g).
- Lying flat and still, Z reads about +1 g and X/Y about 0 g.

## Datasheet
https://www.nxp.com/docs/en/data-sheet/MMA8451Q.pdf
