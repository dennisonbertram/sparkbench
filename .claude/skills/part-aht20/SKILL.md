---
name: part-aht20
description: Pinout, electrical limits, wiring and MicroPython driver for the AHT20 temperature & humidity sensor (Aosong/ASAIR AHT20). Use when designing, wiring, simulating or writing code for an AHT20 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# AHT20 temperature & humidity sensor (AHT20)

## Overview
The **AHT20** from Aosong (ASAIR) measures temperature (−40 to 85 °C, ±0.3 °C typical) and relative humidity (0–100 %, ±2 % typical) and talks I2C. Each reading is 20 bits and ends with a CRC byte. Hobbyists buy it on a small **4-pin breakout** (VIN, GND, SCL, SDA) with 10 kΩ pull-ups on SDA/SCL.

## Pinout (AHT20 breakout, header order)
| Pin | Function |
|---|---|
| VIN | Supply, 2.7–5.5 V (use your board's logic voltage, 3.3 V on ESP32/Pico) |
| GND | Ground |
| SCL | I2C clock (10 kΩ pull-up to VIN) |
| SDA | I2C data (10 kΩ pull-up to VIN) |

Some boards (e.g. DFRobot Fermion) print VCC instead of VIN, and others put the pins in a different order. Check the silkscreen.

## Electrical limits
- Supply: 2.7–5.5 V on the breakout (Adafruit). Some vendors quote 2–5 V for their boards.
- Current: about 1 mA while measuring, under 1 µA asleep.
- SDA/SCL are pulled up to VIN, so power VIN from 3.3 V when using a 3.3 V microcontroller.

## Interface details
- **I2C address 0x38**, fixed (one AHT20 per bus).
- After power-on wait ≥ 100 ms. Read one byte = status: bit 7 busy, bit 3 calibrated. If bit 3 is clear, send **0xBE 0x08 0x00** and wait 10 ms.
- Measure: write **0xAC 0x33 0x00**, wait 80 ms, poll the status until bit 7 clears, then read 7 bytes: status, then 20-bit humidity (bytes 1, 2, high nibble of 3), 20-bit temperature (low nibble of 3, bytes 4, 5), CRC.
- CRC-8 over the first 6 bytes: polynomial 0x31, initial value 0xFF.
- Humidity: RH = raw / 2^20 × 100 %. Temperature: T = raw / 2^20 × 200 − 50 °C.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from aht20 import AHT20
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
t, h = AHT20(i2c).read()
print('T=%.1fC H=%.0f%%' % (t, h))
```

## Gotchas
- A CRC mismatch nearly always means a loose SDA/SCL wire.
- The address can't be changed. A second sensor needs a second I2C bus or a multiplexer.
- Keep it away from the regulator and the microcontroller, which warm the air nearby.
- Don't read faster than about once every 2 s if you want it to stay accurate, because the sensor heats itself.

## Datasheet
http://www.aosong.com/userfiles/files/media/Data%20Sheet%20AHT20.pdf
