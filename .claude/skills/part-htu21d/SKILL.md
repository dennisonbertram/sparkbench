---
name: part-htu21d
description: Pinout, electrical limits, wiring and MicroPython driver for the HTU21D temperature & humidity sensor (TE/MEAS HTU21D(F), GY-21 module). Use when designing, wiring, simulating or writing code for an HTU21D in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# HTU21D temperature & humidity sensor (HTU21D)

## Overview
The **HTU21D(F)** from TE Connectivity (Measurement Specialties) measures relative humidity (0–100 %, ±2 % typical) and temperature (−40 to 125 °C, ±0.3 °C typical). It talks I2C at a fixed address. Hobbyists buy it on the **GY-21 HTU21D module**, which adds a 3.3 V regulator, MOSFET level shifters and pull-ups on SDA/SCL, so it works with 3.3 V and 5 V boards.

## Pinout (GY-21 module, header order)
| Pin | Function |
|---|---|
| VIN | Module supply, 3.3–5 V (regulated to 3.3 V for the chip) |
| GND | Ground |
| SCL | I2C clock |
| SDA | I2C data |

## Electrical limits
- Chip supply: 1.5–3.6 V (absolute max 3.8 V peak). Never feed a bare HTU21D 5 V; the GY-21's regulator makes VIN 3.3–5 V safe.
- Current: about 0.45 mA while measuring, 0.02–0.14 µA asleep.
- I2C up to 400 kHz.

## Interface details
- **I2C address 0x40**, fixed.
- Soft reset: write **0xFE**, wait 15 ms (also wait 15 ms after power-up).
- No-hold measurement: write **0xF3** (temperature, wait ≥ 50 ms at 14 bit) or **0xF5** (humidity, wait ≥ 16 ms at 12 bit), then read 3 bytes: MSB, LSB, CRC. Until the conversion finishes the chip NACKs its address. Hold-master variants are 0xE3 / 0xE5 (clock stretching).
- The two low bits of the LSB are status: bit 1 = 0 for temperature, 1 for humidity. **Clear them** (`raw & 0xFFFC`) before converting.
- CRC-8 over the two data bytes: polynomial 0x31 (x⁸+x⁵+x⁴+1), initial value **0x00** (datasheet examples: 0xDC → 0x79, 0x683A → 0x7C).
- Temperature: T = −46.85 + 175.72 × S / 65536 °C. Humidity: RH = −6 + 125 × S / 65536 %.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from htu21d import HTU21D
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
t, h = HTU21D(i2c).read()
print('T=%.1fC H=%.1f%%' % (t, h))
```

## Gotchas
- 0x40 is also the default address of the INA219, Si7021 and SHT21: only one of them per bus without a multiplexer.
- A CRC mismatch nearly always means a loose SDA/SCL wire.
- RH can read slightly below 0 % or above 100 % (the chip outputs −6 to 118 %); clamp if you display it.
- Keep it away from the regulator and the microcontroller, which warm the air nearby.

## Datasheet
https://cdn-shop.adafruit.com/datasheets/1899_HTU21D.pdf
