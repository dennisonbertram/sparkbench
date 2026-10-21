---
name: part-msa301
description: Pinout, electrical limits, wiring and MicroPython driver for the MSA301 3-axis accelerometer (MEMSensing MSA301, Adafruit #4344 STEMMA QT breakout). Use when designing, wiring, simulating or writing code for an MSA301 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MSA301 3-axis accelerometer (MSA301)

## Overview
The **MSA301** from MEMSensing Microsystems is a small 3-axis accelerometer with selectable ±2/±4/±8/±16 g range, 14-bit output (4096 LSB/g at ±2 g), 1–1000 Hz output data rate, tap/double-tap, activity, orientation and free-fall interrupts. It talks I2C only. Hobbyists buy it on the **Adafruit MSA301 Triple Axis Accelerometer breakout (#4344, STEMMA QT / Qwiic)** with an AP2112K 3.3 V regulator and a BSS138 level shifter.

## Pinout (Adafruit #4344, header order)
| Pin | Function |
|---|---|
| VIN | Supply, 3–5 V (regulated to 3.3 V on the board) |
| 3Vo | 3.3 V regulator output (up to 100 mA), leave unconnected |
| GND | Ground |
| SCL | I2C clock (10 kΩ pull-up to VIN via level shifter) |
| SDA | I2C data (10 kΩ pull-up to VIN via level shifter) |
| INT | Interrupt output, 3.3 V push-pull by default (optional) |

## Electrical limits
- Board supply 3–5 V; chip VDD/VDDIO 1.62–3.6 V (fed 3.3 V by the regulator).
- Current: about 180 µA for the chip in normal mode, plus the power LED (~0.5 mA).
- I2C up to 400 kHz.
- SDA/SCL are pulled up to VIN: feed VIN from 3.3 V with 3.3 V microcontrollers.

## Interface details
- **I2C address 0x26** (fixed). PARTID register 0x01 = **0x13**.
- Powers up in **suspend** mode (0x11 = 0x9E): clear PWR_MODE bits 7:6 to enter normal mode.
- 0x10: X/Y/Z disable bits 7:5, ODR[3:0] (0x07 = 125 Hz). 0x0F: RESOLUTION bits 3:2 (00 = 14-bit), FS bits 1:0 (00 = ±2 g … 11 = ±16 g).
- Data: 6-byte burst from 0x02 (X LSB, X MSB, Y LSB, Y MSB, Z LSB, Z MSB). Combine low byte first as a signed 16-bit value, shift right by 2 → 14-bit counts.
- g = counts / 4096 (±2 g), / 2048 (±4 g), / 1024 (±8 g), / 512 (±16 g).

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.
- Or use a STEMMA QT / Qwiic cable to either JST-SH connector.

## Using the driver
```python
from machine import I2C, Pin
from msa301 import MSA301
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
x, y, z = MSA301(i2c).read()
print('X=%.3f Y=%.3f Z=%.3f g' % (x, y, z))
```

## Gotchas
- Forgetting to leave suspend mode gives readings that never change (all zeros).
- PARTID other than 0x13 means wrong wiring or a different chip (the MSA311 has PARTID 0x13 too but a different address, 0x62).
- Only one MSA301 per I2C bus: the address cannot be changed.
- At rest Z reads about +1 g; zero-g offset can be up to ±80 mg per axis.

## Datasheet
https://github.com/adafruit/Adafruit_MSA301/blob/master/MSA301-V1.0-ENG.PDF
