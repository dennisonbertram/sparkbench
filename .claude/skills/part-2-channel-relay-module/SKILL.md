---
name: part-2-channel-relay-module
description: Pinout, electrical limits, wiring and MicroPython code for the 2-channel 5 V relay module with high/low trigger jumpers (Songle SRD-05VDC-SL-C relays, IN1/IN2). Use when designing, wiring, simulating or writing code for a 2-channel relay module in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# 2-channel 5 V relay module (SRD-05VDC-SL-C x2)

## Overview
Two **Songle SRD-05VDC-SL-C** relays (SPDT, form C) on one board, each driven through an optocoupler and a transistor, with flyback diodes and status LEDs. A GPIO switches two independent loads (lamps, pumps, fans). Hobbyists buy it as the **2-channel 5V relay module with optocoupler, high and low level trigger selectable by jumper**: a 4-pin input header, a trigger jumper per channel (H / COM / L), and a 3-way screw terminal (NO / COM / NC) per relay. This model assumes **both jumpers on H** (IN high = relay on).

## Pinout (input header order)
| Pin | Function |
|---|---|
| DC+ | Module supply, 5 V (optocouplers + relay coils) |
| DC- | Ground (share with the microcontroller) |
| IN1 | Relay 1 control: high = on (jumper on H) |
| IN2 | Relay 2 control: high = on (jumper on H) |

Output terminals per channel: **NO** (connected to COM while the relay is on), **COM**, **NC** (connected to COM while the relay is off).

## Electrical limits
- Supply 5 V. SRD-05VDC-SL-C coil: 70 Ω, 71.4 mA at 5 V, pull-in 3.75 V max, drop-out 0.5 V min, max 6 V.
- Inputs: optocoupler LED, about 2–5 mA trigger current; vendors give the 5 V version's logic input as 3.3–5 V in high-trigger mode.
- Contacts (form C, resistive): 10 A 125 VAC, 7 A 240 VAC, 7 A 28 VDC; inductive 3 A 120 VAC / 3 A 28 VDC. Max 250 VAC / 110 VDC.
- Operate 10 ms max, release 5 ms max; electrically about 30 operations/min.

## Interface details
- Plain digital inputs: no driver needed, just `machine.Pin`. Each IN is independent.
- Trigger jumper: H-COM = high level trigger, L-COM = low level trigger (inverted logic). Many boards ship on L; move both to H to match this model.

## Wiring
- ESP32: DC+ → 5V (VIN), DC- → GND, IN1 → D25, IN2 → D26.
- Pico: DC+ → VBUS (5 V from USB), DC- → GND, IN1 → GP2, IN2 → GP3.
- Raspberry Pi 4: DC+ → pin 2 (5 V), DC- → pin 6, IN1 → pin 22 (GPIO25), IN2 → pin 18 (GPIO24).
- Load: supply + → COM, NO → load → supply −. Mains only by an adult or qualified person, in a closed insulated enclosure.

## Using it
```python
from machine import Pin
import time
relay1 = Pin(25, Pin.OUT, value=0)  # IN1
relay2 = Pin(26, Pin.OUT, value=0)  # IN2
relay1.value(1)   # load 1 on
time.sleep(2)
relay1.value(0)   # load 1 off
relay2.value(1)   # load 2 on
```

## Gotchas
- **Check the jumpers.** On L (often the factory setting) IN low = on, the relay clicks on at boot, and a 3.3 V GPIO may not turn it fully off.
- Power DC+ from 5 V, never 3V3: two coils draw about 145 mA together.
- Initialise the pins with `value=0` so the relays stay off while the program starts.
- Relays are slow and wear out: don't PWM them. Use a MOSFET for speed control.
- Motors and pumps are inductive loads: derate to 3 A, and add a snubber/diode across DC motors on the load side.

## Datasheet
https://www.circuitbasics.com/wp-content/uploads/2015/11/SRD-05VDC-SL-C-Datasheet.pdf
