---
name: part-sht21
description: Pinout, electrical limits, wiring and MicroPython driver for the SHT21 temperature & humidity sensor (Sensirion SHT21, ACROBOTIC SHT21 breakout BRK-00055). Use when designing, wiring, simulating or writing code for an SHT21 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# SHT21 temperature & humidity sensor (SHT21)

## Overview
The **SHT21** from Sensirion measures relative humidity (0–100 %, ±2 % typical) and temperature (−40 to 125 °C, ±0.3 °C typical). It talks I2C at a fixed address. Modelled here on the **ACROBOTIC SHT21 Digital Temperature and Humidity Sensor Breakout Board (BRK-00055)**: a small blue board with I2C pull-ups and a 4-pin header, but **no regulator or level shifting**.

## Pinout (ACROBOTIC BRK-00055, header order)
| Pin | Function |
|---|---|
| Vdd | Supply, 2.1–3.6 V (3.0 V recommended) |
| Vss | Ground |
| SDA | I2C data (pull-up on the board) |
| SCL | I2C clock (pull-up on the board) |

## Electrical limits
- Supply: 2.1–3.6 V; absolute max 5 V on VDD, I/O max VDD + 0.3 V. **Do not power it from 5 V** and do not drive it from 5 V logic.
- Current: 200–330 µA while measuring, 0.15 µA asleep.
- I2C up to 400 kHz (fast mode).

## Interface details
- **I2C address 0x40**, fixed.
- Soft reset: write **0xFE**, wait 15 ms (also wait 15 ms after power-up).
- No-hold measurement: write **0xF3** (temperature, wait 85 ms at 14 bit) or **0xF5** (humidity, wait 29 ms at 12 bit), then read 3 bytes: MSB, LSB, CRC. Until the conversion finishes the chip NACKs its read address. Hold-master variants are 0xE3 / 0xE5 (clock stretching for up to 85 ms, longer than MicroPython's default I2C timeout).
- The two low bits of the LSB are status: bit 1 = 0 for temperature, 1 for humidity. **Clear them** (`raw & 0xFFFC`) before converting.
- CRC-8 over the two data bytes: polynomial 0x31 (x⁸+x⁵+x⁴+1), initial value **0x00**.
- Temperature: T = −46.85 + 175.72 × S / 65536 °C. Humidity: RH = −6 + 125 × S / 65536 % (datasheet example S = 25424 → 42.5 %RH).
- User register (read 0xE7 / write 0xE6) sets resolution and the heater; keep reserved bits as read.

## Wiring
- ESP32: Vdd → 3V3, Vss → GND, SDA → D21, SCL → D22.
- Pico: Vdd → 3V3(OUT), Vss → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: Vdd → pin 1 (3.3 V), Vss → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from sht21 import SHT21
i2c = I2C(0, sda=Pin(21), scl=Pin(22), freq=100000)
t, h = SHT21(i2c).read()
print('T=%.1fC H=%.1f%%' % (t, h))
```

## Gotchas
- Datasheet section 5.8: in no-hold mode an SCL rising edge 15–18.5 µs after the command ACK can corrupt calibration until the next reset. A normal `writeto()` at 100–400 kHz sends its STOP well before that window; don't run the bus very slowly (e.g. 10 kHz SoftI2C).
- 0x40 is also the default address of the HTU21D, Si7021 and INA219: only one per bus without a multiplexer.
- A CRC mismatch nearly always means a loose SDA/SCL wire.
- RH can read slightly below 0 % or above 100 % (the formula spans −6 to 119 %); clamp if you display it.
- Keep it away from the regulator and the microcontroller, which warm the air nearby.

## Datasheet
https://sensirion.com/media/documents/120BBE4C/63500094/Sensirion_Datasheet_Humidity_Sensor_SHT21.pdf
