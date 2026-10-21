---
name: part-ky-032
description: Pinout, electrical limits, wiring and MicroPython driver for the KY-032 IR obstacle avoidance module with enable pin (NE555 38 kHz emitter + HS0038-type receiver). Use when designing, wiring, simulating or writing code for a KY-032 obstacle / proximity sensor in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# KY-032 IR obstacle avoidance module (KY-032)

## Overview
The **KY-032** detects an object in front of it (about 2–40 cm, depending on the trimmers and the surface) by bouncing infrared light off it. An **NE555** pulses an IR LED at about 38 kHz and an **HS0038-type 38 kHz IR receiver** picks up the reflection and drives the output directly, so it ignores steady daylight better than the simpler KY-033/FC-51 boards. It reports only *obstacle / no obstacle*, not the distance. Modelled board: **Keyes / Joy-IT KY-032 IR obstacle avoidance module (SEN-KY032IR, 4-pin header GND, +, Out, EN)**.

## Pinout (4-pin header, in board order)
| Pin | Function |
|---|---|
| GND | Ground |
| + | Supply, 3.3–5 V |
| OUT | Signal output: LOW = obstacle, HIGH = clear (status LED lights on obstacle) |
| EN | Enable (active high per Joy-IT); only used when the EN jumper is removed. Leave unconnected with the jumper fitted |

## Electrical limits
- Supply: 3.3–5 V (Joy-IT: 3–5 V). OUT idles at the supply voltage, so **use 3.3 V with an ESP32 or Pico**.
- The NE555 is specified from 4.5 V; at 3.3 V most boards still work but the range can be shorter.
- Current: roughly 10–20 mA (IR LED, power LED and status LED).

## Interface details
- Plain digital input, **active low**: OUT = 0 while an obstacle is seen, 1 when clear (Joy-IT example: `HIGH` → "No obstacle").
- EN jumper fitted (as shipped): the emitter runs permanently. Remove the jumper to switch the emitter from a GPIO on EN (Joy-IT: active high). Some vendor listings state the opposite polarity; test your board.
- Two trimmers: one sets the emitter frequency/strength (range), the other the receiver sensitivity. If OUT is stuck low with nothing in front, turn them back until the status LED goes out.

## Wiring
- ESP32: + → 3V3, GND → GND, OUT → GPIO4, EN unconnected (jumper fitted).
- Pico: + → 3V3(OUT), GND → GND, OUT → GP18.
- Raspberry Pi 4: + → pin 1 (3.3 V), GND → pin 6, OUT → GPIO24 (pin 18).

## Using the driver
```python
from ky032 import KY032
import time
s = KY032(4)               # GPIO wired to OUT
while True:
    print('Obstacle' if s.obstacle() else 'Clear')
    time.sleep(0.2)
```
With the EN jumper removed: `KY032(4, en_pin=5)` and `s.enable(False)` / `s.enable(True)`.

## Gotchas
- Powered from 5 V, OUT idles at 5 V: too much for an ESP32/Pico pin.
- Sunlight and black or shiny surfaces reduce the range; white objects are seen furthest.
- Pin order differs on some clones: read the silkscreen (GND, +, out, EN on the Keyes/Joy-IT board).
- Nothing is detected with the jumper removed and EN floating or driven to the disabling level.

## Datasheet
https://joy-it.net/files/files/Produkte/SEN-KY032/SEN-KY032IR_Manual_2024-04-25.pdf (module); https://www.ti.com/lit/ds/symlink/ne555.pdf (NE555)
