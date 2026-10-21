---
name: part-sw-520d
description: Pinout, electrical limits, wiring and MicroPython driver for the SW-520D tilt sensor module (SW-520D ball tilt switch + LM393 comparator, digital output). Use when designing, wiring, simulating or writing code for an SW-520D in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# SW-520D tilt sensor module (SW-520D)

## Overview
The common blue 3-pin **SW-520D tilt module** carries a gold SW-520D ball tilt switch, an **LM393 comparator** and a sensitivity potentiometer.
- The ball shorts the switch contacts while the switch can stands **upright** (leads down); tilting it past roughly 15-45° opens the switch.
- **DO is LOW while upright and HIGH while tilted** (active high for "tilted")
- Two LEDs: power, and DO (lit while DO is low, i.e. upright)
- Supply: **3.3-5 V**, about 15 mA

## Pinout (3-pin header, as printed on the board)
| Pin | Name | Function |
|---|---|---|
| 1 | VCC | Supply, 3.3-5 V |
| 2 | GND | Ground |
| 3 | DO | Digital output: 1 = tilted, 0 = upright |

## Electrical limits
- Supply 3.3-5 V (the LM393 accepts 2-36 V; the module is sold for 3.3-5 V).
- DO is the LM393's open-collector output with a **10 kΩ pull-up to VCC**. Powered from 5 V, DO swings to 5 V, which can damage an ESP32 or Pico GPIO. With a 3.3 V board power the module from 3V3.
- The bare SW-520D switch is rated for only a few mA; on the module the comparator does the driving.

## Interface details
Plain digital input, no protocol:
```
DO = 0  -> upright (switch closed, DO-LED on)
DO = 1  -> tilted  (switch open,  DO-LED off)
```
No internal pull-up is needed. The rolling ball bounces for a few milliseconds, so debounce in software (the driver waits 20 ms for a stable level).

## Wiring
| Module | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| VCC | 3V3 | 3V3(OUT) (pin 36) | 3V3 (pin 1) |
| GND | GND | GND | GND (pin 6) |
| DO | GPIO25 | GP2 | GPIO17 (pin 11) |

## Using the driver
```python
from sw520d import SW520D
import time
sensor = SW520D(25)           # GPIO wired to DO
while True:
    print('Tilt: %s' % ('TILTED' if sensor.tilted() else 'upright'))
    time.sleep(0.5)
```
`tilted()` returns the debounced state; `upright()` is its inverse; `raw()` is the instantaneous DO level.

## Gotchas
- **Do not power from 5 V on a 3.3 V board**: DO is pulled up to VCC.
- **Polarity varies between listings**: the module datasheet and most vendors give LOW when upright, a few tutorials say the opposite. Check once on your board: the DO LED is lit when DO is LOW.
- **Orientation matters**: "upright" means the gold can points up with its leads at the bottom. Lying flat it sits near the switching angle and may flicker.
- It only says tipped / not tipped. For an actual angle use an accelerometer (MPU6050, ADXL345).
- The potentiometer sets the comparator threshold; if DO never changes, turn it to the middle.

## Datasheet
Module datasheet (HK Shan Hai, via components101): https://components101.com/sites/default/files/component_datasheet/Tilt%20Sensor%20Datasheet.pdf
Comparator: https://www.ti.com/lit/ds/symlink/lm393.pdf
Pin order: arduinogetstarted / DIYables pinout image (VCC, GND, DO): https://arduinogetstarted.com/images/tutorial/sw520d-tilt-sensor-pinout.jpg
