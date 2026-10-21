---
name: part-ky-031
description: Pinout, electrical limits, wiring and MicroPython driver for the KY-031 knock sensor module (spring contact with 10 kΩ pull-up). Use when designing, wiring, simulating or writing code for a KY-031 knock / tap / impact sensor in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# KY-031 knock sensor module (KY-031)

## Overview
The **KY-031** is a passive knock (tap, impact) sensor from the 37-in-1 sensor kits: a light coiled spring around a metal post, a 10 kΩ resistor and a 3-pin header. A knock makes the spring touch the post for a few milliseconds, which shorts the signal pin to ground. There is no chip, no LED and no sensitivity adjustment; it reports *that* a knock happened, not how hard. Modelled board: **Keyes / Joy-IT KY-031 knock sensor module (SEN-KY031KS)**.

## Pinout (3-pin header: S, middle +, -)
| Pin | Function |
|---|---|
| S | Signal. Pulled up to + by the on-board 10 kΩ; pulled to GND by the spring during a knock |
| + | Supply for the pull-up (middle pin, unlabeled or "+" on most boards), 3.3–5 V |
| - | Ground (spring contact's common) |

## Electrical limits
- Supply: 3.3–5 V. S idles at the supply voltage, so **use 3.3 V with an ESP32 or Pico**.
- Current: about 0.33 mA at 3.3 V (0.5 mA at 5 V) only while the contact is closed; zero at rest.
- Purely passive: a mechanical switch plus a resistor.

## Interface details
- Plain digital input, **active low**: S = 1 at rest, S = 0 while the spring touches (Joy-IT's examples test `== LOW` / trigger on the falling edge).
- The pulse is short (milliseconds) and bounces: catch it with a falling-edge interrupt and debounce (about 100 ms), don't rely on slow polling.
- No external pull-up needed (10 kΩ fitted); enabling the GPIO's internal pull-up as well is harmless.

## Wiring
- ESP32: + → 3V3, - → GND, S → GPIO4.
- Pico: + → 3V3(OUT), - → GND, S → GP18.
- Raspberry Pi 4: + → pin 1 (3.3 V), - → pin 6, S → GPIO24 (pin 18).

## Using the driver
```python
from ky031 import KY031
import time
k = KY031(4)               # GPIO wired to S
while True:
    n = k.knocks()          # debounced knocks since last call (IRQ on falling edge)
    if n:
        print('Knock x%d' % n)
    time.sleep_ms(100)
```
`knocking()` gives the live contact state; `value()` the raw S level.

## Gotchas
- Powered from 5 V, S idles at 5 V: too much for an ESP32/Pico pin.
- Some web tutorials describe the output as "high on knock"; on the Keyes/Joy-IT board the pull-up is to + and the spring goes to -, so it is **low on knock**. If a clone triggers constantly, check which outer pin is ground with a meter.
- One knock gives several bounces; the driver's debounce merges them into one count.
- It is very sensitive to how it is mounted: fix it firmly to the surface you want to sense.

## Datasheet
https://sensorkit.joy-it.net/en/sensors/ky-031
