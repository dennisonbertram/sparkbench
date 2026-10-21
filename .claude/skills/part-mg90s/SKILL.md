---
name: part-mg90s
description: Pinout, electrical limits, wiring and MicroPython driver for the MG90S metal-gear micro servo (TowerPro MG90S). Use when designing, wiring, simulating or writing code for an MG90S in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MG90S metal-gear micro servo (MG90S)

## Overview
The **TowerPro MG90S** is a 9 g-class hobby servo with metal gears and one bearing. It turns about 180° (90° each way from the middle) to the angle set by a pulse on its signal wire, and holds that angle. Stall torque is 1.8 kgf·cm at 4.8 V and 2.2 kgf·cm at 6 V; speed 0.1 s/60° at 4.8 V. Hobbyists buy it as the bare servo with a 3-wire lead ending in a female 2.54 mm connector, plus 3 horns and screws.

## Pinout (3-wire lead, connector order)
| Pin | Wire | Function |
|---|---|---|
| GND | Brown | Ground |
| V+ | Red | Supply, 4.8–6.0 V |
| PWM | Orange | Control pulse, 50 Hz |

## Electrical limits
- Supply: 4.8–6.0 V. Do not run it from 3.3 V.
- Current: roughly 250 mA moving, several hundred mA more when it stalls or starts.
- Signal: 3.3 V logic from an ESP32 or Pico works.

## Interface details
- 50 Hz frame (20 ms period); pulse width sets the angle.
- 1.5 ms = middle ("0"), ~1 ms = full left ("-90"), ~2 ms = full right ("+90").
- Dead band 5 µs: changes smaller than that are ignored.
- Driver angle scale 0–180°: pulse = 1000 + 1000 × angle / 180 µs; duty_u16 = pulse_us × 65535 / 20000.

## Wiring
- ESP32: V+ → VIN (5 V from USB), GND → GND, PWM → D13.
- Pico: V+ → VBUS (pin 40), GND → GND, PWM → GP15.
- Raspberry Pi 4: V+ → pin 2 (5 V), GND → pin 6, PWM → pin 12 (GPIO18).
- For more than one servo, use a separate 5 V supply and join its GND to the board's GND.

## Using the driver
```python
from mg90s import MG90S
import time
servo = MG90S(13)
servo.angle(90)   # middle (1.5 ms)
time.sleep(1)
servo.angle(0)    # full left (1 ms)
```

## Gotchas
- If the board resets or browns out when the servo moves, power the servo from its own 5 V supply or add a 470 µF capacitor across V+ and GND.
- Many units travel further than 180° with 0.5–2.5 ms pulses; widen min_us/max_us in small steps and back off if it buzzes against the end stop (that stalls the motor and heats it).
- Call off() to stop the pulses so a parked servo stops humming and drawing current.

## Datasheet
https://www.electronicoscaldas.com/datasheet/MG90S_Tower-Pro.pdf
