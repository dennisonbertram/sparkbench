---
name: part-ky-010
description: Pinout, electrical limits, wiring and MicroPython driver for the KY-010 photo interrupter (light barrier) module (Everlight ITR9608 slotted opto-interrupter). Use when designing, wiring, simulating or writing code for a KY-010 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# KY-010 photo interrupter module (KY-010)

## Overview
The **KY-010** is a small black 3-pin module from the 37-in-1 / 45-in-1 sensor kits, for example the **Joy-IT SensorKit KY-010 light barrier**. It carries a U-shaped **slotted opto-interrupter** (Everlight **ITR9608**): an infrared LED on one side of the slot shines onto an NPN phototransistor on the other side. The board adds the LED's series resistor and a pull-up on the output.
- **S goes HIGH while something is in the slot** (beam blocked) and is LOW while the slot is clear.
- Typical uses: counting slots of an encoder disc (wheel speed), end-stops, counting objects passing through, coin/paper detection.

## Pinout (module header, as printed on the board)
| Pin | Name | Function |
|-----|------|----------|
| 1 | S | Signal: HIGH = beam blocked, LOW = clear |
| 2 | +V (middle, unmarked) | Supply, 3.3–5 V |
| 3 | - | Ground |

## Electrical limits
- Supply: **3.3–5 V** (Joy-IT). Current: roughly 5–12 mA, mostly the IR LED.
- ITR9608: LED IF max 50 mA, VF 1.2 V typ; phototransistor IC max 20 mA, VCE(sat) ≤ 0.4 V, IC(on) ≥ 0.5 mA at IF = 20 mA; rise/fall time about 15 µs.
- S is pulled up to the supply. **On an ESP32, Pico or Raspberry Pi, power +V from 3.3 V** so S never exceeds 3.3 V.
- The ITR9608 is an infrared device: strong sunlight or IR remote light into the slot can make it read "clear".

## Interface details
Plain digital input, no protocol:
```
S = 1  -> slot blocked (phototransistor dark, pull-up wins)
S = 0  -> slot clear (phototransistor lit, pulls S low)
```
The board's pull-up is enough; no internal pull is needed. Edges are clean (no bounce), and fast enough to count slots with `Pin.irq(trigger=Pin.IRQ_RISING)`.

## Wiring
| Module | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| S | any GPIO, e.g. GPIO25 | any GP, e.g. GP18 | any GPIO, e.g. GPIO24 (pin 18) |
| +V (middle) | 3V3 | 3V3(OUT) (pin 36) | 3.3 V (pin 1) |
| - | GND | GND | GND (pin 6) |

## Using the driver
```python
from ky010 import KY010
import time
gate = KY010(25)          # S GPIO
while True:
    print('Beam: %s' % ('BLOCKED' if gate.blocked() else 'clear'))
    time.sleep(0.5)
```
`blocked()` is True while S is HIGH. `start_counting()` counts each blocking (rising edge) in `gate.count`.

## Gotchas
- **5 V supply + 3.3 V board** puts 5 V on the GPIO. Use 3.3 V.
- The middle pin is the supply even though only S and - are printed; double-check before powering.
- Thin or translucent objects (paper, clear plastic) may not block enough IR to switch the output.
- For speed measurement, count rising edges with an interrupt rather than polling.

## Datasheet
https://www.everlighteurope.com/custom/files/datasheets/DRX-0000076.pdf (Everlight ITR9608-F). Module documentation and pin order: https://sensorkit.joy-it.net/en/sensors/ky-010
