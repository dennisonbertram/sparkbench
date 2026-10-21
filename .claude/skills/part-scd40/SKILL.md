---
name: part-scd40
description: Pinout, electrical limits, wiring and MicroPython driver for the SCD40 CO2 sensor (Sensirion SCD4x, also SCD41). Use when designing, wiring, simulating or writing code for an SCD40 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# SCD40 CO2 sensor (SCD40)

## Overview
The **SCD40** from Sensirion is a true (photoacoustic NDIR) CO2 sensor: it outputs 0–40000 ppm, accurate to ±(50 ppm + 5 %) from 400–2000 ppm, and also reports temperature and relative humidity. It talks I2C and gives a new reading every 5 seconds. Hobbyists buy it on the **Adafruit SCD-40 STEMMA QT breakout (PID 5187)**, which has a 3.3 V regulator and 10 k pull-ups on SDA/SCL. The SCD-41 board (PID 5190) has the same pins and also supports single-shot mode.

## Pinout (Adafruit SCD-40 breakout, header order)
| Pin | Function |
|---|---|
| VIN | Supply, 3–5 V (use your board's logic voltage) |
| 3Vo | 3.3 V regulator output, up to 100 mA (leave unconnected) |
| GND | Ground |
| SCL | I2C clock |
| SDA | I2C data |

## Electrical limits
- Supply: chip 2.4–5.5 V; the breakout is specified for 3–5 V on VIN.
- Current: about 15 mA average (3.3 V, periodic mode), **peaks of 175–205 mA** during each measurement pulse. Supply ripple must stay under 30 mV.
- I2C up to 100 kHz standard / 400 kHz fast mode.

## Interface details
- **I2C address 0x62** (fixed).
- Commands are 16-bit, sent MSB first. Every word the sensor returns is followed by a CRC-8 (poly 0x31, init 0xFF; datasheet example 0x8000 → 0xA2).
- `stop_periodic_measurement` **0x3F86** (sensor ignores commands for 500 ms), `start_periodic_measurement` **0x21B1** (new reading every 5 s).
- `get_data_ready_status` **0xE4B8**: wait 1 ms, read 3 bytes; data is ready when the low 11 bits of the word are not 0.
- `read_measurement` **0xEC05**: wait 1 ms, read 9 bytes: CO2 word + CRC, T word + CRC, RH word + CRC.
- CO2 [ppm] = word0. T = −45 + 175 × word1 / 65535 °C. RH = 100 × word2 / 65535 %.
- Reading when no data is ready makes the sensor NACK, so always check data-ready first.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from scd40 import SCD40
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
sensor = SCD40(i2c)          # stops any old measurement, starts periodic mode
co2, t, h = sensor.read()    # waits for the next 5-second reading
print('CO2=%dppm T=%.1fC H=%.0f%%' % (co2, t, h))
```

## Gotchas
- The first reading takes 5 s after starting; `read()` waits for it.
- Automatic self-calibration assumes the sensor sees fresh outdoor air (~400 ppm) at least once a week; indoors-only sensors drift.
- The measurement pulses draw ~200 mA: a weak or noisy supply gives wrong CO2 values.
- A CRC mismatch nearly always means a loose SDA/SCL wire.
- The sensor's temperature reads a little high from self-heating; it can be corrected with set_temperature_offset (0x241D).

## Datasheet
https://sensirion.com/media/documents/48C4B7FB/64C134E7/Sensirion_SCD4x_Datasheet.pdf
