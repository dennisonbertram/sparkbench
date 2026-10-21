---
name: part-bmp180
description: Pinout, electrical limits, wiring and MicroPython driver for the BMP180 barometric pressure & temperature sensor (Bosch BMP180, GY-68 module). Use when designing, wiring, simulating or writing code for a BMP180 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# BMP180 barometric pressure sensor (BMP180)

## Overview
The **BMP180** from Bosch Sensortec measures air pressure (300–1100 hPa, ±0.12 hPa relative, about ±1 hPa absolute) and temperature (0.1 °C steps). It talks I2C at a fixed address. Hobbyists buy it on the **GY-68 module**: a small 4-pin board with a 662K 3.3 V regulator and 4.7 kΩ pull-ups on SDA/SCL. It is the successor of the BMP085 and the predecessor of the BMP280 (which is *not* register-compatible).

## Pinout (GY-68 module, header order)
| Pin | Function |
|---|---|
| VIN | Supply 3.3–5 V (regulated to 3.3 V on the board) |
| GND | Ground |
| SCL | I2C clock |
| SDA | I2C data |

## Electrical limits
- Chip supply: 1.8–3.6 V (absolute max 4.25 V). The GY-68's regulator lets VIN take 3.3–5 V.
- Current: about 5 µA at one sample per second (standard mode), 650 µA peak while converting.
- I2C up to 3.4 MHz; the on-board pull-ups go to the module's 3.3 V, so the bus is safe for ESP32/Pico pins.

## Interface details
- **I2C address 0x77** (fixed). Chip id register 0xD0 = **0x55**.
- Calibration: 11 words at 0xAA–0xBF, MSB first: AC1, AC2, AC3 (signed), AC4, AC5, AC6 (unsigned), B1, B2, MB, MC, MD (signed).
- Temperature: write **0x2E** to 0xF4, wait 4.5 ms, read UT = 0xF6 << 8 | 0xF7.
- Pressure: write **0x34 + (oss << 6)** to 0xF4 (oss 0–3), wait 4.5 / 7.5 / 13.5 / 25.5 ms, read UP = (0xF6 << 16 | 0xF7 << 8 | 0xF8) >> (8 − oss).
- Compensation (datasheet figure 4): X1 = (UT − AC6)·AC5 / 2^15, X2 = MC·2^11 / (X1 + MD), B5 = X1 + X2, T = (B5 + 8) / 2^4 in 0.1 °C; pressure then uses B6 = B5 − 4000, B3, B4, B7 and a final correction p + (X1 + X2 + 3791) / 2^4, giving Pa. The driver reproduces the datasheet's worked example (T = 15.0 °C, p = 69964 Pa).
- Altitude: 44330 × (1 − (p / p0)^(1/5.255)) m; 1 hPa ≈ 8.43 m at sea level.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from bmp180 import BMP180
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
sensor = BMP180(i2c)          # oss=3 (ultra high resolution) by default
t, p = sensor.read()          # °C, Pa
print('T=%.1fC P=%.2fhPa' % (t, p / 100))
```

## Gotchas
- `OSError: BMP180 not found (chip id 0x58)` means the board actually carries a BMP280: use a BMP280 driver.
- Measure temperature before every pressure reading (the driver's `read()` does this); the pressure formula needs B5.
- Only one BMP180 per I2C bus (fixed address 0x77).
- Draughts, sunlight and the board's own regulator warm it and make the pressure jump; keep the vent hole clear.
- In the Sparkbench simulator the module's calibration words are simplified so the datasheet formula decodes the sliders; the pressure it reports is within about 0.4 hPa of the slider (smaller than the real chip's ±1 hPa absolute accuracy).

## Datasheet
https://cdn-shop.adafruit.com/datasheets/BST-BMP180-DS000-09.pdf
