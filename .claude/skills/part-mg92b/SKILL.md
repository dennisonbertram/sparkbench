---
name: part-mg92b
description: Pinout, electrical limits, wiring and MicroPython driver for the MG92B metal-gear digital micro servo (TowerPro MG92B, Adafruit #2307). Use when designing, wiring, simulating or writing code for an MG92B in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MG92B metal-gear micro servo (MG92B)

## Overview
The **TowerPro MG92B** is a 14 g digital micro servo with metal gears, two ball bearings and an alloy middle case. It turns about 180° (90° each way from the middle) to the angle set by a pulse on its signal wire, and holds that angle. Stall torque is 3.1 kgf·cm at 5 V and 3.5 kgf·cm at 6 V; speed 0.13 s/60° at 5 V (0.08 s/60° at 6 V). Hobbyists buy it as **Adafruit Micro Servo - MG92B (#2307)**: the bare servo with a 25 cm 3-wire lead ending in a female 2.54 mm JR/Futaba connector, plus horns and screws.

## Pinout (3-wire lead, connector order)
| Pin | Wire | Function |
|---|---|---|
| GND | Brown | Ground |
| V+ | Red | Supply, 5.0–6.6 V |
| PWM | Orange (yellow on some leads) | Control pulse, 50 Hz |

## Electrical limits
- Supply: 5.0–6.6 V (TowerPro). Do not run it from 3.3 V.
- Current: a few hundred mA moving. Stall current is not published; plan for about 1 A and use a separate supply for real loads.
- Signal: Adafruit says this servo requires 5 V signals. A 3.3 V pulse may or may not be recognised; if not, buffer it with a 74AHCT125 (or similar) powered from 5 V.
- Temperature: 0–55 °C.

## Interface details
- 50 Hz frame (20 ms period); pulse width sets the angle.
- 1.5 ms = middle ("0"), ~1 ms = full left ("-90"), ~2 ms = full right ("+90").
- Dead band 1 µs.
- No mechanical end stops. Adafruit suggests 0.75–2.25 ms if 1–2 ms does not give a full 180°.
- Driver angle scale 0–180°: pulse = 1000 + 1000 × angle / 180 µs; duty_u16 = pulse_us × 65535 / 20000.

## Wiring
- ESP32: V+ → 5 V supply (VIN for a light load), GND → GND, PWM → GPIO 13 (via a 5 V buffer if needed).
- Pico: V+ → VBUS (pin 40) or a separate 5 V supply, GND → GND, PWM → GP15.
- Raspberry Pi 4: V+ → a 5 V supply, GND → pin 6, PWM → pin 12 (GPIO18).
- Join the servo supply's GND to the board's GND.

## Using the driver
```python
from mg92b import MG92B
import time
servo = MG92B(13)
servo.angle(90)   # middle (1.5 ms)
time.sleep(1)
servo.angle(0)    # full left (1 ms)
servo.off()       # stop pulses, servo goes limp
```

## Gotchas
- If the servo does nothing or jitters on a 3.3 V board, the signal level is the likely cause: add a 3.3 V → 5 V buffer.
- If the board resets when the servo moves, power it from its own 5–6 V supply or add a 470 µF capacitor across V+ and GND.
- Without end stops it can be driven past its useful range by too-wide pulses; widen min_us/max_us in small steps.

## Datasheet
https://www.towerpro.com.tw/product/mg92b/ (vendor details: https://www.adafruit.com/product/2307)
