---
name: part-m5stack-unit-ultrasonic-i2c
description: Pinout, electrical limits, wiring and MicroPython driver for the M5Stack Unit Ultrasonic-I2C distance sensor (SKU U098-B1, RCWL-9620 ultrasonic ranging chip, I2C 0x57). Use when designing, wiring, simulating or writing code for this unit in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# M5Stack Unit Ultrasonic-I2C (RCWL-9620)

## Overview
The **M5Stack Unit Ultrasonic-I2C** (SKU U098-B1) measures distance with a 16 mm ultrasonic probe pair and the **RCWL-9620** ranging chip, which does the timing itself and reports the result over I2C. Range 2–450 cm, ±2 %, 1 mm resolution, 50 ms measurement cycle, about 3 mA. It has a 4-pin HY2.0-4P (Grove-style) socket and ships with a 20 cm Grove cable. (The look-alike Unit Ultrasonic-IO, U098-B2, uses TRIG/ECHO pins instead and does not use this driver.)

## Pinout (HY2.0-4P socket, pin order)
| Pin | Wire | Function |
|---|---|---|
| GND | black | Ground |
| 5V | red | Supply, straight to the RCWL-9620 (2.8–5.5 V) |
| SDA | yellow | I2C data, open-drain |
| SCL | white | I2C clock, open-drain |

## Electrical limits
- RCWL-9620 supply: 2.8–5.5 V; 3 mA typical, 3.5 mA max at 5 V. M5Stack controllers feed it 5 V.
- The chip's reference circuit has no SDA/SCL pull-ups: the host provides them (M5Stack controllers have them; elsewhere add 4.7 kΩ to the supply, which Sparkbench does for you).
- On an ESP32 / Pico / Raspberry Pi, power the unit from **3.3 V** so the bus and the chip both sit at 3.3 V.

## Interface details
- **I2C address 0x57** (fixed).
- Write the single byte **0x01** to start a measurement.
- Wait **at least 100 ms** (the chip's longest measurement time; M5Stack's library waits 120 ms).
- Read **3 bytes** BYTE_H, BYTE_M, BYTE_L: distance = ((BYTE_H << 16) + (BYTE_M << 8) + BYTE_L) / 1000 **mm**.
- No CRC or status byte. M5Stack caps readings at 4500 mm (out of range).

## Wiring
- ESP32: 5V → 3V3, GND → GND, SDA → D21, SCL → D22, plus 4.7 kΩ from SDA and SCL to 3V3 (the ESP32's internal pull-ups are too weak).
- Pico: 5V → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5, 4.7 kΩ pull-ups to 3V3.
- Raspberry Pi 4: 5V → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5 (the Pi already has 1.8 kΩ pull-ups).

## Using the driver
```python
from machine import I2C, Pin
from rcwl9620 import RCWL9620
i2c = I2C(0, sda=Pin(21), scl=Pin(22), freq=100000)
sonic = RCWL9620(i2c)
print('D=%.1fmm' % sonic.distance_mm())
```

## Gotchas
- Reading before the 100 ms is up returns a stale or partial result: always wait after the 0x01 command.
- Under about 2 cm (blind zone) readings are random; soft or slanted targets may give no usable echo.
- The beam is about 60° wide, so nearby table tops and edges can echo first. Aim the probes squarely at the target.
- M5Stack notes the reply can be slower beyond 3.5 m.

## Datasheet
https://m5stack-doc.oss-cn-shenzhen.aliyuncs.com/697/RCWL-9620-V1.0.pdf
