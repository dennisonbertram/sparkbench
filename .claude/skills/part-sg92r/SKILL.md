---
name: part-sg92r
description: Pinout, electrical limits, wiring and MicroPython driver for the SG92R micro servo (TowerPro SG92R, Adafruit #169). Use when designing, wiring, simulating or writing code for an SG92R in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# SG92R micro servo (SG92R)

## Overview
The **TowerPro SG92R** is a 9 g hobby servo, an upgraded SG90 with POM/carbon-fibre gears and a coreless motor. It turns about 180° (90° each way from the middle) to the angle set by a pulse on its signal wire, and holds that angle. Stall torque 2.5 kgf·cm and speed 0.1 s/60° at 4.8 V; dead band 1 µs. Hobbyists buy it as Adafruit product #169: the bare servo with a 3-wire lead ending in a female 2.54 mm JR/Futaba connector, plus horns and screws.

## Pinout (3-wire lead, connector order)
| Pin | Wire | Function |
|---|---|---|
| GND | Brown | Ground |
| V+ | Red | Supply, 4.8 V nominal (6 V max) |
| PWM | Orange | Control pulse, 50 Hz |

## Electrical limits
- Supply: 4.8 V nominal; Adafruit lists 3–6 V, but use 5 V. Do not run it from the 3.3 V pin.
- Current: a few hundred mA moving, more when it stalls or starts.
- Signal: 3.3 V logic from an ESP32 or Pico works.

## Interface details
- 50 Hz frame (20 ms period); pulse width sets the angle.
- 1.5 ms = middle ("0"), ~1 ms = full left ("-90"), ~2 ms = full right ("+90").
- Driver angle scale 0–180°: pulse = 1000 + 1000 × angle / 180 µs; duty_u16 = pulse_us × 65535 / 20000.

## Wiring
- ESP32: V+ → VIN (5 V from USB), GND → GND, PWM → D13.
- Pico: V+ → VBUS (pin 40), GND → GND, PWM → GP15.
- Raspberry Pi 4: V+ → pin 2 (5 V), GND → pin 6, PWM → pin 12 (GPIO18).
- For more than one servo, use a separate 5 V supply and join its GND to the board's GND.

## Using the driver
```python
from sg92r import SG92R
import time
servo = SG92R(13)
servo.angle(90)   # middle (1.5 ms)
time.sleep(1)
servo.angle(0)    # full left (1 ms)
```

## Gotchas
- If the board resets or browns out when the servo moves, power the servo from its own 5 V supply or add a 470 µF capacitor across V+ and GND.
- 1–2 ms may not give a full 180°; Adafruit suggests trying 0.75–2.25 ms. Widen min_us/max_us in small steps and back off if it buzzes against the end stop.
- Call off() to stop the pulses so a parked servo stops humming and drawing current.

## Datasheet
https://www.towerpro.com.tw/product/sg92r-7/
