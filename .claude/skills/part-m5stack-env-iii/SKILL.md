---
name: part-m5stack-env-iii
description: Pinout, electrical limits, wiring and MicroPython driver for the M5Stack ENV III unit (U001-C, Sensirion SHT30 temperature/humidity + QST QMP6988 pressure, Grove I2C). Use when designing, wiring, simulating or writing code for an M5Stack ENV III in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# M5Stack ENV III unit (SHT30 + QMP6988)

## Overview
The **M5Stack ENV III Unit (SKU U001-C)** is a small plastic-cased block with two sensors on one I2C bus:
- **Sensirion SHT30** at **0x44**: temperature (−40 to 125 °C, ±0.2 °C) and relative humidity (0–100 %, ±2 %).
- **QST QMP6988** at **0x70**: air pressure (300–1100 hPa) and its own temperature (used for pressure compensation).

An HT7533 regulator makes 3.3 V for both chips. The 4.7 kΩ pull-ups on SDA/SCL (R1, R2 in M5Stack's schematic) go to the **Grove supply pin (VCC)**, not to the 3.3 V rail. It connects with a 4-pin HY2.0-4P (Grove-style) socket and ships with a 20 cm Grove cable. (The ENV IV uses an SHT40 + BMP280 at 0x44/0x76 instead, so its drivers do not apply.)

## Pinout (HY2.0-4P Grove socket, M5Stack PORT.A order)
| Pin | Wire | Function |
|---|---|---|
| GND | black | Ground |
| 5V | red | Supply: feeds the 3.3 V regulator and the I2C pull-ups |
| SDA | yellow | I2C data, 4.7 kΩ pull-up to the supply pin |
| SCL | white | I2C clock, 4.7 kΩ pull-up to the supply pin |

## Electrical limits
- **Feed 3.3 V** (3.0–3.6 V) from an ESP32, Pico or Raspberry Pi. M5Stack's own controllers feed 5 V, but then SDA/SCL are pulled to 5 V: above the SHT30's pin limit (VDD + 0.3 V, the chip runs at 3.3 V) and above a 3.3 V board's GPIO limit.
- With 3.3 V in, the HT7533 passes about 3.2 V: within SHT30 (2.15–5.5 V) and QMP6988 (1.71–3.6 V) ranges.
- Current: about 1.5 mA while both chips measure, microamps idle (plus about 0.7 mA per pull-up while a line is low).
- I2C up to 400 kHz.

## Interface details
**SHT30 (0x44)**
- Single shot, high repeatability, no clock stretching: write **0x24 0x00**, wait ≥ 15.5 ms (20 ms), read 6 bytes: T MSB, T LSB, CRC, RH MSB, RH LSB, CRC.
- CRC-8: poly 0x31, init 0xFF. Soft reset: 0x30 0xA2.
- T = −45 + 175 × raw / 65535 °C; RH = 100 × raw / 65535 %.

**QMP6988 (0x70)**
- CHIP_ID 0xD1 = 0x5C. Soft reset: write 0xE6 to 0xE0.
- OTP coefficients 0xA0–0xB8: a1, a2, bt1, bt2, bp1, b11, bp2, b12, b21, bp3 are 16-bit signed (high byte first) and K = A + S × OTP / 32767 with the datasheet's A/S factors; a0 and b00 are 20-bit signed (bits 19:12, 11:4, and a nibble of 0xB8) divided by 16.
- Forced measurement: write (temp_avg<<5)|(press_avg<<2)|01 to CTRL_MEAS 0xF4 (driver: ×4 / ×8 → 24-bit data, 0x71), poll DEVICE_STAT 0xF3 bit 3, then read 6 bytes from 0xF7: pressure then temperature, each 24 bits MSB first; Dp/Dt = value − 2²³.
- Tr = a0 + a1·Dt + a2·Dt² (in 1/256 °C); Pr = b00 + bt1·Tr + bp1·Dp + b11·Tr·Dp + bt2·Tr² + bp2·Dp² + b12·Dp·Tr² + b21·Dp²·Tr + bp3·Dp³ (Pa).

## Wiring
Use a Grove-to-female-jumper cable (or cut the supplied cable).
- ESP32: red → 3V3, black → GND, yellow (SDA) → GPIO21, white (SCL) → GPIO22.
- Pico: red → 3V3(OUT) (pin 36), black → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi: red → pin 1 (3.3 V), black → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from env3 import ENV3
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
env = ENV3(i2c)
t, h, p = env.read()
print('T=%.1fC H=%.0f%% P=%.1fhPa' % (t, h, p))
```
`SHT30` and `QMP6988` classes in `env3.py` can also be used on their own.

## Gotchas
- `i2c.scan()` must show 0x44 and 0x70; 0x44 + 0x76 means an ENV II / ENV IV (BMP280), not an ENV III.
- Use the SHT30 temperature for the air; the QMP6988 temperature is mainly for pressure compensation.
- Both addresses are fixed: one ENV III per I2C bus (use a PaHUB / TCA9548A mux for more).
- A CRC mismatch from the SHT30 usually means a loose cable.
- Pressure in hPa is not altitude: altitude needs the local sea-level pressure (`env.altitude(sea_level_hpa)`).

## Datasheet
- QMP6988: https://m5stack.oss-cn-shenzhen.aliyuncs.com/resource/docs/datasheet/unit/enviii/QMP6988%20Datasheet.pdf
- SHT30: https://sensirion.com/media/documents/213E6A3B/63A5A569/Datasheet_SHT3x_DIS.pdf
- Unit docs and schematic: https://docs.m5stack.com/en/unit/envIII
