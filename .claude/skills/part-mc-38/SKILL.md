---
name: part-mc-38
description: Pinout, electrical limits, wiring and MicroPython driver for the MC-38 magnetic door/window switch (reed switch + magnet). Use when designing, wiring, simulating or writing code for an MC-38 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MC-38 magnetic door/window switch (MC-38)

## Overview
The **MC-38** is a wired alarm contact: a **reed switch** in a white plastic case plus a matching **magnet** in a second case. Screw the switch to the frame and the magnet to the door or window. While the magnet is next to the switch (door shut) the contacts are **closed**; open the door and they **open**. Alarm makers call this an "N.C." contact (closed in the normal, shut state). There is no chip and no supply: it is just two wires. Hobbyists buy it as the **generic MC-38 wired door/window sensor**, white ABS, about 30 cm of two-core lead with bare ends.

## Pinout (two wires, not polarised)
| Wire | Function |
|---|---|
| GND | Either wire: connect to ground |
| SIG | The other wire: connect to a GPIO with the internal pull-up on |

## Electrical limits
- Contact rating (MC-38 datasheet): **100 mA, 200 V DC, 3 W** max. Some sellers quote 0.5 A / 100 V: stay under the lower figure.
- Operating gap: closes with the magnet within about **15 mm**, opens beyond about **25 mm**.
- At a 3.3 V GPIO with the internal pull-up only microamps flow, far inside the rating.

## Interface details
- Plain on/off switch. With SIG pulled up: **0 = magnet near (door shut), 1 = magnet away (door open)**.
- The pin **needs a pull-up**: use `Pin.PULL_UP`, or a 10 kOhm resistor to **3.3 V** for long cable runs.
- Reed contacts bounce for about a millisecond when they move: the driver debounces (20 ms).
- Long leads pick up noise: twisted pair, a 100 nF capacitor from SIG to GND, or a stronger pull-up (4.7-10 kOhm) helps.

## Wiring
- ESP32: GND wire -> GND, SIG wire -> GPIO4 (internal pull-up on).
- Pico: GND wire -> GND, SIG wire -> GP15 (internal pull-up on).
- Raspberry Pi 4: GND wire -> pin 6, SIG wire -> GPIO17 (pin 11) with the internal pull-up.

## Using the driver
```python
from mc38 import MC38
import time
door = MC38(4)            # GPIO wired to SIG, internal pull-up on
while True:
    print('DOOR=%s' % ('CLOSED' if door.is_closed() else 'OPEN'))
    time.sleep(0.5)
```
`door.irq(handler)` calls `handler(pin)` when the door opens (rising edge).

## Gotchas
- Readings reversed from what you expect? Remember the logic: shut door = contacts closed = pin reads **0**.
- Random readings: the pull-up is missing (the switch only connects to ground, it never drives high).
- Mount the magnet's side mark next to the switch's, parallel and within 15 mm; steel frames weaken the field.
- The glass reed inside breaks if the case is dropped or over-tightened; a dead switch reads 1 forever.
- Do not switch mains or motors through it directly: 100 mA / 3 W max.

## Datasheet
https://aws.robu.in/wp-content/uploads/2017/04/Datasheet-MC-38-final-1.pdf
