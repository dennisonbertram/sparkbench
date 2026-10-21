---
name: part-pct2075
description: Pinout, electrical limits, wiring and MicroPython driver for the PCT2075 temperature sensor (NXP PCT2075, LM75-compatible). Use when designing, wiring, simulating or writing code for a PCT2075 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# PCT2075 temperature sensor (PCT2075)

## Overview
The **PCT2075** from NXP is an LM75-compatible digital thermometer and thermal watchdog: −55 to 125 °C, 0.125 °C resolution (11 bits), ±1 °C from −25 to 100 °C. It talks I2C (up to 1 MHz) and has an open-drain over-temperature output. Hobbyists buy it on the **Adafruit PCT2075 Temperature Sensor - STEMMA QT / Qwiic (product 4369)**: no regulator, 10k pull-ups on SDA/SCL to VCC, address pins left floating (0x37).

## Pinout (Adafruit PCT2075, header by header)
Main header (5 pins):
| Pin | Function |
|---|---|
| VCC | Supply, 2.7–5.5 V |
| GND | Ground |
| SCL | I2C clock |
| SDA | I2C data |
| INT | OS over-temperature output, open-drain, active low (optional) |

Address header (3 pins, opposite edge):
| Pin | Function |
|---|---|
| A0 | Address bit 0: floating / GND / VCC |
| A1 | Address bit 1: floating / GND / VCC |
| A2 | Address bit 2: floating / GND / VCC |

The two headers are on opposite edges, so the board is wired with jumper leads.

## Electrical limits
- Supply: 2.7–5.5 V (absolute max 6.5 V). The pull-ups go to VCC, so use 3.3 V with a 3.3 V microcontroller.
- Current: about 125 µA average (200 µA with the bus busy), under 1 µA in shutdown.
- I2C up to 1 MHz (Fm+).

## Interface details
- **I2C address 0x37** with A0, A1, A2 floating (as shipped). Each address pin has three states (floating, low, high): 27 addresses in 0x28–0x2F, 0x35–0x37, 0x48–0x4F, 0x70–0x77 (datasheet Table 5). Pins are sampled only at power-up.
- Registers: 0x00 Temp (2 bytes, read-only), 0x01 Conf (1 byte), 0x02 Thyst (2 bytes, 75 °C), 0x03 Tos (2 bytes, 80 °C), 0x04 Tidle (1 byte, sampling period × 100 ms).
- Temperature: 11-bit two's complement in bits 15–5 of register 0x00, 0.125 °C per LSB: T = (signed raw16 >> 5) × 0.125 °C.
- Tos/Thyst: 9-bit two's complement in bits 15–7, 0.5 °C per LSB.
- Conversion takes about 28 ms, repeated every 100 ms by default.

## Wiring
- ESP32: VCC → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VCC → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from pct2075 import PCT2075
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
print('T=%.3fC' % PCT2075(i2c).temperature())
```

## Gotchas
- Default address is 0x37, not the LM75's 0x48: LM75 code needs the address changed.
- Read both bytes of the Temp register; a single-byte read gives only whole degrees.
- Changing A0–A2 takes effect only after a power cycle.
- No chip-ID register: an I2C scan is the only presence check.

## Datasheet
https://www.nxp.com/docs/en/data-sheet/PCT2075.pdf
