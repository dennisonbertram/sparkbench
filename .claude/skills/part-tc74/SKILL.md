---
name: part-tc74
description: Pinout, electrical limits, wiring and MicroPython driver for the TC74 serial digital temperature sensor (Microchip TC74A0-3.3VAT, TO-220-5). Use when designing, wiring, simulating or writing code for a TC74 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# TC74 digital temperature sensor (TC74A0-3.3VAT)

## Overview
The **Microchip TC74** reports temperature as a single signed byte, 1 °C per step, over SMBus/I2C. Accuracy is ±2 °C from 25 to 85 °C and ±3 °C from 0 to 125 °C; it converts about 8 times a second. Hobbyists buy the bare chip in a **5-pin TO-220** package. The I2C address is fixed by the part number: this one, **TC74A0-3.3VAT**, answers at 0x48 and is accuracy-optimized for a 3.3 V supply.

## Pinout (TO-220, printed face towards you, legs down, left to right)
| Pin | Name | Function |
|---|---|---|
| 1 | NC | No internal connection |
| 2 | SDA | I2C data, open-drain (needs a pull-up) |
| 3 | GND | Ground (tab is also GND) |
| 4 | SCLK | I2C clock input (needs a pull-up) |
| 5 | VDD | Supply, 2.7–5.5 V |

## Electrical limits
- Supply: 2.7–5.5 V (absolute max 6 V). Accuracy drifts 1 °C per volt away from the nominal 3.3 V (or 5.0 V for the -5.0V parts).
- Current: 200 µA typical, 350 µA max; 5 µA in standby.
- Inputs: high ≥ 0.8 × VDD, low ≤ 0.2 × VDD. Any pin: GND − 0.3 V to VDD + 0.3 V.
- Bus clock: **10–100 kHz only** (no 400 kHz).

## Interface details
- **I2C address 0x48** for TC74A0; A1–A7 = 0x49–0x4F; TC74A5 (0x4D) is Microchip's default part.
- SMBus Read Byte: write command byte, repeated start, read one byte (`readfrom_mem`).
- Command 0x00 (RTR): TEMP, two's complement, 1 °C per LSB: 0x19 = 25 °C, 0x00 = 0 °C, 0xFF = −1 °C, 0xE7 = −25 °C. Values are rounded down (25.75 °C → 25, −0.25 °C → −1).
- Command 0x01 (RWCR): CONFIG. Bit 7 SHDN (1 = standby, read/write), bit 6 DATA_RDY (1 = a conversion has finished, read-only), bits 5–0 read 0. Power-up value 0x00.
- First valid reading: up to 250 ms after power-on (poll DATA_RDY).

## Wiring
Add 4.7 kΩ pull-ups from SDA and SCLK to VDD.
- ESP32: VDD → 3V3, GND → GND, SDA → D21, SCLK → D22.
- Pico: VDD → 3V3(OUT), GND → GND, SDA → GP4, SCLK → GP5.
- Raspberry Pi 4: VDD → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCLK → pin 5 (the Pi already has 1.8k pull-ups; set the bus to 100 kHz or lower).

## Using the driver
```python
from machine import I2C, Pin
from tc74 import TC74
i2c = I2C(0, sda=Pin(21), scl=Pin(22), freq=100000)
sensor = TC74(i2c, 0x48)
sensor.wait_ready()
print('T=%dC' % sensor.temperature())
```
`sensor.standby(True)` freezes the reading and drops to 5 µA; `standby(False)` resumes (wait for `ready()` again).

## Gotchas
- **Legs are 1.7 mm apart**, not 2.54 mm: bend them alternately forward and back so they land in separate breadboard rows.
- **Wrong address?** Check the marking: TC74A**5** parts answer at 0x4D, not 0x48. Run `i2c.scan()`.
- **Bus speed:** the default 400 kHz on some ports is too fast; pass `freq=100000`.
- Powering it from 5 V with a 3.3 V microcontroller makes logic-high unreliable (needs 4 V): use 3.3 V.
- Only whole degrees: for finer readings pick a TMP102, LM75A or MCP9808.
- The tab is GND and the chip measures its own package temperature; bolting it to a heatsink measures the heatsink.

## Datasheet
https://ww1.microchip.com/downloads/en/DeviceDoc/21462D.pdf
