---
name: part-sparkfun-qwiic-quad-relay
description: Pinout, electrical limits, wiring and MicroPython driver for the SparkFun Qwiic Quad Relay (COM-16566 v2.0 / COM-15102 v1.0; ATtiny84A I2C controller + four JZC-11F 5 V SPDT relays, address 0x6D, 7-12 V barrel jack for the coils). Use when designing, wiring, simulating or writing code for a Qwiic Quad Relay in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# SparkFun Qwiic Quad Relay (COM-16566)

## Overview
The **SparkFun Qwiic Quad Relay** switches four loads with **JZC-11F** SPDT relays (5 A at 250 VAC or 30 VDC each). An **ATtiny84A** running SparkFun's Qwiic Quad Relay firmware listens on I2C and drives each relay through an optocoupler and a transistor. There are two power systems: **3.3 V logic** (4-pin header or Qwiic) and a **7-12 V barrel jack** that an on-board regulator turns into 5 V for the relay coils. Loads go on four NO/COM/NC screw terminals, so the board is wired with jumper leads, not plugged into a breadboard.

## Pinout (0.1" header as printed on the board, plus the barrel jack)
| Pin | Function |
|---|---|
| GND | Ground (also the barrel jack sleeve) |
| 3V3 | Logic supply 3.3 V (ATtiny84A + opto LEDs, up to ~85 mA) |
| SDA | I2C data (no pull-up on the board) |
| SCL | I2C clock (no pull-up on the board) |
| VIN | Barrel jack centre, 7-12 V DC for the relay coils (~250 mA all on) |

Screw terminals (bottom edge): NO, COM, NC for each relay 1-4, isolated from the logic.

## Electrical limits
- Logic: 3.3 V (3.0-3.6 V). Never 5 V on 3V3.
- Relay supply: 7-12 V DC on the barrel jack (v2.0 maximum 12 V). With the BYP "5V Wall Adapter" jumper closed, feed exactly 5 V instead.
- Contacts: 5 A at 250 VAC or 30 VDC per relay.

## Interface details
- **I2C address 0x6D** (ADDR jumper open), **0x6C** (closed), or 0x08-0x77 stored in EEPROM with `0xC7 <addr>`.
- One-byte commands:
  - `0x01`-`0x04`: toggle relay 1-4.
  - `0x0A` all off, `0x0B` all on, `0x0C` toggle all.
  - `0x05`-`0x08` then read: status of relay 1-4, `0x0F` = on, `0x00` = off. A longer read continues to the next relays (0x05 + 4 bytes = all four).
- No per-relay "on" command: read the status, then toggle if needed.

## Wiring
- ESP32: 3V3 → 3V3, GND → GND, SDA → D21, SCL → D22 (4.7 k pull-ups to 3.3 V), 9 V or 12 V adapter → barrel jack.
- Pico: 3V3 → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5 (4.7 k pull-ups), adapter → barrel jack.
- Raspberry Pi 4: 3V3 → pin 1, GND → pin 6, SDA → pin 3, SCL → pin 5 (the Pi has 1.8 k pull-ups), adapter → barrel jack.

## Using the driver
```python
from machine import I2C, Pin
from qwiic_quad_relay import QwiicQuadRelay
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
relays = QwiicQuadRelay(i2c)   # 0x6D
relays.on(1)
print(relays.states())         # [1, 0, 0, 0]
relays.all_off()
```

## Gotchas
- Without the barrel jack supply the board still answers on I2C and reports states, but the relays never switch.
- No I2C pull-ups on the board (schematic v2.0): add them unless the host or another Qwiic board has them.
- Mains is dangerous: COM to the live wire, NO (off at rest) or NC (on at rest) to the load; never touch the terminals while it is plugged in.
- With 12 V in and all four relays on, the regulator warms; a 5 V adapter with BYP closed runs coolest.

## Datasheet
https://cdn.sparkfun.com/assets/5/4/9/f/6/Qwiic_Quad_Relay_Schematic-v20.pdf (schematic) ·
https://learn.sparkfun.com/tutorials/qwiic-quad-relay-hookup-guide/all ·
https://github.com/sparkfun/Qwiic_Quad_Relay (firmware)
