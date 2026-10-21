---
name: part-1-channel-relay-module-3-3v
description: Pinout, electrical limits, wiring and MicroPython code for the 1-channel 3.3 V relay module with optocoupler and high/low trigger jumper (Songle SRD-03VDC-SL-C relay, DC+/DC-/IN). Use when designing, wiring, simulating or writing code for a 3.3 V single relay module in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# 1-channel 3.3 V relay module (SRD-03VDC-SL-C)

## Overview
One **Songle SRD-03VDC-SL-C** relay (3 V coil, SPDT / form C) driven through an optocoupler (PC817/EL817) and a transistor, with a flyback diode, a power LED and a relay LED. Because the coil is a 3 V type, the whole module runs from a 3.3 V rail, so an ESP32, ESP8266 or Pico can power and switch it with no 5 V supply. Hobbyists buy it as the **1-channel 3.3V relay module with optocoupler, high and low level trigger selectable by jumper** (e.g. Abra RM-1-3.3V-T): a 3-way input terminal/header (DC+, DC-, IN), a trigger jumper (H / COM / L) and a 3-way screw terminal (NO / COM / NC). This model assumes the **jumper on H** (IN high = relay on).

## Pinout (input side, order printed on the board)
| Pin | Function |
|---|---|
| DC+ | Module supply, 3.3 V (optocoupler + relay coil) |
| DC- | Ground (share with the microcontroller) |
| IN | Control: high = relay on (jumper on H) |

Output screw terminal: **NO** (connected to COM while the relay is on), **COM**, **NC** (connected to COM while the relay is off). The signal header and the screw terminal sit on opposite edges, so the module is wired with jumper leads, not plugged into the breadboard.

## Electrical limits
- Supply 3.3 V (3.0–3.6 V). SRD-03VDC-SL-C (high sensitivity, 0.36 W): 25 Ω ±10 % coil, 120 mA at 3 V (about 130 mA at 3.3 V), pull-in 2.25 V max (75 %), drop-out 0.3 V min (10 %), max 3.6 V (120 %).
- IN: optocoupler LED, about 5 mA trigger current (vendor figure).
- Contacts (form C, resistive): 10 A 125 VAC, 7 A 240 VAC, 7 A 28 VDC; inductive 3 A 120 VAC / 3 A 28 VDC. Max 250 VAC / 110 VDC.
- Operate 10 ms max, release 5 ms max; electrically about 30 operations/min.

## Interface details
- Plain digital input: no driver, just `machine.Pin`.
- Trigger jumper: COM-H = high level trigger, COM-L = low level trigger (inverted logic). Check it before use.

## Wiring
- ESP32: DC+ → 3V3, DC- → GND, IN → D26.
- Pico: DC+ → 3V3(OUT), DC- → GND, IN → GP15.
- Raspberry Pi 4: DC+ → pin 1 (3.3 V), DC- → pin 6, IN → pin 11 (GPIO17).
- Load: supply + → COM, NO → load → supply −. Mains only by an adult or qualified person, in a closed insulated enclosure.

## Using it
```python
from machine import Pin
import time
relay = Pin(26, Pin.OUT, value=0)  # IN, jumper on H
relay.value(1)   # load on (NO-COM closed)
time.sleep(2)
relay.value(0)   # load off
```

## Gotchas
- **Check the jumper.** On L the logic is inverted: the relay is on whenever IN is low, including while the board boots.
- The coil draws about 130 mA from 3V3. Fine for an ESP32 DevKit or a Pico; don't hang several of these on a weak 3.3 V regulator, and never power DC+ from 5 V (the 3 V coil's maximum is 3.6 V).
- Initialise the pin with `value=0` so the relay stays off while the program starts.
- Relays are slow and wear out: never PWM them.
- Motors and pumps are inductive loads: derate the contacts to 3 A.

## Datasheet
https://www.circuitbasics.com/wp-content/uploads/2015/11/SRD-05VDC-SL-C-Datasheet.pdf (Songle SRD series, covers the 03 VDC coil)
