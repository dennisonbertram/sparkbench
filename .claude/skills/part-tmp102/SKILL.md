---
name: part-tmp102
description: Pinout, electrical limits, wiring and MicroPython driver for the TMP102 digital temperature sensor (Texas Instruments TMP102). Use when designing, wiring, simulating or writing code for a TMP102 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# TMP102 digital temperature sensor (TMP102)

## Overview
The **TMP102** from Texas Instruments measures temperature from −40 to 125 °C (±0.5 °C typical, ±2 °C max from −25 to 85 °C) with 0.0625 °C (12-bit) resolution, and talks I2C. Hobbyists buy it on the **SparkFun Digital Temperature Sensor Breakout - TMP102 (SEN-13314)**, which adds a decoupling capacitor, pull-ups on SDA, SCL and ALERT, and a closed solder jumper pulling ADD0 to GND through 10 kΩ. There is no regulator: it is a 3.3 V-only board.

## Pinout (SparkFun SEN-13314 v13, header order)
| Pin | Function |
|---|---|
| GND | Ground (pin 1) |
| VCC | Supply, 1.4–3.6 V, silkscreen "1.4-3.6V" (use 3.3 V) |
| SDA | I2C data (pull-up on board) |
| SCL | I2C clock (pull-up on board) |
| ALT | ALERT output, open-drain, active low by default (optional) |
| ADD0 | Address select; pulled to GND via 10 kΩ and a closed solder jumper (optional) |

## Electrical limits
- Supply: 1.4–3.6 V; absolute maximum 4 V. **Never connect VCC to 5 V.**
- SDA, SCL, ADD0: up to 4 V absolute maximum, so keep the bus at 3.3 V.
- Current: about 10 µA average at the default 4 conversions/s, under 1 µA in shutdown.
- I2C up to 400 kHz (high-speed mode up to 2.85 MHz).

## Interface details
- **I2C address 0x48** (ADD0 to GND, default). ADD0 to VCC = 0x49, to SDA = 0x4A, to SCL = 0x4B.
- 16-bit registers, MSB first; the pointer byte selects 0x00 temperature, 0x01 configuration, 0x02 TLOW, 0x03 THIGH.
- Temperature: 12-bit two's complement, left-justified in bits 15–4, 0.0625 °C/LSB: T = (raw >> 4) × 0.0625 (subtract 256 if bit 15 is set). Low-byte bit 0 is 1 only in extended (13-bit) mode.
- Configuration powers up as **0x60A0**: continuous conversion at 4 Hz, comparator mode, normal mode. R1/R0 always read 11. TLOW = 75 °C (0x4B00), THIGH = 80 °C (0x5000).
- Conversion time 10 ms typical, 15 ms max. Temperature reads 0 °C until the first conversion completes.

## Wiring
- ESP32: VCC → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VCC → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from tmp102 import TMP102
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
print('T=%.2fC' % TMP102(i2c).temperature())
```
The driver also has `set_rate()`, `shutdown()`, `one_shot()` and `limits()`.

## Gotchas
- 5 V on VCC destroys the chip: the board has no regulator.
- Pin 1 is GND and pin 2 is VCC (labelled 1.4-3.6V); the older v12 board revision had VCC first, so wire by the silkscreen.
- ADD0 is pulled to GND (10 kΩ through a solder jumper on the back). Cut the jumper before wiring ADD0 elsewhere.
- Reading faster than 4 times a second just repeats the last result; use `set_rate(RATE_8HZ)` for more.
- It measures its own board temperature: keep it away from the regulator and the microcontroller.

## Datasheet
https://www.ti.com/lit/ds/symlink/tmp102.pdf
