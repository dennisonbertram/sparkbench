---
name: part-16-channel-relay-module
description: Pinout, electrical limits, wiring and MicroPython code for the 16-channel 12 V active-low relay module (SainSmart 101-70-103 and clones; Songle SRD-12VDC-SL-C relays, optocouplers, ULN2803 drivers, LM2576 5 V regulator, 2x10 header 5V/IN1-IN16/GND). Use when designing, wiring, simulating or writing code for a 16-channel relay board in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# 16-channel 12 V relay module (SRD-12VDC-SL-C x16)

## Overview
Sixteen **Songle SRD-12VDC-SL-C** relays (SPDT, form C) on one board. Each input lights an optocoupler LED; the opto output drives one channel of a **ULN2803** Darlington array that switches the relay coil from 12 V, with a status LED per relay. An on-board **LM2576** buck regulator turns the 12 V into the 5 V for the opto side. Hobbyists buy it as the **SainSmart 16-Channel 12V Relay Module (101-70-103)** or one of its blue clones printed "16 Relay Module / Low-level input" (about 188 x 90 mm). The inputs are **active low**: IN low = relay on.

## Pinout
Input header JP2 (2x10, pin number order, from the SainSmart schematic):

| Pin | Name | Function |
|---|---|---|
| 1, 2 | 5V | OUTPUT of the on-board LM2576 5 V regulator. Leave unconnected |
| 3 ... 18 | IN1 ... IN16 | Relay control: low = on, high = off (odd INs on one row, even on the other) |
| 19, 20 | GND | Ground, join to the microcontroller GND |

Power terminal (2-way screw terminal): **DC12V+**, **DC12V-**. Output terminals per relay: **NO** (connected to COM while the relay is on), **COM**, **NC** (connected to COM while the relay is off).

## Electrical limits
- Supply 12 V on the screw terminal (relay datasheet: pull-in 75 % = 9 V max, max allowed 120 % = 14.4 V). SRD-12VDC-SL-C coil: 400 Ω, 30 mA at 12 V. All sixteen on: about 480 mA plus LEDs, so use a 12 V supply of at least 1 A.
- Inputs: optocoupler LED from the board's own 5 V through a resistor; the GPIO sinks about 15-20 mA (vendor figure) per active input.
- Contacts (form C, resistive): 10 A 125 VAC, 10 A 28 VDC (vendor: 10 A 250 VAC / 30 VDC); inductive 3 A.
- Operate 10 ms max, release 5 ms max.

## Interface details
- Plain digital inputs: no driver needed, just `machine.Pin`. Each IN is independent.
- Active low: `value(0)` = relay on, `value(1)` = relay off. An input left floating reads as off.
- The header 5V pins are an output (forum posts disagree, the schematic is clear: they sit on the LM2576 output). Don't feed them and don't tie them to your board's 5V/VBUS.
- 3.3 V boards: a high of 3.3 V leaves about 1.7 V across the opto LED and its resistor, which may keep a relay partly on. If relays won't switch off, drive each IN through an NPN transistor or a ULN2803 channel (its output low = relay on).

## Wiring
- 12 V supply: + → DC12V+, − → DC12V-.
- ESP32: GND → GND, IN1 ... IN16 → free output-capable GPIOs (e.g. D4, D5, D13, D14, D16, D17, D18, D19, D21, D22, D23, D25, D26, D27, D32, D33). 5V pins unconnected.
- Pico: GND → GND, IN1 ... IN16 → GP2 ... GP17. 5V pins unconnected.
- Raspberry Pi 4: GND → pin 6, IN pins → GPIOs, 5V pins unconnected (or use a transistor buffer per channel).
- Load: load supply + → COM, NO → load → load supply −. Mains only by an adult or qualified person, in a closed insulated enclosure.

## Using it
```python
from machine import Pin
import time
relays = [Pin(n, Pin.OUT, value=1) for n in range(2, 18)]  # value=1 = off
relays[0].value(0)   # load 1 on
time.sleep(2)
relays[0].value(1)   # load 1 off
```

## Gotchas
- **Active low.** Always create the pins with `value=1`, otherwise relays click on at start-up.
- It needs 12 V on the screw terminal: the relays do nothing from USB power.
- The 5V header pins are the board's regulator output: never connect them to your board's supply.
- Sixteen opto LEDs at 15-20 mA each is far more than a microcontroller should sink at once; buffer the inputs if many relays are on together.
- Relays are slow and wear out: don't PWM them. Inductive loads (motors, pumps, solenoid valves) derate to 3 A and want a diode/snubber on the load side.

## Datasheet
https://www.circuitbasics.com/wp-content/uploads/2015/11/SRD-05VDC-SL-C-Datasheet.pdf (Songle SRD series, covers the 12 V coil). Board schematic: https://s3.us-east-1.amazonaws.com/s3.image.smart/download/101-70-103/16%2Brelay%2Bboard.rar
