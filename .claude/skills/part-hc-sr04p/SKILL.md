---
name: part-hc-sr04p
description: Pinout, electrical limits, wiring and MicroPython driver for the HC-SR04P 3-5.5 V ultrasonic distance sensor (RCWL-9610 controller, HC-SR04 compatible Trig/Echo). Use when designing, wiring, simulating or writing code for an HC-SR04P in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# HC-SR04P ultrasonic distance sensor (HC-SR04P)

## Overview
The **HC-SR04P** is the 3.3 V-friendly version of the classic HC-SR04. Its RCWL-9610 controller runs on 3–5.5 V and, in its default GPIO mode, behaves exactly like an HC-SR04: a 10 µs pulse on **Trig** starts a measurement, the module sends eight 40 kHz pulses and holds **Echo** high for the sound's round-trip time. Range about 2–400 cm at 3.3 V (about 450 cm at 5 V), ±3 mm, 15° beam. Modelled here: the common **HC-SR04P 3-5.5 V module (blue board, 4-pin header VCC, Trig, Echo, GND)**.

## Pinout (header order)
| Pin | Function |
|---|---|
| VCC | Supply, 3–5.5 V |
| Trig | Trigger input, 10 µs high pulse starts a reading |
| Echo | Echo output, high for the round-trip time; swings to VCC |
| GND | Ground |

## Electrical limits
- Supply: 3–5.5 V (RCWL-9610 chip: 2.8–5.5 V, I/O tolerant to 5.5 V).
- Current: about 2 mA idle, up to about 15 mA while ranging.
- Echo high level = VCC: powered from 5 V it needs a divider (1 kΩ / 2 kΩ) before a 3.3 V GPIO.

## Interface details
- Trig: at least 10 µs high.
- Distance: cm = echo µs / 58 (datasheet, 340 m/s); 58.3 at 20 °C (343 m/s). Inches = µs / 148.
- Measurement cycle: at least 60 ms between triggers.
- Blind zone below 2 cm; past the maximum range no valid echo comes back (use a timeout).

## Wiring
- ESP32: VCC → 3V3, GND → GND, Trig → GPIO25, Echo → GPIO26.
- Pico: VCC → 3V3(OUT), GND → GND, Trig → GP2, Echo → GP3.
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, Trig → GPIO23 (pin 16), Echo → GPIO24 (pin 18).

## Using the driver
```python
from hcsr04p import HCSR04P
s = HCSR04P(trig=25, echo=26)
print(s.distance_cm())   # float cm, or None when no valid echo
```

## Gotchas
- On 3.3 V the range shrinks to about 400 cm (some modules less); use 5 V plus an Echo divider for the full range.
- Soft, small or angled targets may return no echo; aim at a flat surface of at least 0.5 m².
- Triggering faster than every 60 ms lets a late echo corrupt the next reading.
- Several sensors firing at once hear each other; trigger them in turn.

## Datasheet
https://www.mikrocontroller.net/attachment/618319/RCWL-9610-V3.0.pdf (RCWL-9610 controller); timing per the HC-SR04 sheet https://cdn.sparkfun.com/datasheets/Sensors/Proximity/HCSR04.pdf
