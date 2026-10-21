---
name: part-yf-s401
description: Pinout, electrical limits, wiring and MicroPython driver for the YF-S401 small hall-effect water flow sensor (0.3-6 L/min, pulse output, F = 98 x Q). Use when designing, wiring, simulating or writing code for a YF-S401 flow meter in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# YF-S401 water flow sensor (YF-S401)

## Overview
The **YF-S401** is a small PVC water flow meter for 6 mm (1/4 in) hose. Water spins a magnetic rotor past a hall-effect sensor, and the signal wire gives a square wave whose frequency follows the flow: **F = 98 x Q** Hz with Q in L/min (+/- 2 %), i.e. **5880 pulses per litre**. Rated 0.3-6 L/min.

## Pinout (flying leads)
| Wire | Pin | Function |
|---|---|---|
| Red | VCC | Supply, DC 5-24 V (4.5 V minimum) |
| Yellow | OUT | Pulse output, 50 % +/- 10 % duty |
| Black | GND | Ground |

## Electrical limits
- Supply: DC 4.5/5-24 V, up to 15 mA at 5 V.
- Output high > 4.7 V at a 5 V supply (about the supply level), low < 0.5 V; load <= 10 mA.
- Liquid up to 120 C, pressure <= 1.75 MPa; mount within 5 degrees of vertical.

## Interface details
- Count rising edges; Q [L/min] = pulses per second / 98; litres = pulses / 5880.
- Below about 0.3 L/min the rotor may not turn. Calibrate the 98 factor with a jug for accurate volumes.

## Wiring
- **The signal swings to the supply (about 5 V). Never wire it straight to a 3.3 V GPIO.** Use a divider (10 kOhm OUT -> GPIO, 20 kOhm GPIO -> GND) or a level shifter.
- ESP32: VCC -> 5V/VIN, GND -> GND, OUT -> divider -> GPIO25.
- Pico: VCC -> VBUS, GND -> GND, OUT -> divider -> GP2.
- Raspberry Pi 4: VCC -> pin 2 (5 V), GND -> pin 6, OUT -> divider -> GPIO17 (pin 11).

## Using the driver
```python
from yfs401 import YFS401
sensor = YFS401(25)
while True:
    print('Q=%.1f L/min' % sensor.flow(1000))
```

## Gotchas
- Readings too high or noisy: air bubbles, or the sensor not vertical.
- No pulses at all: flow below about 0.3 L/min, or flow against the arrow.
- Total volume drifts: the +/- 2 % K factor; calibrate it.

## Datasheet
https://iarduino.ru/lib/2377bf7550064248856024f6728d7cc3.pdf
