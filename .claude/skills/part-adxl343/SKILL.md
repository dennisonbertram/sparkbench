---
name: part-adxl343
description: Pinout, electrical limits, wiring and MicroPython driver for the ADXL343 3-axis accelerometer (Analog Devices ADXL343, Adafruit #4097 breakout). Use when designing, wiring, simulating or writing code for an ADXL343 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# ADXL343 3-axis accelerometer (ADXL343)

## Overview
The **ADXL343** from Analog Devices is a 3-axis MEMS accelerometer (a near drop-in successor to the ADXL345) with a selectable ±2/±4/±8/±16 g range, up to 13-bit resolution and tap/activity/free-fall detection on two interrupt pins. It talks I2C (or SPI). Hobbyists buy it on the **Adafruit ADXL343 breakout (#4097, STEMMA QT version)**, which adds a 3.3 V regulator, 10 kΩ I2C pull-ups and level shifting so it runs from 3.3 V or 5 V.

## Pinout (Adafruit #4097 STEMMA QT, header by header)
6-pin header:

| Pin | Function |
|---|---|
| VIN | Supply 3.3–5 V into the AP2112K 3.3 V regulator; sets SDA/SCL logic level |
| 3Vo | 3.3 V regulator output (up to 100 mA), not an input |
| GND | Ground |
| SCL | I2C clock (pull-up + level shifter on board) |
| SDA | I2C data (pull-up + level shifter on board) |
| INT | INT1 interrupt output, 3.3 V logic (optional) |

4-pin header (Sparkbench names its GND "GND2"):

| Pin | Function |
|---|---|
| GND | Ground |
| I2 | INT2 interrupt output, 3.3 V logic (optional) |
| SDO | ALT ADDRESS / SPI MISO: pulled low = 0x53, tie to 3Vo = 0x1D |
| CS | Chip select: pulled high = I2C (leave open) |

The two STEMMA QT sockets carry VIN, GND, SDA, SCL too.

## Electrical limits
- Board supply: 3.3–5 V on VIN (chip itself: 2.0–3.6 V, specified at 2.5 V).
- Current: about 140 µA at ODR ≥ 100 Hz, 30 µA below 10 Hz, 0.1 µA in standby (plus the board's power LED).
- Only SDA/SCL are 5 V safe; INT, I2, SDO, CS are 3.3 V pins.
- I2C up to 400 kHz; max output data rate 800 Hz at 400 kHz, 200 Hz at 100 kHz.

## Interface details
- **I2C address 0x53** (SDO low, board default), 0x1D with SDO high.
- DEVID register 0x00 reads **0xE5**.
- Powers up in standby: write 0x08 (Measure) to POWER_CTL 0x2D. BW_RATE 0x2C sets the data rate (0x0A = 100 Hz).
- DATA_FORMAT 0x31: FULL_RES bit 3, range bits 1:0 (0 = ±2 g … 3 = ±16 g). With FULL_RES set the scale is **3.9 mg/LSB in every range**; without it (10-bit mode) it is 3.9 / 7.8 / 15.6 / 31.2 mg/LSB.
- Data: 0x32–0x37 = X0 X1 Y0 Y1 Z0 Z1, little-endian twos complement. Read all six bytes in one burst.
- acceleration (g) = raw × 0.0039 (full resolution); × 9.80665 for m/s².

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.
- Leave SDO and CS unconnected for address 0x53 in I2C mode.

## Using the driver
```python
from machine import I2C, Pin
from adxl343 import ADXL343
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
accel = ADXL343(i2c)            # 0x53, ±16 g, full resolution, 100 Hz
x, y, z = accel.read()          # g
print('X=%.2f Y=%.2f Z=%.2f g' % (x, y, z))
```

## Gotchas
- All-zero readings mean the Measure bit was never set (the chip is still in standby).
- Lying flat it reads about +1 g on Z, not 0: that is gravity.
- X/Y sensitivity is about 265 LSB/g at 3.3 V supply rather than the nominal 256, and the offset shifts a little with supply: calibrate for accurate tilt.
- Pulling CS low (even briefly at power-up) puts the chip into SPI mode and it stops answering on I2C.

## Datasheet
https://www.analog.com/media/en/technical-documentation/data-sheets/adxl343.pdf
