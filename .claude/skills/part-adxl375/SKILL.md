---
name: part-adxl375
description: Pinout, electrical limits, wiring and MicroPython driver for the ADXL375 ±200 g high-g 3-axis accelerometer (Analog Devices ADXL375, Adafruit #5374 breakout). Use when designing, wiring, simulating or writing code for an ADXL375 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# ADXL375 high-g 3-axis accelerometer (ADXL375)

## Overview
The **ADXL375** from Analog Devices is a 3-axis MEMS accelerometer with a fixed **±200 g** range and 13-bit output (49 mg/LSB), made for shocks, impacts, crash and rocketry logging. Its register map is a close cousin of the ADXL345 (same DEVID 0xE5, same data registers), with shock detection on two interrupt pins. It talks I2C (or SPI). Hobbyists buy it on the **Adafruit ADXL375 breakout (#5374, STEMMA QT)**, which adds a 3.3 V regulator, 10 kΩ I2C pull-ups and level shifting so it runs from 3.3 V or 5 V.

## Pinout (Adafruit #5374, header by header)
6-pin header:

| Pin | Function |
|---|---|
| VIN | Supply 3.3–5 V into the 3.3 V regulator; sets SDA/SCL logic level |
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
| SDO | ALT ADDRESS / SPI MISO: low = 0x53, tie to 3Vo = 0x1D |
| CS | Chip select: tied high = I2C (leave open) |

The two STEMMA QT sockets carry VIN, GND, SDA, SCL too.

## Electrical limits
- Board supply: 3.3–5 V on VIN (chip itself: VS 2.0–3.6 V, VDD I/O 1.7 V–VS).
- Current: about 145 µA at ODR ≥ 100 Hz, 35 µA at ≤ 3 Hz, 0.1 µA in standby (plus the board's power LED).
- Only SDA/SCL are 5 V safe; INT, I2, SDO, CS are 3.3 V pins.
- I2C up to 400 kHz; max output data rate 800 Hz at 400 kHz, 200 Hz at 100 kHz.

## Interface details
- **I2C address 0x53** (SDO low, board default), 0x1D with SDO high.
- DEVID register 0x00 reads **0xE5** (same as ADXL343/345).
- Powers up in standby: write 0x08 (Measure) to POWER_CTL 0x2D. BW_RATE 0x2C sets the data rate (0x0A = 100 Hz, reset value).
- DATA_FORMAT 0x31: write **0x0B** (bits D3, D1, D0 are fixed 1, D4 fixed 0; Justify bit 2 = 0 for right-justified).
- Data: 0x32–0x37 = X0 X1 Y0 Y1 Z0 Z1, little-endian twos complement. Read all six bytes in one burst.
- acceleration (g) = raw × 0.049; × 9.80665 for m/s². At 1600/3200 Hz the LSB is always 0.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.
- Leave SDO and CS unconnected for address 0x53 in I2C mode.

## Using the driver
```python
from machine import I2C, Pin
from adxl375 import ADXL375
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
accel = ADXL375(i2c)            # 0x53, ±200 g, 100 Hz
x, y, z = accel.read()          # g
print('X=%.2f Y=%.2f Z=%.2f g' % (x, y, z))
```

## Gotchas
- All-zero readings mean the Measure bit was never set (the chip is still in standby).
- One count is 49 mg, so gravity reads only about 20 counts and the zero-g offset can be up to ±6 g: this is a shock sensor, not a tilt sensor. Use an ADXL343/345 for tilt.
- Scale factor varies 44–54 mg/LSB part to part: calibrate if you need accurate g values.
- Pulling CS low (even briefly at power-up) puts the chip into SPI mode and it stops answering on I2C.
- DEVID 0xE5 does not distinguish it from an ADXL343/345 on the same address.

## Datasheet
https://www.analog.com/media/en/technical-documentation/data-sheets/ADXL375.PDF
