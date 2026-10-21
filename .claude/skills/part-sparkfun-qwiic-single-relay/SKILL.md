---
name: part-sparkfun-qwiic-single-relay
description: Pinout, electrical limits, wiring and MicroPython driver for the SparkFun Qwiic Single Relay (COM-15093; ATtiny85 I2C controller + Omron G5LE-1 3 VDC SPDT relay, address 0x18). Use when designing, wiring, simulating or writing code for a Qwiic Single Relay in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# SparkFun Qwiic Single Relay (COM-15093)

## Overview
The **SparkFun Qwiic Single Relay** switches a load (up to 5.5 A continuous at 240 VAC) with an **Omron G5LE-1 3 VDC** SPDT relay. An **ATtiny85** running SparkFun's Qwiic Relay firmware listens on I2C and drives the relay coil through a transistor, so only SDA/SCL are needed. Connect it with a Qwiic cable or the 4-pin 0.1" header; the load goes on the NO/COM/NC screw terminal on the opposite edge (so the board is wired with jumper leads, not plugged into a breadboard).

## Pinout (0.1" header, as printed on the board)
| Pin | Function |
|---|---|
| GND | Ground |
| 3.3V | Supply, 3.3 V only (about 100 mA with the relay on) |
| SDA | I2C data (2.2 k pull-up on board) |
| SCL | I2C clock (2.2 k pull-up on board) |

Screw terminal (separate edge): NO, COM, NC — the switched contacts, not connected to the logic side.

## Electrical limits
- Supply: 3.3 V (3.2–3.6 V). No regulator: the 3 V coil (23.5 Ω) sits behind a 10 Ω resistor straight off 3.3 V. Never feed 5 V.
- Current: about 100 mA with the relay energised; a few mA idle.
- Contacts: 5.5 A continuous at 240 VAC (10 A at 110 VAC for pulses under 20 s, per the schematic note).

## Interface details
- **I2C address 0x18** (ADDR jumper open), **0x19** (jumper closed), or any 0x08–0x77 stored in EEPROM with command 0x03.
- One-byte commands (no register map):
  - `0x01` relay on, `0x00` relay off.
  - `0x05` then read 1 byte: state, 1 = on, 0 = off.
  - `0x04` then read 2 bytes: firmware major, minor (1.1 on the current firmware; early boards 1.0).
  - `0x03 <addr>`: change the I2C address (EEPROM).
- No toggle command: read the state and send the opposite.

## Wiring
- ESP32: 3.3V → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: 3.3V → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: 3.3V → pin 1, GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from qwiic_relay import QwiicRelay
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
relay = QwiicRelay(i2c)      # 0x18
relay.on()
print(relay.state())         # 1
relay.off()
```

## Gotchas
- Mains is dangerous: COM to the live wire, NO (off at rest) or NC (on at rest) to the load; never touch the terminal while it is plugged in.
- Each energised relay draws ~100 mA from 3.3 V; several boards may need a separate 3.3 V supply.
- Many pulled-up Qwiic boards on one bus: cut JP7 on all but one.

## Datasheet
https://cdn.sparkfun.com/assets/0/7/b/1/6/Qwiic_Single_Relay.pdf (schematic) ·
https://learn.sparkfun.com/tutorials/qwiic-single-relay-hookup-guide/all ·
https://github.com/sparkfun/Qwiic_Relay (firmware)
