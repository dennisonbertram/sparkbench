---
name: part-ms5837-30ba
description: Pinout, electrical limits, wiring and MicroPython driver for the MS5837-30BA 30 bar water depth / pressure & temperature sensor (TE Connectivity MS5837-30BA, Blue Robotics Bar30). Use when designing, wiring, simulating or writing code for an MS5837-30BA or Bar30 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MS5837-30BA depth / pressure sensor (Blue Robotics Bar30)

## Overview
The **MS5837-30BA** from TE Connectivity is a gel-filled, water-resistant absolute pressure sensor (0–30 bar, about 300 m of sea water) with a 24-bit ΔΣ ADC, an on-chip temperature sensor and factory calibration in PROM. It talks I2C at **0x76**. Hobbyists buy it as the **Blue Robotics Bar30** (a potted, threaded penetrator with a 4-wire JST-GH cable), used in ROVs, boats and water-level loggers. Resolution is 0.2 mbar (≈2 mm of water) at OSR 8192.

## Pinout (Bar30 JST-GH cable, connector order)
| Pin | Wire | Function |
|---|---|---|
| Vin | red | Supply 2.5–5.5 V (on-board MIC5365 3.3 V regulator) |
| SCL | green | I2C clock, 3.3 V logic |
| SDA | white | I2C data, 3.3 V logic |
| GND | black | Ground |

## Electrical limits
- Bar30 supply: 2.5–5.5 V; I2C logic 2.5–3.6 V (no level shifter on board).
- Chip: VDD 1.5–3.6 V, peak 1.25 mA during conversion, 0.01 µA standby.
- **No I2C pull-ups on the Bar30** (see the open-source schematic): add 4.7 kΩ from SDA and SCL to 3.3 V.
- Operating temperature −20 to 85 °C; pressure 0–30 bar (50 bar overpressure).

## Interface details
- Commands (1 byte): reset `0x1E`; PROM read `0xA0`–`0xAC` (7 words, 2 bytes each, MSB first); convert D1 (pressure) `0x40 + 2·k`, convert D2 (temperature) `0x50 + 2·k` for OSR 256…4096 (k = 0…4; 8192 = `0x4A`/`0x5A`); ADC read `0x00` → 24 bits.
- Wait the **maximum** conversion time before ADC read: 0.6 / 1.17 / 2.28 / 4.54 / 9.04 / 18.08 ms for OSR 256…8192. Reading early returns 0 and corrupts the conversion.
- CRC-4 sits in bits 15:12 of PROM word 0 (datasheet C code, poly 0x3000, word 0's CRC nibble cleared and an 8th word of 0).
- Compensation (datasheet):  dT = D2 − C5·2⁸; TEMP = 2000 + dT·C6/2²³; OFF = C2·2¹⁶ + C4·dT/2⁷; SENS = C1·2¹⁵ + C3·dT/2⁸.
  Second order — TEMP < 2000: Ti = 3·dT²/2³³, OFFi = 3·(TEMP−2000)²/2, SENSi = 5·(TEMP−2000)²/8 (and below −1500 add 7·(TEMP+1500)² and 4·(TEMP+1500)²); else Ti = 2·dT²/2³⁷, OFFi = (TEMP−2000)²/16, SENSi = 0.
  TEMP2 = (TEMP − Ti)/100 °C; P2 = ((D1·(SENS−SENSi)/2²¹ − (OFF−OFFi))/2¹³)/10 mbar.
- Depth (m) = (P − P_surface) × 100 / (ρ × 9.80665), ρ = 1029 kg/m³ sea water, 997 fresh water.

## Wiring
- ESP32: Vin → 3V3 (or 5V), GND → GND, SDA → D21, SCL → D22, 4.7 kΩ pull-ups SDA/SCL → 3V3.
- Pico: Vin → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5, 4.7 kΩ pull-ups → 3V3.
- Raspberry Pi: Vin → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5 (the Pi already has 1.8 kΩ pull-ups).
- 5 V Arduino: use a logic level converter on SDA/SCL.

## Using the driver
```python
from machine import I2C, Pin
from ms5837 import MS5837_30BA
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
s = MS5837_30BA(i2c)          # resets, reads PROM, checks CRC
p, t = s.read()               # mbar, °C (OSR 4096)
print('P=%.1f mbar T=%.1f C depth=%.2f m' % (p, t, s.depth(p)))
```

## Gotchas
- A "PROM CRC mismatch" means a loose wire or missing pull-ups.
- The MS5837-02BA (Bar02) uses a different formula; this driver is for the 30BA only (PROM word 0 bits 11:5 = 0).
- Record the surface pressure at start-up instead of assuming 1013.25 mbar for accurate depth.
- Don't touch or poke the gel; rinse after salt water.

## Datasheet
https://www1.futureelectronics.com/doc/TE%20Connectivity%20Sensors/MS583730BA01-50.pdf
