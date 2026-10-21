---
name: part-float-switch
description: Pinout, electrical limits, wiring and MicroPython driver for a vertical float switch (ZP4510-type PP water level switch). Use when designing, wiring, simulating or writing code for a float switch / water level switch in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Vertical float switch (ZP4510-type PP water level switch)

## Overview
A **vertical float switch** is a plastic stem with a **reed switch** sealed inside and a hollow **float** carrying a ring magnet that slides up and down the stem. When the liquid lifts the float to the switching point the magnet operates the reed. Screw it through a hole in the tank lid or base (M10 thread, nut and gasket supplied). There is no chip and no supply: it is just two wires. Hobbyists buy it as the **generic ZP4510 PP vertical float switch**: white polypropylene, about 45-57 mm long, M10 thread, two leads of about 35 cm with bare ends.

## Pinout (two wires, not polarised)
| Wire | Function |
|---|---|
| GND | Either wire: connect to ground |
| SIG | The other wire: connect to a GPIO with the internal pull-up on |

## Electrical limits
- Seller ratings: **10 W** max, **100 V DC** max switching voltage, **0.5 A** max switching current, 1.0 A carry, 100 mOhm contact resistance, about -10 to +80 C.
- Ratings are for resistive loads: do **not** run a pump or solenoid through it, use a relay or MOSFET.
- At a 3.3 V GPIO with the internal pull-up only microamps flow, far inside the rating.

## Interface details
- Plain on/off switch. With SIG pulled up: **0 = contacts closed, 1 = contacts open**.
- Which float position closes the contacts depends on which way round the float sits on the stem. Most units ship **normally open**: open when dry (float down), **closed when water lifts the float**. Remove the clip and flip the float 180 degrees to reverse it. Mounting the switch upside down (from the tank bottom) also reverses it.
- Check yours once with a multimeter; the driver's `closed_when_high=False` handles the reversed case.
- The float bobs on ripples and the reed bounces: the driver waits for 50 ms of stable level.

## Wiring
- ESP32: GND wire -> GND, SIG wire -> GPIO4 (internal pull-up on).
- Pico: GND wire -> GND, SIG wire -> GP15 (internal pull-up on).
- Raspberry Pi 4: GND wire -> pin 6, SIG wire -> GPIO17 (pin 11) with the internal pull-up.

## Using the driver
```python
from float_switch import FloatSwitch
import time
level = FloatSwitch(4)    # GPIO wired to SIG, internal pull-up on
while True:
    print('WATER=%s' % ('HIGH' if level.is_high() else 'LOW'))
    time.sleep(0.5)
```
`level.irq(handler)` calls `handler(pin)` on every change (expect several calls per change: debounce in the handler).

## Gotchas
- Readings reversed? The float is on the other way round (or the switch is bottom-mounted): flip the float or pass `closed_when_high=False`.
- Random readings: the pull-up is missing; the switch only connects to ground, it never drives high.
- Keep the electronics out of the water: only the stem goes in the tank, seal the thread with the gasket.
- Use two switches (low and high) with hysteresis in code for pump control so the pump does not chatter.
- Scale, algae or a stuck float give a permanent reading; clean the stem now and then.

## Datasheet
https://www.hobbyelectronica.nl/en/product/water-level-switch/
