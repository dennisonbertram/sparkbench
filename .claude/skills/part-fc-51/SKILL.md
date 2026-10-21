---
name: part-fc-51
description: Pinout, electrical limits, wiring and MicroPython driver for the FC-51 IR obstacle avoidance sensor module (IR LED + receiver + LM393 comparator, digital output). Use when designing, wiring, simulating or writing code for an FC-51 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# FC-51 IR obstacle avoidance sensor (FC-51)

## Overview
The **FC-51** is the common blue 3-pin infrared obstacle module. An IR LED shines forward and an IR receiver next to it picks up the light reflected by anything in front. An **LM393 comparator** compares that signal with a threshold set by the on-board potentiometer and gives a clean digital output.
- **OUT goes LOW when an obstacle is detected**, HIGH when clear (active low)
- Detection distance about **2-30 cm**, adjustable with the potentiometer; detection angle about 35°
- Two indicator LEDs: power, and obstacle (lights while detecting)
- Supply: **3.3-5 V**

## Pinout (3-pin header, as printed on the board)
| Pin | Name | Function |
|---|---|---|
| 1 | OUT | Digital output: 0 = obstacle, 1 = clear |
| 2 | GND | Ground |
| 3 | VCC | Supply, 3.3-5 V |

Note the order: **OUT is first and VCC last**, unlike many modules.

## Electrical limits
- Supply 3.3-5 V (the LM393 itself accepts 2-36 V; the module's LEDs and resistors are sized for 3.3-5 V).
- OUT is the LM393's open-collector output with a **10 kΩ pull-up to VCC**. Powered from 5 V, OUT swings to 5 V, which can damage an ESP32 or Pico GPIO. With a 3.3 V board power the module from 3V3.
- The LM393 sinks at least 6 mA at 1.5 V (TI datasheet), plenty for a GPIO input.
- Draws roughly 20 mA, mostly the IR LED and indicator LEDs.

## Interface details
Plain digital input, no protocol:
```
OUT = 0  -> obstacle within range
OUT = 1  -> clear
```
No internal pull-up is needed (the board has one). Use a falling-edge interrupt to react the moment something appears.

## Wiring
| Module | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| OUT | GPIO27 | GP15 | GPIO17 (pin 11) |
| GND | GND | GND | GND (pin 6) |
| VCC | 3V3 | 3V3(OUT) (pin 36) | 3V3 (pin 1) |

## Using the driver
```python
from fc51 import FC51
import time
sensor = FC51(27)            # GPIO wired to OUT
while True:
    print('Obstacle: %s' % ('YES' if sensor.obstacle() else 'no'))
    time.sleep(0.5)
```
`obstacle()` is True while something is in front; `raw()` returns the pin level; `irq(handler)` calls `handler(pin)` when an obstacle appears (`on_detect=False` for when it goes away).

## Gotchas
- **Do not power from 5 V on a 3.3 V board**: OUT is pulled up to VCC.
- **Range setting**: turn the potentiometer until the obstacle LED is off with nothing in front, then test with your target at the wanted distance.
- **Dark or matte objects** reflect little IR and may not be detected; glossy ones are seen further away.
- **Sunlight** and incandescent bulbs contain IR and can cause false triggers outdoors or near windows.
- It gives on/off only, not a distance. For a distance in cm use an ultrasonic (HC-SR04) or time-of-flight (VL53L0X) sensor.

## Datasheet
No formal datasheet exists for the module; comparator datasheet: https://www.ti.com/lit/ds/symlink/lm393.pdf
Pin order: Fritzing core part fc-51-IR-Sensor.fzp (OUT, GND, VCC).
