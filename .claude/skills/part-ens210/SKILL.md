---
name: part-ens210
description: Pinout, electrical limits, wiring and MicroPython driver for the ENS210 temperature & humidity sensor (ScioSense/ams ENS210, Elektor ENS210 BOB). Use when designing, wiring, simulating or writing code for an ENS210 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# ENS210 temperature & humidity sensor (ENS210)

## Overview
The **ENS210** from ScioSense (formerly ams) measures temperature (−40 to 100 °C, ±0.15 °C typical from 0 to 70 °C) and relative humidity (0–100 %, ±2 %RH typical). It talks I2C and protects every reading with a valid flag and a CRC-7. The chip is a tiny 2 × 2 mm QFN, so hobbyists buy it on a breakout such as the **Elektor ENS210 humidity/temperature sensor BOB** (PCB 180306-1): a 4-pin 0.1" header, no regulator, and **no I2C pull-ups fitted** (pads R1/R2 are left empty).

## Pinout (Elektor ENS210 BOB, header order as printed)
| Pin | Function |
|---|---|
| 3V3 | Supply, 1.71–3.6 V (use 3.3 V, never 5 V) |
| SCL | I2C clock (add 4.7 kΩ pull-up to 3.3 V) |
| SDA | I2C data (add 4.7 kΩ pull-up to 3.3 V) |
| GND | Ground |

## Electrical limits
- Supply: 1.71–3.6 V (absolute max 4.6 V). No regulator on the board: **do not connect 5 V**, and pull SDA/SCL up to 3.3 V, not 5 V.
- Current: about 61 µA in continuous mode, 7 µA at one T+RH reading per second, 0.5 µA standby (at 3.3 V).
- I2C: 100 / 400 kHz.

## Interface details
- **I2C address 0x43**, fixed.
- Registers: PART_ID 0x00 (0x0210, readable only while active), SYS_CTRL 0x10 (bit 7 RESET, bit 0 LOW_POWER), SYS_STAT 0x11, SENS_RUN 0x21, SENS_START 0x22, SENS_STOP 0x23, T_VAL 0x30–0x32, H_VAL 0x33–0x35.
- Single-shot T+RH: write **0x03 to SENS_START**, wait **≥ 130 ms**, read 6 bytes from 0x30.
- Each 3-byte value is little endian: bits 15:0 data, bit 16 VALID, bits 23:17 CRC-7 (polynomial x⁷+x³+1 = 0x89, initial vector 0x7F) over the 17-bit payload. Datasheet example: FD 49 0B → CRC 0x05, 22.8 °C.
- Temperature: T = data / 64 − 273.15 °C (data is in 1/64 K). Humidity: RH = data / 512 %.

## Wiring
- ESP32: 3V3 → 3V3, GND → GND, SDA → D21, SCL → D22, 4.7 kΩ from SDA and from SCL to 3V3.
- Pico: 3V3 → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5, 4.7 kΩ pull-ups to 3V3.
- Raspberry Pi 4: 3V3 → pin 1, GND → pin 6, SDA → pin 3, SCL → pin 5 (the Pi has its own 1.8 kΩ pull-ups).

## Using the driver
```python
from machine import I2C, Pin
from ens210 import ENS210
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
sensor = ENS210(i2c)
t, h = sensor.read()
print('T=%.1fC H=%.1f%%' % (t, h))
```
`sensor.part_id()` returns 0x0210 on a genuine ENS210 (it switches low power off briefly, as the datasheet requires).

## Gotchas
- 5 V on 3V3 or 5 V pull-ups can destroy the chip.
- Without pull-ups the bus does not work (the ESP32's internal pull-ups are too weak to rely on).
- A CRC error usually means a loose SDA/SCL wire; VALID = 0 means you read before the 130 ms conversion finished.
- Keep the sensor away from the regulator and microcontroller, which warm the air nearby. Long exposure outside 5–60 °C / 20–80 %RH can temporarily offset the humidity reading.

## Datasheet
https://www.sciosense.com/wp-content/uploads/2023/12/ENS210-Datasheet.pdf
