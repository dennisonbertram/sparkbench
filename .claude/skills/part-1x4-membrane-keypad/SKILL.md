---
name: part-1x4-membrane-keypad
description: Pinout, electrical limits, wiring and MicroPython driver for the 1x4 membrane keypad (Adafruit #1332 and clones, 5-pin ribbon R1/C2/C1/C4/C3, keys 1 2 3 4 on one common wire). Use when designing, wiring, simulating or writing code for a 1x4 membrane keypad in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# 1x4 membrane keypad (Adafruit #1332)

## Overview
A flat, self-adhesive **4-key keypad** (keys 1 2 3 4 in a row). There is no chip inside: it is 4 switches that share one **common** wire (R1), and each key has its own line (C1-C4), so no matrix scanning is needed. Hobbyists buy the **Adafruit Membrane 1x4 Keypad + Extras (#1332)** or one of its clones, with a 5-pin 0.1" ribbon connector (Adafruit includes a 5-pin header).

## Pinout (Adafruit #1332, ribbon pin 1 at the left with the keys facing you)
| Pin | Name | Function |
|---|---|---|
| 1 | R1 | Common line (all keys) |
| 2 | C2 | Key 2 |
| 3 | C1 | Key 1 |
| 4 | C4 | Key 4 |
| 5 | C3 | Key 3 |

The key lines are **not** in 1-2-3-4 order. Clones may differ: check with a multimeter on continuity. Holding **1** should join pin 1 (R1) and pin 3 (C1).

## Electrical limits
- Passive switches: no supply pin, no current except the GPIO pull-ups (~0.1 mA per pressed key at 3.3 V).
- Contact rating (generic membrane keypad datasheet): 30 V DC, 30 mA max; contact resistance < 50 Ω; −20 to 60 °C.
- Use it only at the microcontroller's logic level (3.3 V); never connect a key line to 5 V on an ESP32 or Pico.

## Interface details
- C1-C4: inputs with the internal pull-up.
- R1 (common): held low, either by a GPIO set to output 0 or by wiring it straight to GND.
- A key line reading 0 means that key is held. Because every key has its own line, any combination of keys reads correctly (no ghosting).
- Debounce: re-check about 20 ms after a key is first seen.

## Wiring
- ESP32: R1 → D25; C2 → D26; C1 → D27; C4 → D13; C3 → D23.
- Pico: R1 → GP2; C2 → GP3; C1 → GP6; C4 → GP7; C3 → GP8.
- Raspberry Pi 4: R1 to GND, and C1-C4 to any 4 free GPIOs with pull-ups.

## Using the driver
```python
from keypad1x4 import Keypad1x4
kp = Keypad1x4(25, (27, 26, 23, 13))   # R1, then C1, C2, C3, C4 (keys 1-4)
while True:
    key = kp.get_key()   # '1'-'4' once per press, else None
    if key:
        print('KEY=' + key)
```
Pass `None` as the first argument if R1 is wired to GND. `kp.pressed()` returns every key held right now; `kp.scan()` the first one.

## Gotchas
- Keys come out swapped (2 reads as 1)? You wired the ribbon in 1-2-3-4 order; the real order is R1, C2, C1, C4, C3.
- Don't fold the flat ribbon tail sharply; the printed silver traces crack.

## Datasheet
https://asset.conrad.com/media10/add/160267/c1/-/en/001341282DS01/tehnicni-podatki-1341282-tipkovnica-s-folijo-matrika-3-x-4-su709930-1-kos.pdf (generic membrane keypad ratings)
Pinout: https://learn.adafruit.com/matrix-keypad/pinouts (Membrane 1x4 Matrix Keypad, PID 1332)
