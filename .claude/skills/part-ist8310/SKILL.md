---
name: part-ist8310
description: Pinout, electrical limits, wiring and MicroPython driver for the IST8310 3-axis magnetometer / compass (iSentek IST8310, Rotorama RR-IST8310 module). Use when designing, wiring, simulating or writing code for an IST8310 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# IST8310 3-axis magnetometer (IST8310)

## Overview
The **IST8310** from iSentek is an AMR magnetometer measuring the field on three axes (±1600 µT on X/Y, ±2500 µT on Z, 3.3 LSB/µT, up to 200 Hz) over I2C. It is the compass in many drone GPS units. The modelled module is the **Rotorama RR-IST8310 V1.0** external compass: a 10.5 mm board with a 3.3 V regulator, a 4.5–5.5 V input and 3.3 V I2C.

## Pinout (RR-IST8310 V1.0, header order)
| Pin | Function |
|---|---|
| SCL | I2C clock (3.3 V logic) |
| SDA | I2C data (3.3 V logic) |
| GND | Ground |
| VIN | Supply, 4.5–5.5 V (onboard 3.3 V regulator) |

## Electrical limits
- Chip: AVDD/DVDD 1.72–3.6 V, absolute max 3.6 V. The module takes 4.5–5.5 V on VIN.
- Current: 20 µA at 1 sample/s up to 1.2 mA at 200 samples/s; 10 µA standby.
- I2C up to 400 kHz.

## Interface details
- **I2C address 0x0E** (ADDRSEL left+centre pads); 0x0F with centre+right. Never bridge all three pads.
- WHO_AM_I register 0x00 reads **0x10**.
- Soft reset: 0x01 → 0x0B (POR up to 50 ms). Init per datasheet 3.1.1: **0xC0 → 0x42** (pulse duration), **0x24 → 0x41** (low-noise averaging, ≥ 6 ms per sample).
- No continuous mode: each reading write **0x01 → 0x0A** (single measurement); the chip returns to stand-by and sets DRDY (0x02 bit 0).
- Data 0x03–0x08: X, Y, Z, each 16-bit two's complement, **LSB first**. Reading clears DRDY.
- Field in µT = raw / 3.3 (330 LSB/gauss).
- STAT2 0x09 bit 3 (INT): |X|+|Y|+|Z| exceeded 1600 µT.

## Wiring
- ESP32: VIN → 5V/VIN, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → VBUS, GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 2 (5 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from ist8310 import IST8310
import math
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
m = IST8310(i2c)                 # 0x0E
x, y, z = m.read()               # microtesla
print('X=%.1fuT Y=%.1fuT Z=%.1fuT' % (x, y, z))
print('heading', math.degrees(math.atan2(y, x)) % 360)
```

## Gotchas
- VIN must be 5 V. The chip itself is 3.6 V max, so a bare IST8310 board without a regulator must never see 5 V.
- Every reading needs a new single-measurement command; reading without one returns the old data.
- Motors, magnets, speakers and steel distort readings; do a hard-iron calibration (min/max while rotating).
- atan2(Y, X) heading is only right when the module is level.

## Datasheet
https://assets.isentek.com/public/documents/datasheet/HFH0n8I7hQ-IST8310_Datasheet_V1.8_Web.pdf
