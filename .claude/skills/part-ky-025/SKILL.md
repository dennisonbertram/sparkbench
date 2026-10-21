---
name: part-ky-025
description: Pinout, electrical limits, wiring and MicroPython driver for the KY-025 reed switch magnetic sensor module (reed contact + LM393 comparator, AO + DO). Use when designing, wiring, simulating or writing code for a KY-025 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# KY-025 reed switch module (KY-025)

## Overview
The **KY-025** is a small black 4-pin module from the 37-in-1 / 40-in-1 sensor kits, for example the **Joy-IT SensorKit KY-025**. It carries a glass **reed contact** (two springy contacts that touch when a magnet comes near), an **LM393 comparator**, a blue trimmer (threshold), a power LED (LED1) and a "magnet" LED (LED2).
- **DO** goes **HIGH while a magnet is near** (contact closed, LED2 lit) and is LOW otherwise.
- **AO** is the voltage across the reed contact: close to the supply with no magnet, near 0 V with a magnet (Joy-IT: the signal is inverted). A reed switch is on/off, so AO is really only two levels.
- Typical uses: door/window open sensors, counting turns of a wheel with a magnet, end-stops.

## Pinout (module header, as printed on the board)
| Pin | Name | Function |
|-----|------|----------|
| 1 | AO | Analog output (reed node), optional |
| 2 | G | Ground |
| 3 | + | Supply, 3.3–5 V |
| 4 | DO | Digital output, HIGH = magnet detected |

## Electrical limits
- Supply: **3.3–5 V** (Joy-IT wires it to 5 V on Arduino and 3.3 V on Raspberry Pi / Pico). The LM393 itself runs on 2–36 V.
- Current: a few mA, mostly the LEDs.
- AO and DO swing up to the supply. **On an ESP32, Pico or Raspberry Pi, power + from 3.3 V.**
- Glass reed tube: do not bend its leads close to the glass, it cracks.

## Interface details
Plain digital input, no protocol:
```
DO = 1  -> magnet near (reed closed, LED2 on)
DO = 0  -> no magnet
```
DO has the module's pull-up; no internal pull is needed. If DO does not change, turn the trimmer until LED2 follows the magnet.

## Wiring
| Module | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| + | 3V3 | 3V3(OUT) (pin 36) | 3.3 V (pin 1) |
| G | GND | GND | GND (pin 6) |
| DO | any GPIO, e.g. GPIO25 | any GP, e.g. GP18 | any GPIO, e.g. GPIO24 (pin 18) |
| AO (optional) | GPIO32–39 (ADC1) | GP26/27/28 (ADC) | needs an external ADC (e.g. KY-053) |

## Using the driver
```python
from ky025 import KY025
import time
reed = KY025(25)          # DO GPIO; KY025(25, ao=32) also reads AO
while True:
    print('Magnet: %s' % ('YES' if reed.magnet() else 'no'))
    time.sleep(0.5)
```
`magnet()` is True while DO is HIGH; `voltage()` returns the AO voltage when an AO pin was given.

## Gotchas
- **5 V supply + 3.3 V board** puts 5 V on the GPIO. Use 3.3 V.
- The reed only reacts to a magnet held **along** the tube; a magnet side-on at the middle may not close it. Try a few centimetres away, then closer.
- Reed contacts bounce for a millisecond or so when they close: debounce if you count pulses.
- Not a field-strength sensor. For how strong the field is, use a Hall sensor (KY-035 / SS49E).

## Datasheet
https://www.ti.com/lit/ds/symlink/lm393.pdf (LM393 comparator). Module documentation and pin order: https://sensorkit.joy-it.net/en/sensors/ky-025
