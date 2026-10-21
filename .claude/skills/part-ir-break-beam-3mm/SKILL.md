---
name: part-ir-break-beam-3mm
description: Pinout, electrical limits, wiring and MicroPython driver for the Adafruit IR break beam sensor with 3 mm LEDs (product 2167, emitter + open-collector receiver). Use when designing, wiring, simulating or writing code for an IR break beam / beam-interruption sensor in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# IR break beam sensor, 3 mm LEDs (Adafruit 2167)

## Overview
A matched pair: an **emitter** shines an invisible infrared beam (10° cone) at a **receiver** up to about **25 cm** away. While the receiver sees the beam its output floats high (through a pull-up); when something passes between them the output transistor **pulls the signal LOW**. Response time is under 2 ms, so it is good for counting objects, gates and doors. Sold as Adafruit "IR Break Beam Sensors with Premium Wire Header Ends - 3mm LEDs" (230 mm leads with male header pins).

## Pinout (wire colours; there are no printed labels)
| Pin (Sparkbench) | Wire | Function |
|---|---|---|
| RX_VCC | receiver red | Supply 3.3-5.5 V |
| RX_GND | receiver black | Ground |
| RX_SIG | receiver white (or yellow) | Open-collector output: 0 = beam broken, 1 = intact |
| EM_VCC | emitter red | Supply 3.3-5.5 V |
| EM_GND | emitter black | Ground |

## Electrical limits
- Supply 3.3-5.5 V for both halves; 5 V on the emitter gives the best range.
- Emitter draws about 10 mA at 3.3 V, 20 mA at 5 V.
- Receiver output is open collector and can sink up to 100 mA.
- **A pull-up is required** on RX_SIG: 10 kΩ to the receiver's red wire, or the GPIO's internal pull-up.

## Interface details
Plain digital input, no protocol:
```
RX_SIG = 0  -> beam broken (object in the gap)
RX_SIG = 1  -> beam intact
```
Use a falling-edge interrupt to catch fast objects.

## Wiring
| Wire | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| RX_SIG (white) | GPIO27 | GP15 | GPIO17 (pin 11) |
| RX_VCC, EM_VCC (red) | 3V3 | 3V3(OUT) (pin 36) | 3V3 (pin 1) |
| RX_GND, EM_GND (black) | GND | GND | GND (pin 6) |
Add a 10 kΩ resistor from RX_SIG to RX_VCC (or rely on the internal pull-up).

## Using the driver
```python
from breakbeam import BreakBeam
import time
beam = BreakBeam(27)          # GPIO wired to the white wire; enables the internal pull-up
while True:
    print('Beam: %s' % ('BROKEN' if beam.broken() else 'intact'))
    time.sleep(0.5)
```
`broken()` is True while blocked; `raw()` returns the level; `irq(handler)` fires when the beam is broken (`on_break=False` for when it is restored).

## Gotchas
- Without any pull-up the signal floats and reads randomly.
- Powering the receiver (and its pull-up) from 5 V puts 5 V on a 3.3 V GPIO: use 3V3 for the receiver; the emitter can stay on 5 V.
- Emitter and receiver must face each other; misalignment looks like a permanently broken beam.
- Sunlight can blind the receiver. For gaps over 25 cm use the 5 mm version (Adafruit 2168).

## Datasheet
Adafruit guide (no separate chip datasheet): https://cdn-learn.adafruit.com/downloads/pdf/ir-breakbeam-sensors.pdf
Product page: https://www.adafruit.com/product/2167
