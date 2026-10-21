---
name: part-bmp388
description: Pinout, electrical limits, wiring and MicroPython driver for the BMP388 precision barometric pressure & temperature sensor (Bosch BMP388). Use when designing, wiring, simulating or writing code for a BMP388 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# BMP388 pressure & temperature sensor (BMP388)

## Overview
The **BMP388** from Bosch Sensortec measures air pressure (300–1250 hPa, ±0.08 hPa relative, ±0.5 hPa absolute) and temperature (−40 to 85 °C, ±0.5 °C). It is precise enough to work as an altimeter (about ±0.5 m relative). It talks I2C or SPI. Hobbyists buy it on the **Adafruit BMP388 breakout (#3966, STEMMA QT version)**, which has a 3.3 V regulator, level shifting on SCL/SDA, pull-ups and two STEMMA QT sockets.

## Pinout (Adafruit BMP388 #3966, header order)
| Pin | Function |
|---|---|
| VIN | Supply, 3–5 V (on-board 3.3 V regulator) |
| 3Vo | 3.3 V output of the regulator (up to 100 mA); leave unconnected |
| GND | Ground |
| SCL | I2C clock (SPI SCK), level shifted, 10 kΩ pull-up |
| SDO | Address select: open = 0x77 (pulled up), GND = 0x76 (SPI data out); 3.3 V only |
| SDA | I2C data (SPI SDI), level shifted, 10 kΩ pull-up |
| CS | SPI chip select; pulled up = I2C. Leave unconnected |
| INT | Interrupt output, 3.3 V push-pull (optional) |

## Electrical limits
- Chip: VDD 1.65–3.6 V, VDDIO 1.2–3.6 V, absolute maximum 3.8 V. The breakout takes 3–5 V on VIN.
- Current: about 0.7 mA peak while measuring pressure, 2 µA asleep.
- SDO and INT connect straight to the chip (3.3 V): never tie SDO to 5 V.

## Interface details
- **I2C address 0x77** on the Adafruit board (SDO high); 0x76 with SDO to GND or the ADDR jumper shorted.
- Chip ID: register 0x00 = **0x50** (a BMP390 reads 0x60 and uses the same driver).
- Soft reset: write 0xB6 to CMD (0x7E); wait for STATUS (0x03) bit 4 cmd_rdy.
- Configure OSR (0x1C: osr_p bits 2:0, osr_t bits 5:3), ODR (0x1D), CONFIG (0x1F, IIR filter).
- Forced measurement: write **0x13** to PWR_CTRL (0x1B: press_en, temp_en, mode 01). Conversion time = 234 + 392 + 2^osr_p × 2000 + 313 + 2^osr_t × 2000 µs (about 19 ms at ×8/×1). Wait for STATUS bits 5 and 6 (drdy_press, drdy_temp).
- Burst-read 6 bytes from 0x04: pressure XLSB, LSB, MSB, then temperature XLSB, LSB, MSB (24-bit unsigned, **little-endian**).
- Calibration: 21 bytes at 0x31–0x45 (NVM_PAR_T1…NVM_PAR_P11). Convert them with datasheet appendix 9.1 (e.g. PAR_T1 = NVM_PAR_T1 × 2⁸, PAR_T2 = NVM_PAR_T2 / 2³⁰, PAR_P1 = (NVM_PAR_P1 − 2¹⁴) / 2²⁰, PAR_P5 = NVM_PAR_P5 × 8).
- Temperature (9.2): t_lin = (T_raw − PAR_T1) × PAR_T2 + (T_raw − PAR_T1)² × PAR_T3 °C.
- Pressure (9.3, Pa): P5 + P6·t + P7·t² + P8·t³ + P_raw·(P1 + P2·t + P3·t² + P4·t³) + P_raw²·(P9 + P10·t) + P_raw³·P11, with t = t_lin.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.
- Leave 3Vo, SDO, CS and INT unconnected for basic I2C use (address 0x77).

## Using the driver
```python
from machine import I2C, Pin
from bmp388 import BMP388
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
sensor = BMP388(i2c, addr=0x77)
t, p = sensor.read()
print('T=%.2fC P=%.2fhPa' % (t, p))
print('Altitude %.1f m' % sensor.altitude(1013.25))
```

## Gotchas
- `OSError: ENODEV` / chip-ID error: check the address. Adafruit boards default to 0x77, many clone modules to 0x76.
- Data registers are little-endian (XLSB first), unlike the BMP280's big-endian layout: BMP280 code gives nonsense here.
- Always compute temperature before pressure (pressure uses t_lin).
- For altitude, pass today's sea-level pressure from a local weather report; the default 1013.25 hPa can be off by tens of metres.
- Wind and fans show up as pressure noise; increase oversampling or enable the IIR filter (CONFIG 0x1F) for steadier readings.

## Datasheet
https://www.bosch-sensortec.com/media/boschsensortec/downloads/datasheets/bst-bmp388-ds001.pdf
