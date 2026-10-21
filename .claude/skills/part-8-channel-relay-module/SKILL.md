---
name: part-8-channel-relay-module
description: Pinout, electrical limits, wiring and MicroPython code for the 8-channel 5 V active-low relay module (Songle SRD-05VDC-SL-C relays, GND/IN1-IN8/VCC header, JD-VCC jumper). Use when designing, wiring, simulating or writing code for an 8-channel relay module in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# 8-channel 5 V relay module (SRD-05VDC-SL-C x8)

## Overview
Eight **Songle SRD-05VDC-SL-C** relays (SPDT, form C) on one board, each driven through a PC817 optocoupler and a transistor, with flyback diodes and a status LED per channel. GPIOs switch up to eight independent loads (lamps, pumps, fans). Hobbyists buy it as the **8-channel 5V relay module with optocoupler, low level trigger** (the common blue board, about 138 x 56 mm): a 10-pin input header (GND, IN1 ... IN8, VCC), a 3-pin GND / VCC / JD-VCC jumper header, and a 3-way screw terminal (NO / COM / NC) per relay. The inputs are **active low**: IN low = relay on.

## Pinout (input header order)
| Pin | Function |
|---|---|
| GND | Ground (share with the microcontroller) |
| IN1 | Relay 1 control: low = on, high = off |
| IN2 | Relay 2 control: low = on, high = off |
| IN3 | Relay 3 control: low = on, high = off |
| IN4 | Relay 4 control: low = on, high = off |
| IN5 | Relay 5 control: low = on, high = off |
| IN6 | Relay 6 control: low = on, high = off |
| IN7 | Relay 7 control: low = on, high = off |
| IN8 | Relay 8 control: low = on, high = off |
| VCC | Module supply, 5 V (optocoupler side; also the coils while the JD-VCC jumper is fitted) |

Jumper header: **GND**, **VCC**, **JD-VCC** (relay coil supply; printed RY-VCC on some boards). The jumper cap on VCC-JD-VCC (default) runs everything from VCC. Output terminals per channel: **NO** (connected to COM while the relay is on), **COM**, **NC** (connected to COM while the relay is off).

## Electrical limits
- Supply 5 V. SRD-05VDC-SL-C coil: 70 Ω, 71.4 mA at 5 V, pull-in 3.75 V max (75 %), drop-out 0.5 V min, max 6 V. All eight on: about 570 mA, so use a 5 V supply of at least 1 A.
- Inputs: optocoupler LED from VCC, a few mA sunk per active input (vendors quote 5 mA to 15-20 mA); 3.3 V or 5 V logic.
- Contacts (form C, resistive): 10 A 125 VAC, 10 A 28 VDC; inductive 3 A.
- Operate 10 ms max, release 5 ms max; electrically about 30 operations/min.

## Interface details
- Plain digital inputs: no driver needed, just `machine.Pin`. Each IN is independent.
- Active low: `value(0)` = relay on, `value(1)` = relay off. An input left floating reads as off, an input driven low (including a GPIO that boots low) turns its relay on.
- Isolation: remove the JD-VCC jumper, feed a separate 5 V to JD-VCC (with its GND on the jumper header) and the logic supply to VCC.

## Wiring
- ESP32: VCC → external 5 V (or VIN for one or two relays), GND → GND, IN1 → D16, IN2 → D17, IN3 → D18, IN4 → D19, IN5 → D21, IN6 → D22, IN7 → D23, IN8 → D25.
- Pico: VCC → external 5 V (or VBUS for one or two relays), GND → GND, IN1 ... IN8 → GP2 ... GP9.
- Raspberry Pi 4: VCC → external 5 V, GND → pin 6, IN1 ... IN8 → GPIO5, 6, 13, 19, 26, 16, 20, 21.
- Load: supply + → COM, NO → load → supply −. Mains only by an adult or qualified person, in a closed insulated enclosure.

## Using it
```python
from machine import Pin
import time
relays = [Pin(n, Pin.OUT, value=1) for n in (2, 3, 4, 5, 6, 7, 8, 9)]  # value=1 = off
relays[0].value(0)   # load 1 on
time.sleep(2)
relays[0].value(1)   # load 1 off
```

## Gotchas
- **Active low.** Always create the pins with `value=1`, otherwise relays click on at start-up.
- Power VCC from 5 V, never 3V3: eight coils draw about 570 mA together, too much for a USB-powered board's 5 V pin; use a separate 5 V supply with a shared GND (or on JD-VCC).
- If a relay will not switch off from a 3.3 V board, remove the JD-VCC jumper, power JD-VCC from 5 V and VCC from 3.3 V.
- Relays are slow and wear out: don't PWM them. Use a MOSFET for speed control.
- Motors and pumps are inductive loads: derate to 3 A, and add a snubber/diode across DC motors on the load side.

## Datasheet
https://www.circuitbasics.com/wp-content/uploads/2015/11/SRD-05VDC-SL-C-Datasheet.pdf
