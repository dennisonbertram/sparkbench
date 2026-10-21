---
name: part-rcwl-0516
description: Pinout, electrical limits, wiring and MicroPython driver for the RCWL-0516 microwave Doppler radar motion sensor module (RCWL-9196 IC). Use when designing, wiring, simulating or writing code for an RCWL-0516 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# RCWL-0516 microwave radar motion sensor (RCWL-0516)

## Overview
The **RCWL-0516** is a small blue Doppler-radar motion sensor module (about 3.2 GHz, 5–7 m range). A transistor oscillator/mixer feeds an **RCWL-9196** IC (a BISS0001-style PIR processor), which drives a single digital output:
- **OUT goes high (3.3 V) while motion is detected**, low (0 V) otherwise
- Each trigger holds OUT high for about **2 s** (default) and re-triggers while motion continues
- Unlike a PIR it senses through plastic, wood and glass, but not metal
- Supply on VIN: **4–28 V**; the board makes its own 3.3 V (available on the 3V3 pin, up to ~100 mA)

## Pinout (5-pin header, as printed on the board)
| Pin | Name | Function |
|-----|------|----------|
| 1 | 3V3 | Regulated 3.3 V **output** from the module (≈100 mA max). Do not connect to a supply |
| 2 | GND | Ground |
| 3 | OUT | Motion output: 3.3 V when triggered, 0 V otherwise |
| 4 | VIN | Supply input, 4–28 V |
| 5 | CDS | Trigger disable (RCWL-9196 pin 9, 1 MΩ pull-up). Pull below ~0.7 V to block triggering; leave open for normal use |

## Electrical limits
- VIN: 4–28 V. **3.3 V on VIN is below the minimum**: use the 5 V / VBUS / VIN pin of your board.
- OUT swings 0–3.3 V even when VIN is 5 V or more, so it is safe on ESP32 / Pico / Pi GPIOs.
- Current draw: about 3 mA.
- Never connect the module's 3V3 pin to your board's 3V3 rail: both are regulator outputs.

## Interface details
Plain digital output, active high, push-pull (no pull resistor needed).
- Default hold time ≈ 2 s; a capacitor on the C-TM pad lengthens it (time = 32768 / f, where f is the oscillator on IC pin 3).
- Default range ≈ 7 m; a 1 MΩ resistor on R-GN cuts it to ≈ 5 m.
- An LDR between CDS and GND disables detection in daylight (R-CDS pad adjusts the threshold).
- Allow a few seconds after power-up for the output to settle.

## Wiring
| Module | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| VIN | 5V (VIN/USB) | VBUS (pin 40) | 5V (pin 2) |
| GND | GND | GND | GND (pin 6) |
| OUT | GPIO4 | GP15 | GPIO17 (pin 11) |
| 3V3 | leave unconnected | leave unconnected | leave unconnected |
| CDS | leave unconnected | leave unconnected | leave unconnected |

## Using the driver
```python
from rcwl0516 import RCWL0516
import time
radar = RCWL0516(4)          # GPIO wired to OUT
while True:
    print('MOTION=%d' % radar.motion())
    time.sleep(0.5)
```
`motion()` returns True while OUT is high; `on_change(handler)` calls `handler(True/False)` on each edge.

## Gotchas
- **Powering VIN from 3.3 V** is out of spec and gives unreliable or no triggering.
- **False triggers**: it sees through walls and catches fans, curtains, and other modules. Keep two RCWL-0516s more than 1 m apart.
- Keep at least 1 cm clear behind the board and no metal in front of the component side (the sensing face).
- Long or noisy supply wires near the antenna can retrigger it; a 100 µF capacitor across VIN/GND helps.
- The 2 s hold means short motions read as a 2 s high pulse; poll at least every second or use `on_change`.

## Datasheet
No manufacturer datasheet for the RCWL-9196 exists; the module spec sheet: https://www-users.york.ac.uk/~mjf5/pi_time/Datasheets/rcwl-0516.pdf
