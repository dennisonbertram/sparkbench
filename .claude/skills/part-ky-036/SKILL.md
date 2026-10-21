---
name: part-ky-036
description: Pinout, electrical limits, wiring and MicroPython driver for the KY-036 metal touch sensor module (touch transistor + LM393 comparator, AO + DO). Use when designing, wiring, simulating or writing code for a KY-036 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# KY-036 metal touch sensor module (KY-036)

## Overview
The **KY-036** is a small black 4-pin module from the 37-in-1 / 40-in-1 sensor kits, for example the **Joy-IT SensorKit KY-036**. At its front sits a transistor with one long bent lead: that metal tip is the touch pad. Touching it lets a tiny current from your finger switch the transistor on. An **LM393 comparator** compares the result with a blue trimmer (sensitivity), and the board has a power LED (LED1) and a "touched" LED (LED2).
- **DO** goes **HIGH while the tip is touched** (LED2 lit) and is LOW otherwise.
- **AO** is the sensor node voltage. It is inverted (Joy-IT): it is higher when nobody touches the tip and lower while it is touched.
- Typical uses: a touch button, a "someone touched the metal" alarm, simple interactive toys.

## Pinout (module header, as printed on the board)
| Pin | Name | Function |
|-----|------|----------|
| 1 | AO | Analog output (sensor node), optional |
| 2 | G | Ground |
| 3 | + | Supply, 3.3–5 V |
| 4 | DO | Digital output, HIGH = touched |

## Electrical limits
- Supply: **3.3–5 V** (Joy-IT wires it to 5 V on Arduino and 3.3 V on Raspberry Pi / Pico). The LM393 itself runs on 2–36 V.
- Current: a few mA, mostly the LEDs.
- AO and DO swing up to the supply. **On an ESP32, Pico or Raspberry Pi, power + from 3.3 V.**

## Interface details
Plain digital input, no protocol:
```
DO = 1  -> tip touched (LED2 on)
DO = 0  -> not touched
```
DO has the module's pull-up; no internal pull is needed. Your body also picks up mains hum, so on a real module DO often **flickers at 50/60 Hz** while touched instead of staying HIGH. The driver's `touched()` watches DO for 40 ms and reports a touch if it was HIGH at any moment.

## Wiring
| Module | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| + | 3V3 | 3V3(OUT) (pin 36) | 3.3 V (pin 1) |
| G | GND | GND | GND (pin 6) |
| DO | any GPIO, e.g. GPIO25 | any GP, e.g. GP18 | any GPIO, e.g. GPIO24 (pin 18) |
| AO (optional) | GPIO32–39 (ADC1) | GP26/27/28 (ADC) | needs an external ADC (e.g. KY-053) |

## Using the driver
```python
from ky036 import KY036
import time
touch = KY036(25)          # DO GPIO; KY036(25, ao=32) also reads AO
while True:
    print('Touch: %s' % ('YES' if touch.touched() else 'no'))
    time.sleep(0.5)
```
`touched()` is True if DO was HIGH during the 40 ms window; `raw()` is the instant DO level; `voltage()` returns the AO voltage when an AO pin was given.

## Gotchas
- **5 V supply + 3.3 V board** puts 5 V on the GPIO. Use 3.3 V.
- If LED2 never lights or stays on, turn the trimmer slowly until it just stays off when untouched.
- Reading DO once can miss a touch because of the mains-hum flicker; sample over a few milliseconds (as `touched()` does).
- It needs bare skin on the metal lead; gloves or a battery-powered laptop on your lap can make it less sensitive. For a cleaner touch button use a TTP223 capacitive module.

## Datasheet
https://www.ti.com/lit/ds/symlink/lm393.pdf (LM393 comparator). Module documentation and pin order: https://sensorkit.joy-it.net/en/sensors/ky-036
