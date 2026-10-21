---
name: part-si7021
description: Pinout, electrical limits, wiring and MicroPython driver for the Si7021 temperature & humidity sensor (Silicon Labs Si7021-A20, GY-21 module). Use when designing, wiring, simulating or writing code for an Si7021 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Si7021 temperature & humidity sensor (SI7021)

## Overview
The **Si7021-A20** from Silicon Labs measures relative humidity (0–100 %, ±3 % typical) and temperature (−40 to 125 °C, ±0.4 °C typical). It talks I2C at a fixed address. Hobbyists buy it on the **GY-21 Si7021 module**, which adds a 3.3 V regulator, MOSFET level shifters and pull-ups on SDA/SCL, so it works with 3.3 V and 5 V boards.

## Pinout (GY-21 module, header order)
| Pin | Function |
|---|---|
| VIN | Module supply, 3.3–5 V (regulated to 3.3 V for the chip) |
| GND | Ground |
| SCL | I2C clock |
| SDA | I2C data |

## Electrical limits
- Chip supply: 1.9–3.6 V. Never feed a bare Si7021 5 V; the GY-21's regulator makes VIN 3.3–5 V safe.
- Current: 150 µA during an RH conversion, 90 µA during temperature, 0.06 µA standby (3.5 mA peaks at power-up).
- I2C up to 400 kHz.

## Interface details
- **I2C address 0x40**, fixed.
- Power-up: up to 25 ms at 25 °C (80 ms over full temperature). Reset: write **0xFE**, wait 15 ms.
- No-hold measurement: write **0xF5** (humidity) or **0xF3** (temperature), then read 3 bytes: MSB, LSB, CRC. Until the conversion finishes the chip NACKs its address. Hold-master variants are 0xE5 / 0xE3 (clock stretching).
- Conversion times (max): 12-bit RH 12 ms, 14-bit T 10.8 ms. An RH measurement also measures temperature, so it takes up to 22.8 ms in total.
- **0xE0** reads the temperature from the previous RH measurement: 2 bytes, no checksum.
- CRC-8 over the two data bytes: polynomial x⁸+x⁵+x⁴+1 (0x31), initial value **0x00**.
- Temperature: T = 175.72 × Temp_Code / 65536 − 46.85 °C. Humidity: RH = 125 × RH_Code / 65536 − 6 %. Codes are the 16-bit word as returned (temperature LSB always ends in 00, humidity in 10).

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from si7021 import SI7021
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
t, h = SI7021(i2c).read()
print('T=%.1fC H=%.1f%%' % (t, h))
```

## Gotchas
- 0x40 is also the default address of the HTU21D, SHT21 and INA219: only one of them per bus without a multiplexer.
- GY-21 boards are sold with an Si7021, HTU21D or SHT21 fitted; the HTU21D/SHT21 use the same commands and formulas, but check the chip marking.
- A CRC mismatch nearly always means a loose SDA/SCL wire.
- RH can read slightly below 0 % or above 100 %; the datasheet says to clamp it to 0–100 %, which the driver does.
- Keep it away from the regulator and the microcontroller, which warm the air nearby.

## Datasheet
https://cdn-learn.adafruit.com/assets/assets/000/035/931/original/Support_Documents_TechnicalDocs_Si7021-A20.pdf
