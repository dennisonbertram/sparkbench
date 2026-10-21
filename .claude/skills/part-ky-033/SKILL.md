---
name: part-ky-033
description: Pinout, electrical limits, wiring and MicroPython driver for the KY-033 line tracking sensor module (Vishay TCRT5000 reflective IR sensor + LM393 comparator, header G, +V, S). Use when designing, wiring, simulating or writing code for a KY-033 line follower sensor in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# KY-033 line tracking sensor (KY-033)

## Overview
The **KY-033** tells a robot whether it is over a dark line or a light floor. A **Vishay TCRT5000** (950 nm IR LED next to a phototransistor, best at about 2.5 mm, usable 0.2-15 mm) looks down at the surface and an **LM393 comparator** with a sensitivity trimmer turns the reflection into one digital signal. Modelled board: **Joy-IT / Keyes KY-033 line tracking sensor module (SEN-KY033LT, 3-pin header G, +V, S)**.
- **S is HIGH over a black (light-absorbing) line** or with nothing in range; module LED off
- **S is LOW over a white / reflective surface**; module LED on
- Supply: **3.3-5 V**

## Pinout (3-pin header, in board order)
| Pin | Name | Function |
|---|---|---|
| 1 | G | Ground |
| 2 | +V | Supply, 3.3-5 V |
| 3 | S | Signal: 1 = black line / nothing, 0 = white / reflective |

Some clones print the header differently (e.g. S, V, G from the other side): always follow the silkscreen.

## Electrical limits
- Supply 3.3-5 V. S switches up to the supply, so **power it from 3V3 on an ESP32 or Pico**.
- Current roughly 15-25 mA, mostly the always-on IR LED (TCRT5000 LED max 60 mA).
- TCRT5000 ambient range -25 to +85 °C.

## Interface details
Plain digital input, no protocol:
```
S = 1  -> over a black line, or nothing within range (LED off)
S = 0  -> over a white / light surface a few mm away (LED on)
```
The LM393 output is open collector; Joy-IT's examples enable the GPIO's internal pull-up and the driver does too.

## Wiring
| Module | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| G | GND | GND | GND (pin 6) |
| +V | 3V3 | 3V3(OUT) (pin 36) | 3V3 (pin 1) |
| S | GPIO27 | GP15 | GPIO24 (pin 18) |

## Using the driver
```python
from ky033 import KY033
import time
sensor = KY033(27)            # GPIO wired to S
while True:
    print('On line' if sensor.on_line() else 'Off line')
    time.sleep(0.2)
```
`value()` returns S, `on_line()` is True over black, `reflective()` True over white, `irq(handler)` fires on moving onto the line (`on_line=False` for moving off it).

## Gotchas
- **Height matters**: mount the sensor 2-10 mm above the floor. Too high and it always reads "line" (S high).
- **Set the trimmer** so the LED is on over the floor and off over the line.
- "Line" (S high) also means "nothing there", e.g. the robot was lifted.
- Sunlight contains IR and can cause false readings; glossy black tape can look white. Use matte black.
- Powered from 5 V, S can reach 5 V: too much for an ESP32/Pico pin.

## Datasheet
https://www.vishay.com/docs/83760/tcrt5000.pdf (TCRT5000); https://www.ti.com/lit/ds/symlink/lm393.pdf (LM393)
Module and pin order: https://sensorkit.joy-it.net/en/sensors/ky-033 (G, +V, S).
