---
name: part-yf-s201
description: Pinout, electrical limits, wiring and MicroPython driver for the YF-S201 1/2" Hall-effect water flow sensor (pulse output, 7.5 Hz per L/min). Use when designing, wiring, simulating or writing code for a YF-S201 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# YF-S201 water flow sensor (YF-S201)

## Overview
The **YF-S201** is a 1/2" (G1/2) inline water flow meter: water spins a small turbine with a magnet, and a Hall-effect sensor gives one pulse per step of the rotor. The pulse frequency is proportional to flow: **F (Hz) = 7.5 × Q (L/min)**, about **450 pulses per litre**, for 1–30 L/min (±10 %). Hobbyists buy the black plastic YF-S201 body with a three-wire lead (red, black, yellow).

## Pinout (lead order: red, black, yellow)
| Pin | Wire | Function |
|---|---|---|
| VCC | Red | Supply, 4.5–18 V (use 5 V) |
| GND | Black | Ground |
| OUT | Yellow | Pulse output (open collector): pull-up to 5 V, then a divider to the GPIO |

## Electrical limits
- Supply: 5–18 V DC (tested down to 4.5 V); some sellers quote up to 24 V, stay at or below 18 V.
- Current: 15 mA max at 5 V. Output load: 10 mA or less.
- Output: high > 4.5 V and low < 0.5 V with a 5 V supply and pull-up; duty 50 % ±10 %; rise 0.04 µs, fall 0.18 µs.
- Flow 1–30 L/min, water pressure ≤ 2.0 MPa, -25 to +80 °C.

## Interface details
- No protocol: count rising edges on OUT with an interrupt.
- Q (L/min) = pulses per second / 7.5. Volume (L) = pulses / 450.
- The Hall output only pulls low, and its rated high level (> 4.5 V) is measured with a pull-up to 5 V. On an ESP32/Pico pull OUT up to 5 V with **4.7 kΩ** and feed the GPIO through a **10 kΩ / 20 kΩ divider** (10 kΩ OUT → pin, 20 kΩ pin → GND): about 2.9 V high. The divider keeps the pin at or below 3.3 V even if your sensor has its own pull-up or a push-pull output, so never wire OUT straight to a 3.3 V GPIO.
- The 7.5 factor is nominal (±10 %, varies with flow, pressure and orientation). Calibrate by filling a known volume.

## Wiring
- ESP32: red → 5V (VIN), black → GND, yellow → 4.7 kΩ to 5V and 10 kΩ to GPIO4, 20 kΩ from GPIO4 to GND.
- Pico: red → VBUS (5 V), black → GND, yellow → 4.7 kΩ to VBUS and 10 kΩ to GP15, 20 kΩ from GP15 to GND.
- Raspberry Pi 4: red → pin 2 (5 V), black → pin 6, yellow → 4.7 kΩ to pin 2 and 10 kΩ to GPIO17 (pin 11), 20 kΩ from GPIO17 to GND.

## Using the driver
```python
from yfs201 import YFS201
meter = YFS201(4)
while True:
    print('FLOW=%.1f L/min TOTAL=%.2f L' % (meter.flow(1000), meter.litres()))
```

## Gotchas
- Reads 0 with water flowing: check the arrow on the body (flow direction) and that the pull-up is fitted.
- Below about 1 L/min the turbine may not turn at all.
- Readings are only ±10 %: calibrate k = pulses / litres / 60 for your installation.
- Do not run it from 3.3 V: the minimum supply is 4.5 V.

## Datasheet
https://wiki.seeedstudio.com/G1_and_2_inch_Water_Flow_Sensor/
