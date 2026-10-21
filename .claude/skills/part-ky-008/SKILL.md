---
name: part-ky-008
description: Pinout, electrical limits, wiring and MicroPython code for the KY-008 laser transmitter module (650 nm red laser diode, also sold as HW-493). Use when designing, wiring, simulating or writing code for a KY-008 laser in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# KY-008 laser transmitter module (KY-008)

## Overview
The **KY-008** is a 6 mm, **650 nm red laser diode** (about **5 mW**, Class 3R / IIIa) with an on-board current-limiting resistor on an 18.5 x 15 mm board. Drive S high and it shines a red dot; drive it low and it goes off. Hobbyists buy it as the **Keyes / HW-493 KY-008 laser transmitter module** in the 37-in-1 sensor kits, often paired with a laser receiver for a tripwire.

## Pinout (KY-008 module, header order)
| Pin | Function |
|---|---|
| S | Signal: high = laser on, low = off. Also powers the laser. |
| (middle) | Unlabelled; VCC on some variants. Leave unconnected. |
| - | Ground |

## Electrical limits
- 5 V nominal on S; works at 3.3 V GPIO level with a dimmer beam. Never more than 5 V.
- Current under 40 mA, drawn from the GPIO driving S.
- Working temperature -10 to 40 C.

## Interface details
- Plain digital output: `Pin.value(1)` = on, `Pin.value(0)` = off. No driver needed.
- PWM on S gives a brightness change, but near threshold the diode flickers or cuts out.

## Wiring
- ESP32: S -> D25, - -> GND, middle unconnected.
- Pico: use an NPN transistor (2N2222, 1 kOhm base resistor from GP2): S -> 5 V (VBUS), - -> collector, emitter -> GND. A Pico pin is rated for about 12 mA.
- Raspberry Pi 4: same transistor circuit, base resistor from pin 18 (GPIO24), S -> pin 2 (5 V).

## Using it
```python
from machine import Pin
import time
laser = Pin(25, Pin.OUT, value=0)  # S
laser.value(1)   # on
time.sleep(0.5)
laser.value(0)   # off
```

## Gotchas
- Laser safety: never look into the beam or aim it at eyes or shiny surfaces. The blink reflex is not reliable protection.
- If the laser never switches off, the middle pin is probably tied to 5 V on your variant: disconnect it.
- If S and - alone give no light, your variant may need the middle pin; check the silkscreen.
- Dim dot on a 3.3 V board is normal; for full brightness switch it from 5 V through a transistor.
- Long continuous runs shorten diode life; switch it off when not needed.

## Datasheet
No manufacturer datasheet exists for this generic module; specifications and pinout from https://arduinomodules.info/ky-008-laser-transmitter-module/
