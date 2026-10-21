---
name: part-ms5607
description: Pinout, electrical limits, wiring and MicroPython driver for the MS5607 barometric pressure & temperature sensor (TE/MEAS MS5607-02BA03, Parallax Altimeter Module #29124). Use when designing, wiring, simulating or writing code for an MS5607 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MS5607 barometric pressure & temperature sensor (MS5607)

## Overview
The **MS5607-02BA03** from TE Connectivity (MEAS) measures absolute pressure (10–1200 mbar, 0.024 mbar RMS at OSR 4096, about 20 cm of altitude) and temperature (−40 to 85 °C). A 24-bit ADC returns raw counts D1 (pressure) and D2 (temperature); six factory calibration coefficients in a PROM turn them into mbar and °C. Hobbyists buy it on the **Parallax Altimeter Module MS5607 (#29124)**, which adds a regulator (3.3–6.5 V), level shifting and I2C pull-ups.

## Pinout (Parallax #29124, header order)
| Pin | Function |
|---|---|
| GND | Ground |
| VIN | Supply, 3.3–6.5 V (use the microcontroller's I/O voltage) |
| PS | Protocol select, pulled high on the module = I2C; GND = SPI |
| SCL | I2C clock / SPI SCLK |
| SDA | I2C data / SPI SDI |
| SDO | SPI data out (unused in I2C) |
| CS | SPI chip select; in I2C the address select: high/open = 0x76, low = 0x77 |

## Electrical limits
- Chip: 1.8–3.6 V (absolute max 4.0 V); the module's regulator accepts 3.3–6.5 V on VIN.
- Current: 1.4 mA peak during conversion, 0.14 µA max standby.
- I2C up to 400 kHz on the module (chip: SPI up to 20 MHz).

## Interface details
- **I2C address 0x76** (CS high, module default), 0x77 (CS low). The address is 111011C, with C the complement of CSB.
- Reset **0x1E**, then wait 2.8 ms (PROM reload).
- PROM read **0xA0 + 2·n** (n = 0…7) → 16-bit word, MSB first. Word 0 = factory data, words 1–6 = C1…C6, word 7 low nibble = AN520 CRC-4.
- Convert D1: 0x40/0x42/0x44/0x46/0x48 (OSR 256…4096); convert D2: 0x50…0x58. Max conversion time 0.60/1.17/2.28/4.54/9.04 ms.
- ADC read **0x00** → 24-bit result, MSB first. It reads 0 if the conversion is not finished or the result was already read.
- Compensation (MS5607 constants):
  - dT = D2 − C5·2^8, TEMP = 2000 + dT·C6/2^23 (0.01 °C)
  - OFF = C2·2^17 + C4·dT/2^6, SENS = C1·2^16 + C3·dT/2^7
  - P = (D1·SENS/2^21 − OFF)/2^15 (0.01 mbar)
  - Below 20 °C: T2 = dT²/2^31, OFF2 = 61·(TEMP−2000)²/2^4, SENS2 = 2·(TEMP−2000)²; below −15 °C also add 15·(TEMP+1500)² to OFF2 and 8·(TEMP+1500)² to SENS2. Subtract them from TEMP, OFF and SENS.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22. Leave PS, SDO, CS unconnected.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from ms5607 import MS5607
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
p, t = MS5607(i2c).read()
print('P=%.1fmbar T=%.1fC' % (p, t))
```

## Gotchas
- Do not use MS5611 code: the MS5611 uses different compensation exponents (2^16/2^7 and 2^15/2^8), so its maths gives wrong pressure for an MS5607.
- Power VIN from 3.3 V on 3.3 V boards: the SDA level shifter pulls up to VIN.
- A CRC-4 mismatch or all-0xFFFF PROM almost always means a loose wire or the wrong address.
- The sensor is light sensitive; shade it. It is also moisture sensitive.

## Datasheet
https://www.farnell.com/datasheets/1756127.pdf
