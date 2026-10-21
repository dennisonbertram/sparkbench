---
name: part-sgp30
description: Pinout, electrical limits, wiring and MicroPython driver for the SGP30 air quality (TVOC/eCO2) sensor (Sensirion SGP30). Use when designing, wiring, simulating or writing code for an SGP30 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# SGP30 air quality sensor (SGP30)

## Overview
The **SGP30** from Sensirion is a metal-oxide gas sensor with several sensing pixels on one chip. It reports **TVOC** (total volatile organic compounds, 0–60000 ppb) and **eCO2** (a CO2 *equivalent* estimated from hydrogen, 400–60000 ppm; it is not a true CO2 sensor). It talks I2C. Hobbyists buy it on the **Adafruit SGP30 Air Quality Sensor Breakout (PID 3709)**, which adds a 1.8 V regulator and I2C level shifting so it runs from 3–5 V.

## Pinout (Adafruit SGP30 breakout, header order)
| Pin | Function |
|---|---|
| VIN | Supply, 3–5 V (match your board's logic level) |
| 1V8 | 1.8 V output of the on-board regulator (up to 50 mA); leave unconnected |
| GND | Ground |
| SCL | I2C clock (3–5 V logic, 10 k pull-up to VIN) |
| SDA | I2C data (3–5 V logic, 10 k pull-up to VIN) |

The same four signals are also on the STEMMA QT connectors.

## Electrical limits
- Chip supply: 1.62–1.98 V (absolute max 2.16 V). **Never feed the bare chip 3.3 V**; the breakout's regulator handles this.
- Breakout supply: 3–5 V on VIN.
- Current: about 49 mA while measuring (hotplate heater), 2 µA in sleep.
- I2C up to 400 kHz.

## Interface details
- **I2C address 0x58** (fixed).
- Commands are 16-bit, sent MSB first. Every 16-bit word read back is followed by a CRC-8 (poly 0x31, init 0xFF; 0xBEEF → 0x92). Data words *written* to the chip must carry that CRC too.
- `sgp30_iaq_init` **0x2003** (max 10 ms): start air-quality mode after every power-up or reset.
- `sgp30_measure_iaq` **0x2008** (max 12 ms): read 6 bytes, eCO2 (ppm) word + CRC, TVOC (ppb) word + CRC. Values are the raw words, no scaling.
- Call measure_iaq **once per second**; the on-chip baseline compensation depends on it.
- For the first **15 s** after init the chip returns fixed 400 ppm / 0 ppb.
- `sgp30_get_feature_set` 0x202F → product type (top 4 bits, 0 = SGP30) and version (e.g. 0x0022).
- Baseline: `get_iaq_baseline` 0x2015 (returns eCO2, TVOC), `set_iaq_baseline` 0x201E (send TVOC then eCO2, each with CRC, right after init).
- Humidity compensation: `set_absolute_humidity` 0x2061 with g/m³ as 8.8 fixed point (0x0F80 = 15.5 g/m³); 0 turns it off.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
import time
from sgp30 import SGP30
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
sensor = SGP30(i2c)          # checks the feature set and sends iaq_init
while True:
    co2, tvoc = sensor.measure()
    print('eCO2=%dppm TVOC=%dppb' % (co2, tvoc))
    time.sleep(1)
```
With a temperature/humidity sensor nearby, call `sensor.set_humidity(t, rh)` now and then for better accuracy.

## Gotchas
- 400 ppm / 0 ppb for the first 15 s is the warm-up, not a fault.
- Values are relative to a self-learned baseline. Give a new sensor about 12 h in clean air, then save `get_baseline()` every hour and restore it with `set_baseline()` after each restart.
- The heater draws ~49 mA; power from the 3V3/5V rail, not a GPIO.
- A CRC mismatch nearly always means a loose SDA/SCL wire.
- eCO2 is an estimate from hydrogen, not a real CO2 measurement; use an SCD40 for true CO2.

## Datasheet
https://sensirion.com/media/documents/984E0DD5/61644B8B/Sensirion_Gas_Sensors_Datasheet_SGP30.pdf
