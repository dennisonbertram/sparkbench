---
name: part-m5stack-env-iv
description: Pinout, electrical limits, wiring and MicroPython driver for the M5Stack ENV IV unit (U001-D, Sensirion SHT40 temperature/humidity + Bosch BMP280 pressure, Grove I2C). Use when designing, wiring, simulating or writing code for an M5Stack ENV IV in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# M5Stack ENV IV unit (SHT40 + BMP280)

## Overview
The **M5Stack ENV IV Unit (SKU U001-D)** is a small plastic-cased block with two sensors on one I2C bus:
- **Sensirion SHT40** at **0x44**: temperature (−40 to 125 °C, ±0.2 °C) and relative humidity (0–100 %, ±1.8 %).
- **Bosch BMP280** at **0x76**: air pressure (300–1100 hPa) and its own temperature (used for pressure compensation).

The board has an HT7533 3.3 V regulator and 4.7 kΩ pull-ups from SDA/SCL to 3.3 V, so it is powered with 5 V while its I2C lines stay at 3.3 V. It connects with a 4-pin HY2.0-4P (Grove-style) socket and ships with a 20 cm Grove cable. (DigiKey lists U001-D as obsolete; it is still widely sold. The ENV III used an SHT30 + QMP6988 instead, so its drivers do not apply.)

## Pinout (HY2.0-4P Grove socket, M5Stack PORT.A order)
| Pin | Wire | Function |
|---|---|---|
| GND | black | Ground |
| 5V | red | Supply, 5 V nominal (on-board 3.3 V regulator) |
| SDA | yellow | I2C data, 4.7 kΩ pull-up to 3.3 V on the unit |
| SCL | white | I2C clock, 4.7 kΩ pull-up to 3.3 V on the unit |

## Electrical limits
- Supply: 5 V nominal; 3.3 V also works (the HT7533 then passes about 3.2 V, within both chips' range: SHT40 1.08–3.6 V, BMP280 1.71–3.6 V). Do not exceed 5.5 V.
- Current: about 1 mA while measuring (SHT40 ≤0.5 mA, BMP280 ~0.7 mA), microamps idle.
- I2C up to 400 kHz is safe for both chips.

## Interface details
**SHT40 (0x44)**
- Write the single byte **0xFD** (high precision), wait ≥ 8.3 ms (10 ms), read 6 bytes: T MSB, T LSB, CRC, RH MSB, RH LSB, CRC.
- CRC-8: poly 0x31, init 0xFF.
- T = −45 + 175 × raw / 65535 °C; RH = −6 + 125 × raw / 65535 %, cropped to 0–100 %.

**BMP280 (0x76)**
- Chip ID register 0xD0 = 0x58. Soft reset: write 0xB6 to 0xE0.
- Calibration words dig_T1…dig_P9 at 0x88–0x9F, little-endian (T1 and P1 unsigned).
- Forced mode: write (osrs_t<<5)|(osrs_p<<2)|1 to 0xF4, wait ≥ 6.4 ms (×1/×1), poll 0xF3 bit 3, then burst-read 0xF7–0xFC (pressure then temperature, 20 bits each).
- Apply the datasheet compensation (section 8.1): temperature first (sets t_fine), then pressure in Pa.

## Wiring
Use a Grove-to-female-jumper cable (or cut the supplied cable).
- ESP32: 5V → 5V/VIN, GND → GND, SDA → GPIO21, SCL → GPIO22.
- Pico: 5V → VBUS (pin 40), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi: 5V → pin 2, GND → pin 6, SDA → pin 3, SCL → pin 5 (the unit's pull-ups go to 3.3 V, so this is safe).

## Using the driver
```python
from machine import I2C, Pin
from env4 import ENV4
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
env = ENV4(i2c)
t, h, p = env.read()
print('T=%.1fC H=%.0f%% P=%.1fhPa' % (t, h, p))
```
`SHT40` and `BMP280` classes in `env4.py` can also be used on their own.

## Gotchas
- `i2c.scan()` must show both 0x44 and 0x76; if only one appears, the unit is not an ENV IV (ENV III shows 0x44 and 0x70).
- Use the SHT40 temperature for the air; the BMP280 temperature reads a little high from self-heating and is mainly for pressure.
- Both addresses are fixed: only one ENV IV per I2C bus (use a PaHUB / TCA9548A mux for more).
- A CRC mismatch from the SHT40 usually means a loose cable.
- Pressure in hPa is not altitude: altitude needs the local sea-level pressure (`env.altitude(sea_level_hpa)`).

## Datasheet
- SHT40: https://sensirion.com/resource/datasheet/sht4x
- BMP280: https://www.bosch-sensortec.com/media/boschsensortec/downloads/datasheets/bst-bmp280-ds001.pdf
- Unit docs and schematic: https://docs.m5stack.com/en/unit/Unit_ENV-IV
