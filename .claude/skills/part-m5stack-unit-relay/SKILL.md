---
name: part-m5stack-unit-relay
description: Pinout, electrical limits, wiring and MicroPython code for the M5Stack Unit Relay (SKU U023, HK4100F-DC5V-SHG 3 A SPDT relay, Grove HY2.0-4P GND/5V/DIN/NC). Use when designing, wiring, simulating or writing code for an M5Stack relay unit in a Sparkbench project or any ESP32 / M5Stack / Raspberry Pi Pico / Raspberry Pi build.
---

# M5Stack Unit Relay (U023, HK4100F-DC5V-SHG)

## Overview
A single-channel relay unit from M5Stack. One **Huike HK4100F-DC5V-SHG** relay (5 V coil, 0.2 W, sealed, SPDT / form C) is switched by an **SS8050** NPN transistor: DIN → 1 kΩ → base, with a 10 kΩ pull-down from base to GND and a 1N4148WS flyback diode across the coil. A status LED shows when the relay is on. There is **no optocoupler**: the coil runs from the Grove 5 V and the input is a plain active-high logic input. Hobbyists buy it as the **M5Stack Unit Relay (SKU U023)**: a Grove HY2.0-4P socket (comes with a 20 cm Grove cable) on one end and a 3-way 3.96 mm terminal (COM / NO / NC) on the other.

## Pinout (Grove HY2.0-4P, order and names from the M5Stack PinMap)
| Pin | Wire | Function |
|---|---|---|
| GND | black | Ground (share with the microcontroller) |
| 5V | red | Coil + LED supply, 5 V (about 40 mA with the relay on) |
| DIN | yellow | Control: high = relay on, low or unconnected = off |
| NC | white | Not connected (Port B's analog line, unused) |

Output terminal (3.96 mm): **COM**, **NO** (connected to COM while the relay is on) and **NC** (connected to COM while it is off). The Grove port and the terminal are on opposite ends, so the unit is wired with the Grove cable or jumper leads, not plugged into the breadboard.

## Electrical limits
- Supply 5 V. Coil (HK4100F 5 VDC, H = 0.2 W): 125 Ω ±10 %, 40 mA, pull-in ≤ 3.75 V (75 %), drop-out ≥ 0.5 V (10 %), max 6.5 V (130 %). **3.3 V is not enough to pull the relay in reliably.**
- DIN: drives the transistor base through 1 kΩ, so it takes about 2.5 mA at 3.3 V. Both 3.3 V and 5 V logic work.
- Contacts (resistive): 3 A at 250 VAC, 3 A at 30 VDC (M5Stack quotes AC 220 V @ 3 A / DC 30 V @ 3 A). Life is at least 100 000 operations at full load.
- Operate time 6 ms max, release time 4 ms max. Electrically, no more than 30 operations per minute.

## Interface details
- Plain digital input: no driver, just `machine.Pin`.
- Active high. The on-board 10 kΩ pull-down keeps the relay off while DIN floats (e.g. while the board boots).

## Wiring
- ESP32: GND → GND, 5V → 5V/VIN, DIN → GPIO26.
- M5Stack Core (Port B): plug in the Grove cable; DIN = GPIO26.
- Pico: GND → GND, 5V → VBUS, DIN → GP15.
- Raspberry Pi 4: GND → pin 6, 5V → pin 2, DIN → pin 11 (GPIO17).
- Load: supply + → COM, NO → load → supply −. Mains only by an adult or qualified person, in a closed insulated enclosure.

## Using it
```python
from machine import Pin
import time
relay = Pin(26, Pin.OUT, value=0)  # DIN, high = on
relay.value(1)   # load on (NO-COM closed)
time.sleep(2)
relay.value(0)   # load off
```

## Gotchas
- Feed **5 V**, not 3.3 V: the coil needs at least 3.75 V to pull in.
- The white Grove wire is not connected. On an M5Stack Core's Port B, the relay follows the yellow wire (GPIO26), not GPIO36.
- Contacts are rated **3 A**, much lower than the usual 10 A blue relay modules. Keep motors and pumps well below that.
- There is no optocoupler: the coil circuit shares ground with your board.
- Relays are slow and wear out: never PWM them.

## Datasheet
https://m5stack.oss-cn-shenzhen.aliyuncs.com/resource/docs/products/unit/4relay/Datasheet-Realy-HK4100F-DC5V-SHG(1).pdf (Huike HK4100F). Product page: https://docs.m5stack.com/en/unit/relay. Schematic: https://m5stack-doc.oss-cn-shenzhen.aliyuncs.com/577/UNIT-RELAY.pdf
