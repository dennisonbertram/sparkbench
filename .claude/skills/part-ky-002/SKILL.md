---
name: part-ky-002
description: Pinout, electrical limits, wiring and MicroPython driver for the KY-002 vibration switch module (spring-in-tube shock switch with 10 kΩ pull-up). Use when designing, wiring, simulating or writing code for a KY-002 vibration / shock sensor in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# KY-002 vibration switch module (KY-002)

## Overview
The **KY-002** is a passive vibration (shock) switch from the 37-in-1 sensor kits: a metal tube with a light spring inside it, a 10 kΩ resistor and a 3-pin header. Shaking or knocking the board makes the spring touch the tube for a few milliseconds, which shorts the signal pin to ground. There is no chip, no LED and no sensitivity adjustment; it reports *that* it was shaken, not how hard. Modelled board: **Keyes / Joy-IT KY-002 vibration switch module (SEN-KY002)**, also sold as HW-513.

## Pinout (3-pin header: S, middle +, -)
| Pin | Function |
|---|---|
| S | Signal. Pulled up to + by the on-board 10 kΩ; pulled to GND by the spring during a shake |
| + | Supply for the pull-up (middle pin), 3.3–5 V |
| - | Ground (spring/tube common) |

## Electrical limits
- Supply: 3.3–5 V. S idles at the supply voltage, so **use 3.3 V with an ESP32 or Pico**.
- Current: about 0.33 mA at 3.3 V (0.5 mA at 5 V) only while the contact is closed; zero at rest.
- Purely passive: a mechanical switch plus a resistor.

## Interface details
- Plain digital input, **active low**: S = 1 at rest, S = 0 while the spring touches (Joy-IT's examples enable a pull-up, test `== LOW` and trigger on the falling edge).
- The pulse is short (milliseconds) and bounces: catch it with a falling-edge interrupt and debounce (about 100 ms), don't rely on slow polling.
- No external pull-up needed (10 kΩ fitted between + and S); enabling the GPIO's internal pull-up as well is harmless.

## Wiring
- ESP32: + → 3V3, - → GND, S → GPIO4.
- Pico: + → 3V3(OUT), - → GND, S → GP26.
- Raspberry Pi 4: + → pin 1 (3.3 V), - → pin 6, S → GPIO24 (pin 18).

## Using the driver
```python
from ky002 import KY002
import time
v = KY002(4)               # GPIO wired to S
while True:
    n = v.shakes()          # debounced shakes since last call (IRQ on falling edge)
    if n:
        print('Shake x%d' % n)
    time.sleep_ms(100)
```
`vibrating()` gives the live contact state; `value()` the raw S level.

## Gotchas
- Powered from 5 V, S idles at 5 V: too much for an ESP32/Pico pin.
- Some web pages say "high on vibration"; on the Keyes/Joy-IT board the 10 kΩ goes from + to S and the spring shorts S to -, so it is **low on vibration**. If a clone behaves the other way, measure resistance between S and the middle pin (about 10 kΩ on this board).
- Joy-IT's Pico example uses a pull-down; with this board's own 10 kΩ pull-up that internal pull-down is overridden, so use a pull-up (or none).
- One shake gives several bounces; the driver's debounce merges them into one count.

## Datasheet
https://sensorkit.joy-it.net/en/sensors/ky-002
