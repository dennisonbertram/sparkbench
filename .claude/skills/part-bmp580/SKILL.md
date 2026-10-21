---
name: part-bmp580
description: Pinout, electrical limits, wiring and MicroPython driver for the BMP580 barometric pressure & temperature sensor (Bosch BMP580, Adafruit #6411 STEMMA QT breakout). Use when designing, wiring, simulating or writing code for a BMP580 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# BMP580 pressure & temperature sensor (BMP580)

## Overview
The **BMP580** from Bosch Sensortec measures air pressure (30–125 kPa, ±6 Pa relative, ±30 Pa absolute) and temperature (−40 to 85 °C, ±0.5 °C). It is the lower-cost sibling of the BMP581 with the same register map: readings are compensated on-chip, so the registers hold degrees and pascals directly (no calibration maths). It talks I2C/I3C or SPI. Hobbyists buy it on the **Adafruit BMP580 I2C or SPI Temperature and Pressure Sensor - STEMMA QT (#6411)**: 3.3 V regulator, level shifting on the inputs, two STEMMA QT sockets and an 8-pin header.

## Pinout (Adafruit #6411, header order left to right)
| Pin | Function |
|---|---|
| VIN | Supply 3–5 V into the on-board regulator |
| 3Vo | 3.3 V regulator output (up to 100 mA), leave unconnected |
| GND | Ground |
| SCL | I2C clock (SPI SCK), level shifted |
| SDO | Address select: open = 0x47, GND = 0x46 (SPI data out, 3.3 V) |
| SDA | I2C data (SPI SDI), level shifted |
| CS | SPI chip select, pulled up = I2C. Leave unconnected |
| INT | Interrupt output, 3.3 V (optional) |

## Electrical limits
- Board: VIN 3–5 V. Chip: VDD 1.71–3.6 V, absolute maximum 4.3 V (the regulator handles this).
- SDO and INT are 3.3 V outputs, not level shifted: never tie SDO to 5 V.
- Current: about 260 µA peak while converting, 0.55 µA in deep standby (plus the regulator and power LED).
- I2C up to 1 MHz (Fm+).

## Interface details
- **I2C address 0x47** (default), 0x46 with SDO to GND or the addr jumper closed.
- Chip ID: register 0x01 = **0x50** (same as BMP581; 0x51 = BMP585).
- Soft reset: write 0xB6 to CMD (0x7E), wait 2 ms. Then check STATUS (0x28) nvm_rdy (bit 1) = 1 and nvm_err (bit 2) = 0, and INT_STATUS (0x27, clear-on-read) por (bit 4) = 1.
- After reset the chip is in deep standby. Write ODR_CONFIG (0x37) with deep_dis (bit 7) = 1, pwr_mode = 00 (standby), wait 2.5 ms, then configure.
- OSR_CONFIG (0x36): osr_t bits 2:0, osr_p bits 5:3 (0 = ×1 … 7 = ×128), **press_en bit 6** (without it only temperature is measured).
- Data-ready: INT_SOURCE (0x15) = 0x01; INT_CONFIG (0x14) low nibble = 0x0B (enabled, latched, active high, push-pull), keep the upper drive-strength bits.
- Forced measurement: ODR_CONFIG pwr_mode = 10. Conversion time = t_conv_p + t_conv_t (e.g. ×16 pressure 10.4 ms + ×1 temperature 1.0 ms, ±5 %). Wait for INT_STATUS bit 0 (drdy_data_reg).
- Burst-read 6 bytes from 0x1D: temperature XLSB, LSB, MSB, pressure XLSB, LSB, MSB (24-bit, **little-endian**).
- Temperature: T = signed24 / 2¹⁶ °C. Pressure: p = raw24 / 2⁶ Pa.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.
- Leave 3Vo, SDO, CS and INT unconnected for basic I2C use (address 0x47). Or just use a STEMMA QT / Qwiic cable.

## Using the driver
```python
from machine import I2C, Pin
from bmp580 import BMP580
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
sensor = BMP580(i2c, addr=0x47)
t, p = sensor.read()            # degC, Pa
print('T=%.2fC P=%.2fPa' % (t, p))
print('Altitude %.1f m' % sensor.altitude(101325))
```

## Gotchas
- `OSError: ENODEV` / chip-ID error: check the address (0x47 default, 0x46 if SDO is grounded).
- Pressure frozen at the reset value: press_en (0x36 bit 6) was not set.
- Configuration writes are lost unless the chip is in standby; write OSR/INT settings before triggering forced mode.
- BMP280/BMP390 code does not work: different registers and no calibration maths. BMP581 code works unchanged.
- The driver returns pascals; divide by 100 for hPa/mbar.
- For altitude, pass today's sea-level pressure from a local weather report.

## Datasheet
https://pdf.direnc.net/upload/bmp580-datasheet.pdf (Bosch BST-BMP580-DS004-02; product page https://www.bosch-sensortec.com/products/environmental-sensors/pressure-sensors/bmp580/)
