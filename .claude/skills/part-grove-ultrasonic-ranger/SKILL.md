---
name: part-grove-ultrasonic-ranger
description: Pinout, electrical limits, wiring and MicroPython driver for the Seeed Grove - Ultrasonic Ranger v2.0 (SKU 101020010), a single-pin (SIG) trigger/echo ultrasonic distance sensor. Use when designing, wiring, simulating or writing code for a Grove Ultrasonic Ranger in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Grove - Ultrasonic Ranger (Seeed 101020010)

## Overview
The **Grove - Ultrasonic Ranger** from Seeed measures distance from 2 to 350 cm (1 cm resolution, 40 kHz, about 15° beam). Unlike the HC-SR04 it has **one signal pin (SIG) for both trigger and echo**. The on-board MCU has a 10 kΩ pull-down on SIG. Version 2.0 (2017) runs from 3.2–5.2 V and works with 3.3 V systems.

## Pinout (Grove connector, pin 1 to 4)
| Pin | Function |
|---|---|
| SIG | Trigger in / echo out (yellow wire) |
| NC | Not connected (white wire) |
| VCC | Supply, 3.2–5.2 V (red wire) |
| GND | Ground (black wire) |

## Electrical limits
- Supply: 3.2–5.2 V, about 8 mA.
- SIG's high level is VCC. Power the sensor from **3.3 V** on ESP32 / Pico. 5 V would overdrive the GPIO.
- Do not hot-plug the sensor. Seeed warns that this can damage it.

## Interface details
- Set SIG as an output and hold it high for **≥ 10 µs**, then pull it low and switch it to an input.
- The module sends eight 40 kHz cycles and then drives SIG high for the round-trip time of the sound.
- Distance = high time × 340 m/s / 2, so **cm = µs / 58.8**. Seeed's Arduino library uses µs / 29 / 2.
- No echo within about 30 ms means nothing is in range. Leave about 60 ms between readings.

## Wiring
- ESP32: VCC → 3V3, GND → GND, SIG → GPIO25 (any free GPIO).
- Pico: VCC → 3V3(OUT), GND → GND, SIG → GP2.
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, SIG → any GPIO. Timing in Python on Linux is coarse.

## Using the driver
```python
from grove_ultrasonic import GroveUltrasonicRanger
sensor = GroveUltrasonicRanger(25)
d = sensor.distance_cm()   # float cm, or None if out of range
print('D=%dcm' % round(d) if d is not None else 'out of range')
```

## Gotchas
- The trigger and the echo share the pin, so the code must switch SIG to input right after the trigger. Otherwise the board holds the line and misses the echo.
- Aim it at a flat target of at least 0.5 m². Soft or angled surfaces give weak or no echoes.
- Grove cables use 2 mm connectors. On a breadboard, use a Grove-to-jumper cable.

## Datasheet
https://wiki.seeedstudio.com/Grove-Ultrasonic_Ranger/ (schematic: https://files.seeedstudio.com/wiki/Grove_Ultrasonic_Ranger/res/Grove_Ultrasonic%20Ranger%20Schematic.pdf)
