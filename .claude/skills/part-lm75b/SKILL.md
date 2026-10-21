---
name: part-lm75b
description: Pinout, electrical limits, wiring and MicroPython driver for the LM75B temperature sensor (NXP LM75B, Switch Science LM75B breakout). Use when designing, wiring, simulating or writing code for an LM75B in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# LM75B temperature sensor (LM75B)

## Overview
The **NXP LM75B** is a digital temperature sensor and thermal watchdog: −55 to 125 °C, 0.125 °C resolution, ±2 °C from −25 to 100 °C (±3 °C over the full range). It talks I2C (up to 400 kHz) and has an open-drain over-temperature output (OS). It is register-compatible with the LM75A but converts in 10 ms per 100 ms period, so it draws less (100 µA typ, 0.2 µA in shutdown). This skill models the **Switch Science LM75B breakout** (SSCI-018133): 10k pull-ups on SDA, SCL and OS, a 0.1 µF decoupling cap and A0–A2 solder jumpers.

## Pinout (Switch Science LM75B breakout, header order)
| Pin | Function |
|---|---|
| VCC | Supply, 2.8–5.5 V (3.3 V recommended) |
| OS | Over-temperature output, open-drain, active low by default, 10k pull-up (optional) |
| SCL | I2C clock (10k pull-up on board) |
| SDA | I2C data (10k pull-up on board) |
| GND | Ground |

## Electrical limits
- Supply: 2.8–5.5 V (absolute max 6.0 V).
- Current: 100 µA typ (200 µA max) bus idle, 300 µA max with the bus active at 400 kHz, 0.2 µA in shutdown.
- SDA/OS sink 3 mA at 0.4 V.

## Interface details
- **I2C address 0x48** as shipped (A0–A2 jumpered to GND); 0x48–0x4F (1001 A2 A1 A0).
- Pointer byte selects the register: 0x00 Temp (2 bytes, read-only), 0x01 Conf (1 byte), 0x02 Thyst (2 bytes, 75 °C at power-up), 0x03 Tos (2 bytes, 80 °C at power-up). There is no ID register.
- Temp: 11-bit two's complement in bits 15–5 of the 16-bit word (MSB first), 0.125 °C per step: T = (signed raw >> 5) × 0.125 °C. Always read both bytes.
- Tos/Thyst: 9-bit two's complement in bits 15–7, 0.5 °C per step.
- Conf bit 0 = 1 puts it in shutdown; bit 1 comparator/interrupt, bit 2 OS polarity, bits 4–3 fault queue.

## Wiring
- ESP32: VCC → 3V3, GND → GND, SDA → D21, SCL → D22 (OS → any input if used).
- Pico: VCC → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from lm75b import LM75B
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
print('T=%.3fC' % LM75B(i2c).temperature())
```

## Gotchas
- **The first reading after power-up is wrong** (datasheet 7.4.1); the driver waits 120 ms and throws one read away in its constructor.
- The board ships without a header; solder one.
- To change the address, cut SJ1/SJ2/SJ3 on the back and fit a 10k 0603 resistor at R4/R5/R6 to pull A0/A1/A2 high.
- The pull-ups go to VCC: power it from 3.3 V when the microcontroller runs at 3.3 V.
- Keep it away from the regulator and the microcontroller, which warm the air nearby.

## Datasheet
https://www.nxp.com/docs/en/data-sheet/LM75B.pdf
