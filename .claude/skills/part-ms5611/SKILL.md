---
name: part-ms5611
description: Pinout, electrical limits, wiring and MicroPython driver for the MS5611 barometric pressure & temperature sensor (TE / MEAS MS5611-01BA03, GY-63 module). Use when designing, wiring, simulating or writing code for an MS5611 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build, e.g. altimeters and variometers.
---

# MS5611 barometric pressure sensor (MS5611-01BA03)

## Overview
The **MS5611-01BA03** from TE Connectivity (MEAS) measures air pressure (10–1200 mbar, 0.012 mbar RMS at OSR 4096, about 10 cm of altitude) and temperature (−40 to 85 °C, 0.01 °C steps) with a 24-bit ΔΣ ADC. Each chip stores six factory calibration coefficients in a CRC-protected PROM; the driver must apply the datasheet compensation maths. Hobbyists buy it on the **GY-63 module**, which adds a 3.3 V regulator, pulls PS high (I2C) and pulls CSB low (address 0x77).

## Pinout (GY-63 module, header order)
| Pin | Function |
|---|---|
| VCC | Supply 3.3–5 V into the on-board 3.3 V regulator |
| GND | Ground |
| SCL | I2C clock (SPI SCLK) |
| SDA | I2C data (SPI SDI) |
| CSB | Address select: low/unconnected = 0x77, VCC = 0x76 (SPI chip select) |
| SDO | SPI data out (unused in I2C mode) |
| PS | Protocol select: pulled high = I2C, GND = SPI |

## Electrical limits
- Chip supply 1.8–3.6 V (absolute max 4.0 V); the GY-63 regulator lets VCC be 3.3–5 V.
- Current: 1.4 mA peak during a conversion, 12.5 µA at one OSR-4096 sample per second, < 0.15 µA standby.
- Overpressure 6 bar max.

## Interface details
- **I2C address 0x77** (CSB low), 0x76 (CSB high). Address = 111011C, where C is the complement of CSB.
- Commands (one byte): reset **0x1E** (wait 2.8 ms), PROM read **0xA0–0xAE** (2 bytes, MSB first), convert D1 pressure **0x40–0x48**, convert D2 temperature **0x50–0x58** (OSR 256…4096), ADC read **0x00** (3 bytes, MSB first).
- Conversion time at OSR 4096: 8.22 ms typ, 9.04 ms max. An ADC read before the conversion ends (or repeated) returns 0.
- PROM word 0 = factory data, words 1–6 = C1…C6, word 7 = serial code with the CRC-4 (AN520) in its low 4 bits.
- Maths (integer): dT = D2 − C5·2⁸; TEMP = 2000 + dT·C6/2²³; OFF = C2·2¹⁶ + C4·dT/2⁷; SENS = C1·2¹⁵ + C3·dT/2⁸; P = (D1·SENS/2²¹ − OFF)/2¹⁵. Below 20 °C: T2 = dT²/2³¹, OFF2 = 5(TEMP−2000)²/2, SENS2 = 5(TEMP−2000)²/4; below −15 °C add 7(TEMP+1500)² to OFF2 and 11(TEMP+1500)²/2 to SENS2; then subtract. P is in 0.01 mbar, TEMP in 0.01 °C.

## Wiring
- ESP32: VCC → 3V3 (or 5V), GND → GND, SDA → D21, SCL → D22. Leave CSB, SDO, PS unconnected.
- Pico: VCC → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from ms5611 import MS5611
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
sensor = MS5611(i2c)          # resets, reads PROM, checks CRC
p, t = sensor.read()          # mbar, °C
print('P=%.2f mbar T=%.2f C' % (p, t))
```

## Gotchas
- Python integers are unbounded, so the 64-bit intermediate values (OFF, SENS, D1·SENS) are safe; in C use int64_t.
- Skipping the second-order compensation makes readings below 20 °C drift by several mbar.
- The gel-filled port is light-sensitive and picks up drafts: cover it with open-cell foam for altitude work.
- A PROM CRC mismatch nearly always means a loose SDA/SCL wire or a fake chip.

## Datasheet
http://www.hpinfotech.ro/MS5611-01BA03.pdf (MS5611-01BA03 datasheet, MEAS, Oct. 2012)
