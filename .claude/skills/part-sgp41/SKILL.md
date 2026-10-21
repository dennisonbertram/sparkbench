---
name: part-sgp41
description: Pinout, electrical limits, wiring and MicroPython driver for the SGP41 VOC & NOx air quality sensor (Sensirion SGP41). Use when designing, wiring, simulating or writing code for an SGP41 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# SGP41 VOC & NOx air quality sensor (SGP41)

## Overview
The **SGP41** from Sensirion is a metal-oxide (MOx) gas sensor with two heated sensing pixels: one reacts to volatile organic compounds (VOCs), the other to nitrogen oxides (NOx, e.g. NO2 from traffic or gas stoves). It talks I2C and returns two 16-bit raw signals in ticks, **SRAW_VOC** and **SRAW_NOX**, each proportional to the logarithm of its sensing layer's resistance. SRAW_VOC **falls** when VOCs rise; SRAW_NOX **rises** when NOx rises. Sensirion's Gas Index Algorithm runs on the host and turns them into a 1-500 **VOC Index** (100 = the room's 24 h average) and **NOx Index** (1 = normal). Hobbyists buy it on the **Adafruit SGP41 Multi-Pixel Gas Sensor Breakout (PID 6455)**, which has a 3.3 V regulator, level shifting, I2C pull-ups and two STEMMA QT connectors.

## Pinout (Adafruit SGP41 breakout, header order)
| Pin | Function |
|---|---|
| VIN | Supply, 3-5 V (use your board's logic voltage) |
| 3.3V | 3.3 V **output** of the on-board regulator (up to 100 mA); leave unconnected |
| GND | Ground |
| SCL | I2C clock (10 k pull-up) |
| SDA | I2C data (10 k pull-up) |

## Electrical limits
- Chip supply: 1.7-3.6 V (absolute max 3.6 V). The breakout takes 3-5 V on VIN.
- Current at 3.3 V: 6.5 mA typical (7.2 mA max) during conditioning, 4.3 mA typical (4.8 mA max) while measuring, 34 µA idle.
- I2C: standard mode or fast mode, up to 400 kHz. No clock stretching.

## Interface details
- **I2C address 0x59**, which is fixed.
- Commands are 2 bytes and have no CRC. Every data word sent or received is followed by a CRC-8 with polynomial 0x31 and initial value 0xFF (0xBE 0xEF gives 0x92).
- **Conditioning** (required after power-up or heater off): write `0x26 0x12 0x80 0x00 0xA2 0x66 0x66 0x93`, wait 50 ms, read 3 bytes (SRAW_VOC + CRC). Repeat about once a second; 10 s is recommended and **10 s must never be exceeded** (it damages the sensing material).
- **Measure raw signals:** write `0x26 0x19` + RH word + CRC + T word + CRC, wait 50 ms, then read 6 bytes: SRAW_VOC MSB, LSB, CRC, SRAW_NOX MSB, LSB, CRC.
  - RH ticks = RH% × 65535 / 100. T ticks = (T°C + 45) × 65535 / 175.
  - Defaults `0x80 0x00 0xA2 0x66 0x66 0x93` (50 %RH, 25 °C) leave humidity compensation off.
- **Self-test:** write `0x28 0x0E`, wait 320 ms, read 3 bytes. In the low byte, bit 0 = 1 means the VOC pixel failed and bit 1 = 1 means the NOx pixel failed. Don't run it during conditioning.
- **Heater off:** `0x36 0x15` returns the chip to idle. **Serial number:** `0x36 0x82`, wait 1 ms, read 3 words + CRCs.
- Measure once a second without switching the heater off.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.
- Or plug in a STEMMA QT / Qwiic cable.

## Using the driver
```python
from machine import I2C, Pin
import time
from sgp41 import SGP41
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
s = SGP41(i2c)
s.condition(10)            # once after power-up, never more than 10 s
s.measure_raw()            # discard the first reading
while True:
    time.sleep(1)
    voc, nox = s.measure_raw(humidity=45.0, temperature=22.5)  # RH and T from e.g. an SHT40
    print('SRAW_VOC=%d SRAW_NOX=%d' % (voc, nox))
```
To get VOC and NOx Indices, feed both raw values once a second into a port of Sensirion's Gas Index Algorithm (github.com/Sensirion/gas-index-algorithm). This driver does not include it.

## Gotchas
- The raw ticks are **not** ppm or ppb, and they vary from sensor to sensor.
- Skipping conditioning gives a slow, wrong NOx start-up; overdoing it (over 10 s) harms the sensor.
- The VOC signal needs about an hour, and the NOx signal up to several days, to meet specifications. Keep it measuring instead of switching it off and on.
- Humidity changes the raw signals. Pass real RH and temperature from a humidity sensor for compensated readings.
- On a 3.3 V board, power VIN from 3.3 V.
- Never let it get wet or condense. Silicones and high VOC levels shorten its life.

## Datasheet
https://sensirion.com/media/documents/5FE8673C/61E96F50/Sensirion_Gas_Sensors_Datasheet_SGP41.pdf
