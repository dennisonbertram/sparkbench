---
name: part-qmc5883l
description: Pinout, electrical limits, wiring and MicroPython driver for the QMC5883L 3-axis compass / magnetometer (GY-271 module). Use when designing, wiring, simulating or writing code for a QMC5883L in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# QMC5883L 3-axis compass (QMC5883L)

## Overview
The **QMC5883L** from QST measures the magnetic field on three axes (±2 or ±8 gauss, 16-bit, 10–200 Hz) and talks I2C at **0x0D**. Hobbyists buy it on the **GY-271 QMC5883L module**, which adds a 3.3 V regulator and SDA/SCL pull-ups so it runs from 3.3–5 V.

## Pinout (GY-271 QMC5883L module, header order)
| Pin | Function |
|---|---|
| VCC | Supply, 3.3–5 V (onboard regulator) |
| GND | Ground |
| SCL | I2C clock |
| SDA | I2C data |
| DRDY | Data-ready output, high until the data is read (optional) |

## Electrical limits
- Chip: VDD 2.16–3.6 V, absolute max 5.4 V. The GY-271 regulator lets VCC be 3.3–5 V.
- Current: about 75–850 µA in continuous mode depending on ODR/OSR, 2.6 mA peak, 3 µA standby.
- I2C up to 400 kHz.

## Interface details
- **I2C address 0x0D** (fixed). Chip ID register 0x0D reads 0xFF.
- Setup (datasheet 7.1): write **0x01 → 0x0B** (SET/RESET period), then **0x1D → 0x09** (OSR 512, ±8 G, 200 Hz, continuous). Soft reset: 0x80 → 0x0A.
- Register 0x09: OSR[7:6] (00=512, 01=256, 10=128, 11=64), RNG[5:4] (00=±2 G, 01=±8 G), ODR[3:2] (10/50/100/200 Hz), MODE[1:0] (00 standby, 01 continuous).
- Status 0x06: bit 0 DRDY, bit 1 OVL (overflow), bit 2 DOR (data skipped).
- Data 0x00–0x05: X, Y, Z, each 16-bit two's complement, **LSB first**. Read all six; reading 0x05 releases the data lock.
- Field in gauss = raw / 3000 (±8 G) or raw / 12000 (±2 G).
- Temperature 0x07–0x08: about 100 LSB/°C, offset not calibrated (relative only).

## Wiring
- ESP32: VCC → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VCC → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from qmc5883l import QMC5883L
import math
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
c = QMC5883L(i2c)
x, y, z = c.read()                      # gauss
print('X=%.3fG Y=%.3fG Z=%.3fG' % (x, y, z))
print('heading', math.degrees(math.atan2(y, x)) % 360)
```

## Gotchas
- GY-271 boards come with an HMC5883L (0x1E) **or** a QMC5883L (0x0D); the register maps differ. Run `i2c.scan()` first.
- Data bytes are LSB first and in X, Y, Z order (the HMC5883L uses MSB first and X, Z, Y).
- Motors, magnets, speakers and steel nearby distort readings; do a hard-iron calibration (min/max while rotating).
- atan2(Y, X) heading is only right when the module is level.

## Datasheet
https://nettigo.pl/attachments/440 (QST QMC5883L datasheet rev 1.0)
