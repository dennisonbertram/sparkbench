---
name: part-shtc3
description: Pinout, electrical limits, wiring and MicroPython driver for the SHTC3 temperature & humidity sensor (Sensirion SHTC3). Use when designing, wiring, simulating or writing code for an SHTC3 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# SHTC3 temperature & humidity sensor (SHTC3)

## Overview
The **SHTC3** from Sensirion measures temperature (−40 to 125 °C, ±0.2 °C typical) and relative humidity (0–100 %, ±2 % typical). It talks I2C at a fixed address. Hobbyists buy it on the **Adafruit SHTC3 STEMMA QT / Qwiic breakout (#4636)**, which adds a 3.3 V regulator, level shifting and 10 kΩ pull-ups on SDA/SCL.

## Pinout (Adafruit #4636, header order)
| Pin | Function |
|---|---|
| VIN | Supply, 3–5 V (on-board 3.3 V regulator) |
| 3Vo | 3.3 V regulator output (up to 100 mA), leave unconnected |
| GND | Ground |
| SCL | I2C clock |
| SDA | I2C data |

## Electrical limits
- Chip supply: 1.62–3.6 V (absolute max 4 V); the breakout's VIN takes 3–5 V.
- Current: about 430 µA average while measuring, 0.3 µA in sleep.
- I2C up to 1 MHz.

## Interface details
- **I2C address 0x70** (fixed).
- Measurement cycle: wake-up **0x35 0x17** (wait ≥ 240 µs), measure **0x78 0x66** (normal mode, T first, no clock stretching), wait ≥ 12.1 ms, read 6 bytes (T MSB, T LSB, CRC, RH MSB, RH LSB, CRC), then sleep **0xB0 0x98**.
- Soft reset 0x80 0x5D; read ID 0xEF 0xC8 → 16-bit ID + CRC, `(id & 0x083F) == 0x0807` for an SHTC3.
- CRC-8: polynomial 0x31, initial value 0xFF (datasheet example: 0xBEEF → 0x92).
- Temperature: T = −45 + 175 × raw / 65536 °C. Humidity: RH = 100 × raw / 65536 %.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from shtc3 import SHTC3
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
t, h = SHTC3(i2c).read()
print('T=%.1fC H=%.0f%%' % (t, h))
```

## Gotchas
- In sleep mode the chip only answers the wake-up command; the driver wakes it before every command and puts it back to sleep after.
- Reading too early (before 12.1 ms) is NACKed when clock stretching is off.
- A CRC mismatch nearly always means a loose SDA/SCL wire.
- Fixed address 0x70: one SHTC3 per bus (use a multiplexer for more).
- Leave 3Vo unconnected; it is an output.
- Keep it away from the regulator and the microcontroller, which warm the air nearby.

## Datasheet
https://sensirion.com/media/documents/643F9C8E/63A5A436/Datasheet_SHTC3.pdf
