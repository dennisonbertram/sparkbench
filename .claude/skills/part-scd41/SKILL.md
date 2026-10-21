---
name: part-scd41
description: Pinout, electrical limits, wiring and MicroPython driver for the SCD41 CO2 sensor (Sensirion SCD41, Adafruit SCD-41 breakout, single shot mode). Use when designing, wiring, simulating or writing code for an SCD41 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# SCD41 CO2 sensor (SCD41)

## Overview
The **SCD41** from Sensirion is a true (photoacoustic NDIR) CO2 sensor with temperature and relative humidity. It is the high-accuracy member of the SCD4x family: specified 400–5000 ppm, ±(50 ppm + 2.5 %) from 400–1000 ppm, output 0–40000 ppm. Unlike the SCD40 it has an on-demand **single shot mode** (one reading in 5 s, about 0.5 mA average at one reading every 5 minutes), good for battery projects. Hobbyists buy it on the **Adafruit SCD-41 STEMMA QT breakout (PID 5190)**, which has a 3.3 V regulator and 10 k pull-ups on SDA/SCL.

## Pinout (Adafruit SCD-41 breakout, header order)
| Pin | Function |
|---|---|
| VIN | Supply, 3–5 V (use your board's logic voltage) |
| 3Vo | 3.3 V regulator output, up to 100 mA (leave unconnected) |
| GND | Ground |
| SCL | I2C clock (10 k pull-up on board) |
| SDA | I2C data (10 k pull-up on board) |

## Electrical limits
- Supply: chip 2.4–5.5 V; the breakout is specified for 3–5 V on VIN.
- Current: 15 mA average in periodic mode at 3.3 V, 0.45 mA average with one single shot every 5 min, **peaks of 175–205 mA** during each measurement. Supply ripple must stay under 30 mV.
- I2C up to 400 kHz.

## Interface details
- **I2C address 0x62** (fixed). Commands are 16-bit, MSB first. Every word returned is followed by a CRC-8 (poly 0x31, init 0xFF; 0xBEEF → 0x92).
- `stop_periodic_measurement` **0x3F86** (500 ms) puts the sensor in idle mode.
- `measure_single_shot` **0x219D**: wait **5000 ms**, then read. `measure_single_shot_rht_only` **0x2196**: 50 ms, CO2 reads 0.
- `get_data_ready_status` **0xE4B8**: ready when the low 11 bits of the word are not 0.
- `read_measurement` **0xEC05**: wait 1 ms, read 9 bytes: CO2 word + CRC, T word + CRC, RH word + CRC.
- CO2 [ppm] = word0. T = −45 + 175 × word1 / 65535 °C. RH = 100 × word2 / 65535 %.
- `power_down` **0x36E0** / `wake_up` **0x36F6** (wake_up is not acknowledged; wait 30 ms).
- Periodic mode (`start_periodic_measurement` 0x21B1, 5 s interval) works as on the SCD40.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from scd41 import SCD41
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
sensor = SCD41(i2c)          # stops any running periodic measurement
co2, t, h = sensor.read()    # single shot: ~5 s (~10 s the first time)
print('CO2=%dppm T=%.1fC H=%.0f%%' % (co2, t, h))
```

## Gotchas
- After power-up or wake_up the first single shot reading should be discarded; `read()` does this, so the first call takes about 10 s.
- Only the SCD41 (and SCD43) have single shot mode; an SCD40 ignores 0x219D.
- Reading 0xEC05 with no data ready makes the sensor NACK.
- Automatic self-calibration in single shot mode is tuned for one reading every 5 min and needs fresh outdoor air (~400 ppm) regularly; it is not available if you power-cycle the sensor between readings.
- The ~200 mA measurement pulses need a solid supply; a CRC mismatch usually means a loose SDA/SCL wire.

## Datasheet
https://sensirion.com/media/documents/48C4B7FB/64C134E7/Sensirion_SCD4x_Datasheet.pdf
