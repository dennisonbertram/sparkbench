---
name: part-pmsa003i
description: Pinout, electrical limits, wiring and MicroPython driver for the Plantower PMSA003I I2C laser particulate (PM1.0 / PM2.5 / PM10) sensor on the Adafruit PMSA003I Air Quality Breakout (product 4632). Use when designing, wiring, simulating or writing code for a PMSA003I in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# PMSA003I particulate matter sensor, I2C (PMSA003I)

## Overview
The **Plantower PMSA003I** is the I2C version of the PMSA003: a fan blows air past a laser and the sensor counts the light flashes from dust, smoke and pollen. It reports PM1.0, PM2.5 and PM10 mass concentration (µg/m³, 0–500 effective range, ≥1000 maximum, 1 µg/m³ resolution) and particle counts per 0.1 L. The frame updates about once per second. Hobbyists buy it on the **Adafruit PMSA003I Air Quality Breakout (product 4632)**, which has a 5 V charge pump (AP3602) for the fan, a 3.3 V regulator (AP2112K) and BSS138 I2C level shifters. That means it runs from 3–5 V.

## Pinout (Adafruit 4632, 7-pin header, header order)
| Pin | Function |
|---|---|
| VIN | Supply 3–5 V. Use your logic voltage (3.3 V on ESP32/Pico) because the I2C pull-ups go to VIN |
| 3Vo | 3.3 V regulator output (leave unconnected) |
| GND | Ground |
| SCL | I2C clock, level shifted, 10 kΩ pull-up to VIN |
| SDA | I2C data, level shifted, 10 kΩ pull-up to VIN |
| RST | Sensor reset, low = reset (diode-isolated, pulled up; optional) |
| SET | Low = sleep, open/high = run (diode-isolated, pulled up; optional) |

The board also has two STEMMA QT / Qwiic connectors that carry the same VIN/GND/SDA/SCL.

## Electrical limits
- Sensor module: 4.5–5.5 V, ≤100 mA active, ≤200 µA standby. The breakout's charge pump makes this 5 V from VIN = 3–5 V, so from 3.3 V expect around 200 mA input current.
- Sensor logic: 3.3 V (L < 0.8 V, H > 2.7 V). The breakout level-shifts I2C to VIN.
- Operating: −10 to +60 °C, 0–99 % RH (non-condensing).

## Interface details
- **I2C address 0x12** (fixed), 100 kHz standard mode, EEPROM-style register reads.
- Registers 0x00–0x1F hold one 32-byte frame: `0x42 0x4D`, frame length (= 28), then 13 big-endian 16-bit words:
  1–3 PM1.0 / PM2.5 / PM10 CF=1 (factory), 4–6 PM1.0 / PM2.5 / PM10 atmospheric environment (use these),
  7–12 particle counts > 0.3 / 0.5 / 1.0 / 2.5 / 5.0 / 10 µm per 0.1 L, 13 version (high byte) and error code (low byte),
  then the check code (0x1E–0x1F) = 16-bit sum of bytes 0x00–0x1D.
- Read: write register 0x00, then read 32 bytes (`i2c.readfrom_mem(0x12, 0x00, 32)`).

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from pmsa003i import PMSA003I
i2c = I2C(0, sda=Pin(21), scl=Pin(22), freq=100000)
r = PMSA003I(i2c).read()
print('PM1=%d PM2.5=%d PM10=%d ug/m3' % (r['pm1_0'], r['pm2_5'], r['pm10']))
```
`read()` checks the header, the frame length and the sum. It returns a dict with the CF=1 and atmospheric PM values, the six particle counts, the version and the error code. On a bad frame it raises ValueError.

## Gotchas
- Powering VIN from 5 V pulls SDA/SCL up to 5 V, which is too much for an ESP32 or Pico. Power it from 3.3 V; the fan still gets 5 V from the charge pump.
- Right after power-up the sensor may not answer or may return an invalid frame. Retry, and wait ~30 s before you trust the numbers.
- Keep the bus at 100 kHz. The sensor is specified for standard mode only.
- The metal case is grounded, so keep it away from other circuitry. Keep the inlet and outlet clear, and keep it out of an air purifier's airflow.
- CF=1 values read higher than atmospheric values at high concentrations. For air-quality indexes, use the atmospheric ones.

## Datasheet
https://cdn-shop.adafruit.com/product-files/4632/4505_PMSA003I_series_data_manual_English_V2.6.pdf
