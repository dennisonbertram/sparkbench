---
name: part-mcp9808
description: Pinout, electrical limits, wiring and MicroPython driver for the MCP9808 precision temperature sensor (Microchip MCP9808). Use when designing, wiring, simulating or writing code for an MCP9808 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MCP9808 precision temperature sensor (MCP9808)

## Overview
The **MCP9808** from Microchip measures temperature from −40 to 125 °C with ±0.25 °C typical accuracy (±0.5 °C max from −20 to 100 °C) and 0.0625 °C resolution. It talks I2C and has a programmable alert/thermostat output. Hobbyists buy it on the **Adafruit MCP9808 breakout (#1782)**, which has 10k pull-ups on SDA/SCL and 10k pull-downs on the address pins, and no regulator.

## Pinout (Adafruit #1782, header order)
| Pin | Function |
|---|---|
| VDD | Supply and logic level, 2.7–5.5 V (3.3 V recommended) |
| GND | Ground |
| SCL | I2C clock |
| SDA | I2C data |
| Alert | Alert/thermostat output, open-drain (optional, needs a pull-up) |
| A0 | Address bit 0 (pulled down; VDD = +1) |
| A1 | Address bit 1 (pulled down; VDD = +2) |
| A2 | Address bit 2 (pulled down; VDD = +4) |

The newer STEMMA QT version labels the supply VIN and brings out only A0 (A1/A2 are solder jumpers), so its header differs from this one.

## Electrical limits
- Supply: 2.7–5.5 V. No regulator on the board, so VDD is also the I2C logic level: power it from 3.3 V on an ESP32/Pico.
- Current: 200 µA typical, 400 µA max while converting; 0.1 µA in shutdown.
- I2C up to 400 kHz.

## Interface details
- **I2C address 0x18** (A2 A1 A0 all low); 0x18 + 4·A2 + 2·A1 + A0, up to 0x1F. Address pins are read at power-up.
- Registers are 16 bits, MSB first: 0x01 CONFIG, 0x02 TUPPER, 0x03 TLOWER, 0x04 TCRIT, **0x05 TA (temperature)**, 0x06 manufacturer ID = **0x0054**, 0x07 device ID/revision = **0x04xx**, 0x08 resolution (8 bits).
- TA: bits 15–13 are alert flags (mask them off), bit 12 is the sign, bits 11–0 are temperature in 0.0625 °C steps.
  T = (raw & 0x0FFF) / 16, and subtract 256 when bit 12 is set. (The datasheet prints the negative case as "256 − …"; the value is negative: −10 °C reads 0x1F60 → 246 − 256 = −10.)
- Resolution register 0x08: 0 = 0.5 °C (30 ms), 1 = 0.25 °C (65 ms), 2 = 0.125 °C (130 ms), 3 = 0.0625 °C (250 ms, power-up default).
- CONFIG bit 8 (SHDN) puts the chip in shutdown; it converts continuously after power-up.

## Wiring
- ESP32: VDD → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VDD → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VDD → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from mcp9808 import MCP9808
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
sensor = MCP9808(i2c)          # checks the manufacturer/device IDs
print('T=%.2fC' % sensor.temperature())
```

## Gotchas
- Right after power-up the first conversion takes 250 ms; before that TA reads 0 °C.
- "MCP9808 not found" from the driver means the ID check failed: check wiring and the address pins.
- Keep it away from the regulator and the microcontroller, which warm the air nearby.
- Several sensors on one bus: give each a different A0/A1/A2 combination.

## Datasheet
https://ww1.microchip.com/downloads/en/DeviceDoc/MCP9808-0.5C-Maximum-Accuracy-Digital-Temperature-Sensor-Data-Sheet-DS20005095B.pdf
