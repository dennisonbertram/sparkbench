---
name: part-at24c256
description: Pinout, electrical limits, wiring and MicroPython driver for the AT24C256 256-Kbit I2C EEPROM (Microchip/Atmel AT24C256C, YL-90 module). Use when designing, wiring, simulating or writing code for an AT24C256 / 24C256 EEPROM in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build, e.g. to keep settings or logs through power cycles.
---

# AT24C256 I2C EEPROM module (AT24C256)

## Overview
The **AT24C256C** (Microchip, formerly Atmel) is a 256-Kbit serial EEPROM: 32,768 bytes, organised as 512 pages of 64 bytes, that keep their contents with the power off (40-year retention, 1,000,000 write cycles). It talks I2C. Hobbyists buy it on the red **YL-90 AT24C256 module**: the chip, two 10 kΩ pull-ups on SDA/SCL, A0–A2 and WP tied low, and a 4-pin header.

## Pinout (YL-90 module, header order)
| Pin | Function |
|---|---|
| VCC | Supply, 1.7–5.5 V (3.3 V with an ESP32/Pico) |
| GND | Ground |
| SCL | I2C clock (10 kΩ pull-up on board) |
| SDA | I2C data (10 kΩ pull-up on board) |

## Electrical limits
- Supply: 1.7–5.5 V; no regulator on the module, so VCC is the I2C logic level too.
- Current: about 1 mA reading, 2–3 mA during a write, a few µA standby.
- I2C up to 400 kHz at 1.7 V, 1 MHz at 2.5 V and above.

## Interface details
- **I2C address 0x50** (1010 A2 A1 A0; 0x50–0x57 on boards with address jumpers).
- Every access starts with **two word-address bytes**, high byte first (bit 15 is don't-care).
- **Write**: address bytes + 1…64 data bytes, then STOP. Only the low 6 address bits count up during a write: bytes past the end of a 64-byte page **wrap to the start of the same page** and overwrite it. Split writes at page boundaries.
- **Write cycle**: after STOP the chip is busy for up to **5 ms** (tWR) and NACKs its address; poll for the ACK before the next access.
- **Read**: write the two address bytes (no STOP), repeated START, read as many bytes as you like; the address rolls over from 0x7FFF to 0x0000.
- WP high = whole array read-only; WP low (YL-90) = writes allowed.

## Wiring
- ESP32: VCC → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VCC → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from at24c256 import AT24C256
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
ee = AT24C256(i2c)            # addr=0x50
ee.write(0x0000, b'hello')    # split into page writes, waits out tWR
print(ee.read(0x0000, 5))     # b'hello'
```

## Gotchas
- The datasheet does not promise what a new chip contains (usually 0xFF): store a marker or checksum with your settings and fall back to defaults when it is missing.
- Writing more than one page in a single transfer silently overwrites the start of the page: always use the driver's `write`, which splits at 64-byte boundaries.
- Endurance is about 1,000,000 writes per byte: write only when a value changes, never every loop.
- `OSError` right after a write means the write cycle was not over yet; wait 5 ms or poll for the ACK.
- Do not power it from 5 V when SDA/SCL go to a 3.3 V board: the module's pull-ups go to VCC.

## Datasheet
https://ww1.microchip.com/downloads/en/DeviceDoc/Atmel-8568-SEEPROM-AT24C256C-Datasheet.pdf
