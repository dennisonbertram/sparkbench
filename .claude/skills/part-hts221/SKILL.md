---
name: part-hts221
description: Pinout, electrical limits, wiring and MicroPython driver for the HTS221 temperature & humidity sensor (STMicroelectronics HTS221). Use when designing, wiring, simulating or writing code for an HTS221 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# HTS221 temperature & humidity sensor (HTS221)

## Overview
The **HTS221** from STMicroelectronics measures relative humidity (0–100 % rH, ±3.5 % from 20–80 %) and temperature (−40 to 120 °C, ±0.5 °C from 15–40 °C) with 16-bit outputs. It talks I2C or 3-wire SPI and has a data-ready pin. Every chip stores its own two-point calibration, which the driver reads to convert raw counts. Hobbyists buy it on the **Adafruit HTS221 breakout (#4535, STEMMA QT / Qwiic)**, which adds a 3.3 V regulator, level shifting and 10 kΩ pull-ups so it runs from 3–5 V. (It is also the humidity sensor on the Raspberry Pi Sense HAT.)

## Pinout (Adafruit #4535, header left to right)
| Pin | Function |
|---|---|
| VIN | Supply, 3–5 V (regulated to 3.3 V on the board) |
| 3Vo | 3.3 V regulator output (up to 100 mA): leave unconnected |
| GND | Ground |
| SCL | I2C clock (10 kΩ pull-up) / SPI clock |
| SDA | I2C data (10 kΩ pull-up) / 3-wire SPI data |
| DRDY | Data-ready output (optional) |
| CS | Interface select: open/high = I2C, low = SPI (optional) |

## Electrical limits
- Chip supply: 1.7–3.6 V (absolute max 4.8 V). The Adafruit board takes 3–5 V on VIN.
- Current: about 2 µA at 1 Hz (default averaging), 0.5 µA powered down; the board's LED and regulator add more.
- I2C up to 400 kHz.

## Interface details
- **I2C address 0x5F** (fixed). WHO_AM_I (0x0F) = **0xBC**.
- Multi-byte reads need bit 7 of the register address set (e.g. 0x28 | 0x80 = 0xA8) to auto-increment.
- Start: CTRL_REG1 (0x20) = 0x85 → powered on, block data update, 1 Hz. Or leave ODR = 0 and set ONE_SHOT (CTRL_REG2 bit 0) for each reading.
- STATUS_REG (0x27): bit 1 H_DA, bit 0 T_DA = new data ready.
- H_OUT (0x28/0x29) and T_OUT (0x2A/0x2B): signed 16-bit, low byte first.
- Calibration (0x30–0x3F): H0_rH_x2 (0x30), H1_rH_x2 (0x31), T0_degC_x8 (0x32), T1_degC_x8 (0x33), T1/T0 MSBs (0x35: bits 3:2 = T1 bits 9:8, bits 1:0 = T0 bits 9:8), H0_T0_OUT (0x36/37), H1_T0_OUT (0x3A/3B), T0_OUT (0x3C/3D), T1_OUT (0x3E/3F).
- T = T0 + (T_OUT − T0_OUT) × (T1 − T0) / (T1_OUT − T0_OUT), with T0 = T0_degC_x8 / 8.
- RH = H0 + (H_OUT − H0_T0_OUT) × (H1 − H0) / (H1_T0_OUT − H0_T0_OUT), with H0 = H0_rH_x2 / 2; clip to 0–100 %.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.
- Leave 3Vo, DRDY and CS unconnected.

## Using the driver
```python
from machine import I2C, Pin
from hts221 import HTS221
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
t, h = HTS221(i2c).read()
print('T=%.1fC H=%.1f%%' % (t, h))
```

## Gotchas
- There is no fixed conversion formula: always read the chip's own calibration registers. Copying numbers from another chip gives wrong readings.
- Without the 0x80 auto-increment bit, a multi-byte read returns the same register repeatedly.
- The chip starts powered down: a fresh chip reads zeros until CTRL_REG1 PD is set.
- CS tied low puts the chip in SPI mode and it disappears from the I2C scan.
- Never write registers 0x30–0x3F or the reserved ones; if calibration gets corrupted, set BOOT (CTRL_REG2 bit 7) to reload it.
- ST lists the HTS221 as not recommended for new designs (suggested replacement: Sensirion SHT40).

## Datasheet
https://www.st.com/resource/en/datasheet/hts221.pdf
