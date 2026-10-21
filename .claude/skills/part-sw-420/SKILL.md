---
name: part-sw-420
description: Pinout, electrical limits, wiring and MicroPython driver for the SW-420 vibration sensor module (SW-420 roller switch + LM393 comparator, digital output). Use when designing, wiring, simulating or writing code for an SW-420 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# SW-420 vibration sensor module (SW-420)

## Overview
The common blue 3-pin **SW-420 vibration module** carries an SW-420 normally closed roller vibration switch, an **LM393 comparator** and a sensitivity potentiometer.
- **DO is LOW while still and goes HIGH while vibrating** (active high)
- Vibration gives short pulses, not a steady level: the switch opens only for an instant at each shake
- Two LEDs: power, and output
- Supply: **3.3-5 V**, about 15 mA

## Pinout (3-pin header, as printed on the board)
| Pin | Name | Function |
|---|---|---|
| 1 | VCC | Supply, 3.3-5 V |
| 2 | GND | Ground |
| 3 | DO | Digital output: 1 = vibration, 0 = still |

## Electrical limits
- Supply 3.3-5 V (the LM393 accepts 2-36 V; the module is sold for 3.3-5 V).
- DO is the LM393's open-collector output with a **10 kΩ pull-up to VCC**. Powered from 5 V, DO swings to 5 V, which can damage an ESP32 or Pico GPIO. With a 3.3 V board power the module from 3V3.

## Interface details
Plain digital input, no protocol:
```
DO = 0  -> still (switch closed)
DO = 1  -> vibrating (switch momentarily open)
```
No internal pull-up is needed. Because the pulses are brief, catch them with a rising-edge interrupt; the driver does this for you.

## Wiring
| Module | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| VCC | 3V3 | 3V3(OUT) (pin 36) | 3V3 (pin 1) |
| GND | GND | GND | GND (pin 6) |
| DO | GPIO27 | GP15 | GPIO17 (pin 11) |

## Using the driver
```python
from sw420 import SW420
import time
sensor = SW420(27)            # GPIO wired to DO
while True:
    print('Vibration: %s' % ('YES' if sensor.vibrated() else 'no'))
    time.sleep(0.5)
```
`vibrated()` is True if DO is high now or rose since the last call; `vibrating()` gives the current level; `count()` returns how many pulses arrived (a rough measure of how hard it shook).

## Gotchas
- **Do not power from 5 V on a 3.3 V board**: DO is pulled up to VCC.
- **Polling misses shakes**: a knock can be a pulse of a few milliseconds. Use the interrupt-based `vibrated()`/`count()`.
- **Sensitivity**: turn the potentiometer until DO stays low at rest, then tap the board to test.
- It detects shaking and tilting jolts, not how strong they are in g. For that use an accelerometer (MPU6050, ADXL345).

## Datasheet
No formal datasheet exists for the module; comparator datasheet: https://www.ti.com/lit/ds/symlink/lm393.pdf
Module description and schematic notes: https://components101.com/sites/default/files/component_datasheet/Vibration-Sensor-Datasheet.pdf
Pin order: components101 and arduinogetstarted pinouts (VCC, GND, DO).
