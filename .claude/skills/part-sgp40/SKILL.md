---
name: part-sgp40
description: Pinout, electrical limits, wiring and MicroPython driver for the SGP40 VOC air quality sensor (Sensirion SGP40). Use when designing, wiring, simulating or writing code for an SGP40 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# SGP40 VOC air quality sensor (SGP40)

## Overview
The **SGP40** from Sensirion is a metal-oxide (MOx) gas sensor with a heated plate that reacts to volatile organic compounds (VOCs) in indoor air. It talks I2C and returns a 16-bit raw signal **SRAW_VOC** in ticks. The signal is proportional to the logarithm of the sensing layer's resistance, and it **falls** when VOCs rise. Sensirion's Gas Index Algorithm runs on the host and turns it into a 1-500 **VOC Index**, where 100 is the room's average over the last 24 h. Hobbyists buy it on the **Adafruit SGP40 STEMMA QT breakout (PID 4829)**, which has a 3.3 V regulator, I2C pull-ups and two STEMMA QT connectors.

## Pinout (Adafruit SGP40 breakout, header order)
| Pin | Function |
|---|---|
| VIN | Supply, 3-5 V (use your board's logic voltage) |
| 3.3V | 3.3 V **output** of the on-board regulator (up to 100 mA); leave unconnected |
| GND | Ground |
| SCL | I2C clock (10 k pull-up to VIN) |
| SDA | I2C data (10 k pull-up to VIN) |

## Electrical limits
- Chip supply: 1.7-3.6 V (absolute max 3.6 V). The breakout takes 3-5 V on VIN.
- Current: 2.6 mA typical (3.0 mA max) while measuring at 3.3 V, and 34 µA idle.
- I2C: standard mode or fast mode, up to 400 kHz.

## Interface details
- **I2C address 0x59**, which is fixed.
- Commands are 2 bytes and have no CRC. Every data word sent or received is followed by a CRC-8 with polynomial 0x31 and initial value 0xFF (0xBE 0xEF gives 0x92).
- **Measure raw signal:** write `0x26 0x0F` + RH word + CRC + T word + CRC, wait 30 ms, then read 3 bytes: SRAW_VOC MSB, LSB, CRC.
  - RH ticks = RH% × 65535 / 100. T ticks = (T°C + 45) × 65535 / 175.
  - Defaults `0x80 0x00 0xA2 0x66 0x66 0x93` (50 %RH, 25 °C) leave humidity compensation off.
- **Self-test:** write `0x28 0x0E`, wait 320 ms, read 3 bytes. 0xD4xx means it passed, 0x4Bxx means it failed.
- **Heater off:** `0x36 0x15` returns the chip to idle.
- Measure about every 1 s; anywhere from 0.5 s to 10 s is allowed.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.
- Or plug in a STEMMA QT / Qwiic cable.

## Using the driver
```python
from machine import I2C, Pin
from sgp40 import SGP40
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
s = SGP40(i2c)
s.measure_raw()                                     # discard the first reading
raw = s.measure_raw(humidity=45.0, temperature=22.5)  # RH and T from e.g. an SHT40
print('SRAW_VOC=%d' % raw)
```
To get a VOC Index, feed `raw` once a second into a port of Sensirion's Gas Index Algorithm (github.com/Sensirion/gas-index-algorithm). This driver does not include it.

## Gotchas
- SRAW_VOC is **not** ppm or ppb. Lower ticks mean more VOCs, and the absolute value varies from sensor to sensor.
- The sensor needs under a minute to start detecting events and about an hour to meet its specifications.
- Humidity changes the raw signal. Pass real RH and temperature from a humidity sensor for compensated readings.
- On a 3.3 V board, power VIN from 3.3 V, because the pull-ups go to VIN.
- Never let it get wet or condense (above 90 %RH). Silicones and high VOC levels shorten its life.

## Datasheet
https://sensirion.com/media/documents/296373BB/6203C5DF/Sensirion_Gas_Sensors_Datasheet_SGP40.pdf
