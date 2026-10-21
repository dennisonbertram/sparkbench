---
name: part-qmp6988
description: Pinout, electrical limits, wiring and MicroPython driver for the QMP6988 barometric pressure & temperature sensor (QST QMP6988, M5Stack Unit Mini BPS v1.1 U090-B). Use when designing, wiring, simulating or writing code for a QMP6988 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# QMP6988 barometric pressure sensor (QMP6988)

## Overview
The **QMP6988** from QST measures absolute air pressure (30–110 kPa, ±3.9 Pa relative, ±100 Pa absolute) and temperature (−40 to 85 °C, ±2 °C) with a 24-bit ADC. Each chip stores its own calibration coefficients in OTP, and the host turns raw counts into Pa and °C with the datasheet's polynomial. Hobbyists buy it as the **M5Stack Unit Mini BPS v1.1 (SKU U090-B)**: a Grove (HY2.0-4P) unit with an HT7533 3.3 V regulator and BSS138 I2C level shifters.

## Pinout (Unit Mini BPS v1.1, Grove connector order)
| Pin | Wire | Function |
|---|---|---|
| GND | black | Ground |
| 5V | red | Supply, 5 V nominal (3.3 V also works, see below) |
| SDA | yellow | I2C data, 4.7 kΩ pull-up to the 5V pin |
| SCL | white | I2C clock, 4.7 kΩ pull-up to the 5V pin |

## Electrical limits
- Chip: VDD 1.71–3.6 V. The unit's HT7533 regulator feeds it from the 5V pin.
- Unit supply: 5 V nominal. 3.3 V in also works, because the regulator passes about 3.2 V at this tiny load.
- Current: 0.64 mA while converting, 1.1 µA asleep, about 21 µA average at 1 sample/s.
- I2C up to 400 kHz (3.4 MHz HS mode on the chip).

## Interface details
- **I2C address 0x70** (SDO to GND, as M5Stack's schematic and Arduino example show). The product page says 0x56 (SDO high), so scan the bus and use whichever address answers. Chip id **0x5C** is at register 0xD1.
- Soft reset: write 0xE6 to 0xE0, then wait 10 ms.
- Calibration: read 25 bytes from 0xA0–0xB8 once. For each coefficient, K = A + S × OTP / 32767, where OTP is a signed 16-bit big-endian value and A and S come from the datasheet table (e.g. bp1: A = 0.033, S = 0.019 at 0xA6). a0 and b00 are 20-bit signed values divided by 16. a0 is 0xB2, 0xB3 and the low nibble of 0xB8; b00 is 0xA0, 0xA1 and the high nibble of 0xB8.
- Measure: write CTRL_MEAS 0xF4 = 0x79 (temperature ×4, pressure ×32, forced mode). Wait about 34 ms, or poll 0xF3 bit 3 until it clears. Then read 6 bytes from 0xF7: pressure, then temperature, 24 bits each, MSB first.
- Dt = raw_T − 2^23, Dp = raw_P − 2^23.
- Tr = a0 + a1·Dt + a2·Dt² gives temperature in 1/256 °C.
- Pr = b00 + bt1·Tr + bp1·Dp + b11·Tr·Dp + bt2·Tr² + bp2·Dp² + b12·Dp·Tr² + b21·Dp²·Tr + bp3·Dp³ gives pressure in Pa.

## Wiring
The 5V pin is fed from 3.3 V on ESP32 and Pico boards so the pull-ups stay at 3.3 V.
- ESP32: 5V → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: 5V → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: 5V → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from qmp6988 import QMP6988
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
addr = 0x70 if 0x70 in i2c.scan() else 0x56
p, t = QMP6988(i2c, addr).read()
print('P=%.2f hPa T=%.1f C' % (p / 100, t))
```

## Gotchas
- The SDA/SCL pull-ups go to whatever feeds the 5V pin. With 5 V there, 3.3 V-only GPIOs (ESP32, Pico) see 5 V through 4.7 kΩ, so feed 3.3 V instead.
- Always compute temperature before pressure, because the pressure formula needs Tr.
- Use the full polynomial. A linear fit is off by hundreds of Pa.
- The chip's temperature reading exists for compensation (±2 °C). Don't use it as an accurate air thermometer.
- Draughts and direct sunlight make the pressure jump. Shield the sensor and average a few readings for altitude work.

## Datasheet
https://static-cdn.m5stack.com/resource/docs/datasheet/unit/enviii/QMP6988%20Datasheet.pdf
