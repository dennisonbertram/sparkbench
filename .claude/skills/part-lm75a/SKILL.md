---
name: part-lm75a
description: Pinout, electrical limits, wiring and MicroPython driver for the LM75A temperature sensor (NXP LM75A, CJMCU-75 module). Use when designing, wiring, simulating or writing code for an LM75A in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# LM75A temperature sensor (LM75A)

## Overview
The **NXP LM75A** is a digital temperature sensor and thermal watchdog: −55 to 125 °C, 0.125 °C resolution, ±2 °C from −25 to 100 °C (±3 °C over the full range). It talks I2C and has an open-drain over-temperature output (OS). Hobbyists buy it on the purple **CJMCU-75** module, which adds 10k pull-ups on SDA/SCL, a 200k pull-up and red LED on OS, and solder pads for the address pins.

## Pinout (CJMCU-75, header order)
| Pin | Function |
|---|---|
| VCC | Supply, 2.8–5.5 V (3.3 V recommended) |
| GND | Ground |
| SDA | I2C data (10k pull-up on board) |
| SCL | I2C clock (10k pull-up on board) |
| OS | Over-temperature output, open-drain, active low by default (optional) |

A0, A1 and A2 are not on the header: each is a solder pad between a VCC pad and a GND pad.

## Electrical limits
- Supply: 2.8–5.5 V (absolute max 6.0 V).
- Current: about 100 µA converting with the bus idle, up to 1 mA with the bus active, 3.5 µA in shutdown (plus the OS LED when lit).
- I2C up to 400 kHz.

## Interface details
- **I2C address 0x48** with A0–A2 all bridged to GND; 0x48–0x4F (1001 A2 A1 A0).
- Pointer byte selects the register: 0x00 Temp (2 bytes, read-only), 0x01 Conf (1 byte), 0x02 Thyst (2 bytes, 75 °C at power-up), 0x03 Tos (2 bytes, 80 °C at power-up). There is no ID register.
- Temp: 11-bit two's complement in bits 15–5 of the 16-bit word (MSB first), 0.125 °C per step: T = (signed raw >> 5) × 0.125 °C. Always read both bytes.
- Tos/Thyst: 9-bit two's complement in bits 15–7, 0.5 °C per step.
- A conversion runs every 100 ms; Conf bit 0 = 1 puts it in shutdown.

## Wiring
- ESP32: VCC → 3V3, GND → GND, SDA → D21, SCL → D22 (OS → any input if used).
- Pico: VCC → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from lm75a import LM75A
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
print('T=%.3fC' % LM75A(i2c).temperature())
```

## Gotchas
- **The address pads ship open.** Bridge A0, A1 and A2 each to GND (0x48) or VCC with solder before use; floating address pins give an unpredictable address.
- The board's pull-ups go to VCC: power it from 3.3 V when the microcontroller runs at 3.3 V.
- The OS LED lights when the temperature passes 80 °C (power-up Tos); it is not a power indicator.
- Keep it away from the regulator and the microcontroller, which warm the air nearby.

## Datasheet
https://www.nxp.com/docs/en/data-sheet/LM75A.pdf
