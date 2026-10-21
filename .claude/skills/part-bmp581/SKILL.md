---
name: part-bmp581
description: Pinout, electrical limits, wiring and MicroPython driver for the BMP581 high-precision barometric pressure & temperature sensor (Bosch BMP581, SparkFun SEN-20170 Qwiic board). Use when designing, wiring, simulating or writing code for a BMP581 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# BMP581 pressure & temperature sensor (BMP581)

## Overview
The **BMP581** from Bosch Sensortec measures air pressure (30–125 kPa, ±50 Pa absolute, under 0.1 Pa RMS noise) and temperature (−40 to 85 °C, ±0.5 °C). Unlike the BMP280/BMP390 it compensates its readings on-chip, so there are no calibration coefficients: the registers hold degrees and pascals directly. It talks I2C/I3C or SPI. Hobbyists buy it on the **SparkFun Pressure Sensor - BMP581 (Qwiic), SEN-20170**: two Qwiic sockets, a 7-pin header, 2.2 kΩ I2C pull-ups and **no regulator** (3.3 V only).

## Pinout (SparkFun SEN-20170, header order)
| Pin | Function |
|---|---|
| GND | Ground |
| 3V3 | Supply, 1.71–3.6 V straight to the chip (use 3.3 V) |
| SDI/SDA | I2C data (SPI SDI), 2.2 kΩ pull-up |
| SCK/SCL | I2C clock (SPI SCK), 2.2 kΩ pull-up |
| SDO/ADR | Address select via ADR jumper: 0x47 default, 0x46 alternate (SPI data out) |
| CSB | SPI chip select, 10 kΩ pull-up = I2C. Leave unconnected |
| INT | Interrupt output, 3.3 V (optional) |

## Electrical limits
- Chip: VDD 1.71–3.6 V, VDDIO 1.08–3.6 V (both tied to 3V3 on the board); absolute maximum 4.3 V. **Never 5 V** on any pin: there is no level shifting.
- Current: about 260 µA peak while converting, 0.55 µA in deep standby.
- I2C up to 1 MHz (Fm+).

## Interface details
- **I2C address 0x47** (SDO high, SparkFun default), 0x46 with SDO low.
- Chip ID: register 0x01 = **0x50** (0x51 = BMP585).
- Soft reset: write 0xB6 to CMD (0x7E), wait 2 ms. Then check STATUS (0x28) nvm_rdy (bit 1) = 1 and nvm_err (bit 2) = 0, and INT_STATUS (0x27, clear-on-read) por (bit 4) = 1.
- After reset the chip is in deep standby. Write ODR_CONFIG (0x37) with deep_dis (bit 7) = 1, pwr_mode = 00 (standby), wait 2.5 ms, then configure.
- OSR_CONFIG (0x36): osr_t bits 2:0, osr_p bits 5:3 (0 = ×1 … 7 = ×128), **press_en bit 6** (without it only temperature is measured).
- Data-ready: INT_SOURCE (0x15) = 0x01 enables drdy; INT_CONFIG (0x14) = 0x0B (enabled, latched, active high, push-pull).
- Forced measurement: ODR_CONFIG pwr_mode = 10. Conversion time = t_conv_p + t_conv_t (e.g. ×16 pressure 10.4 ms + ×1 temperature 1.0 ms, ±5 %). Wait for INT_STATUS bit 0 (drdy_data_reg).
- Burst-read 6 bytes from 0x1D: temperature XLSB, LSB, MSB, pressure XLSB, LSB, MSB (24-bit, **little-endian**).
- Temperature: T = signed24 / 2¹⁶ °C. Pressure: p = raw24 / 2⁶ Pa.

## Wiring
- ESP32: 3V3 → 3V3, GND → GND, SDI/SDA → D21, SCK/SCL → D22.
- Pico: 3V3 → 3V3(OUT), GND → GND, SDI/SDA → GP4, SCK/SCL → GP5.
- Raspberry Pi 4: 3V3 → pin 1 (3.3 V), GND → pin 6, SDI/SDA → pin 3, SCK/SCL → pin 5.
- Leave SDO/ADR, CSB and INT unconnected for basic I2C use (address 0x47). Or just use a Qwiic cable.

## Using the driver
```python
from machine import I2C, Pin
from bmp581 import BMP581
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
sensor = BMP581(i2c, addr=0x47)
t, p = sensor.read()            # degC, Pa
print('T=%.2fC P=%.2fPa' % (t, p))
print('Altitude %.1f m' % sensor.altitude(101325))
```

## Gotchas
- `OSError: ENODEV` / chip-ID error: check the address. SparkFun boards default to 0x47; other breakouts often use 0x46.
- Pressure frozen at the reset value: press_en (0x36 bit 6) was not set.
- Configuration writes are lost unless the chip is in standby; write OSR/INT settings before triggering forced mode.
- BMP280/BMP390 code does not work: different registers and no calibration maths.
- The driver returns pascals; divide by 100 for hPa/mbar.
- For altitude, pass today's sea-level pressure from a local weather report.

## Datasheet
https://www.bosch-sensortec.com/media/boschsensortec/downloads/datasheets/bst-bmp581-ds004.pdf
