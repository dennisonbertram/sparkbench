---
name: part-3x4-membrane-keypad
description: Pinout, electrical limits, wiring and MicroPython driver for the 3x4 matrix membrane keypad (Adafruit #419 and clones, 7-pin ribbon, keys 123/456/789/*0#). Use when designing, wiring, simulating or writing code for a 3x4 membrane keypad in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# 3x4 membrane keypad (Adafruit #419)

## Overview
A flat, self-adhesive **12-key phone-style keypad** (1 2 3 / 4 5 6 / 7 8 9 / * 0 #). There is no chip inside: it is 12 switches wired as a matrix of **4 rows x 3 columns**, so 7 GPIO pins read all 12 keys. Hobbyists buy the **Adafruit Membrane 3x4 Matrix Keypad (#419)** or one of its many identical clones, with a 7-pin 0.1" female ribbon connector.

## Pinout (Adafruit #419, ribbon pin 1 at the left with the keys facing you)
| Pin | Name | Keys on it |
|---|---|---|
| 1 | R1 | 1 2 3 |
| 2 | R2 | 4 5 6 |
| 3 | R3 | 7 8 9 |
| 4 | R4 | * 0 # |
| 5 | C1 | 1 4 7 * |
| 6 | C2 | 2 5 8 0 |
| 7 | C3 | 3 6 9 # |

Some clones order the pins differently. Check with a multimeter on continuity: holding **1** should join R1 and C1.

## Electrical limits
- Passive switches: no supply pin, no current except the GPIO pull-ups (~0.1 mA per pressed key at 3.3 V).
- Contact rating (generic membrane keypad datasheet): 30 V DC, 30 mA max; contact resistance < 50 Ω; −20 to 60 °C.
- Use it only at the microcontroller's logic level (3.3 V); never connect a row or column to 5 V on an ESP32 or Pico.

## Interface details
- Columns C1–C3: inputs with the internal pull-up.
- Rows R1–R4: driven low one at a time; a column reading 0 means the key at that row/column is held.
- Rows not being scanned are left as inputs (high-impedance), so two keys held in one column cannot short a high output to a low one.
- Debounce: re-check about 20 ms after a key is first seen.

## Wiring
- ESP32: R1–R4 → D25, D26, D27, D13; C1–C3 → D23, D19, D18.
- Pico: R1–R4 → GP2, GP3, GP6, GP7; C1–C3 → GP8, GP9, GP10.
- Raspberry Pi 4: any 7 free GPIOs (e.g. GPIO5, 6, 13, 19 for rows; 12, 16, 20 for columns).

## Using the driver
```python
from keypad import Keypad
kp = Keypad((25, 26, 27, 13), (23, 19, 18))
while True:
    key = kp.get_key()   # returns '0'-'9', '*' or '#' once per press, else None
    if key:
        print('KEY=' + key)
```
`kp.scan()` returns whichever key is held right now (or None) without edge detection.

## Gotchas
- Wrong keys reported (e.g. 2 shows as 4)? Rows and columns are swapped or the clone's ribbon order differs: re-check with a multimeter.
- Don't fold the flat ribbon tail sharply; the printed silver traces crack.
- Only one key at a time is reliable; with three keys held, a fourth "ghost" key can appear (no diodes in the matrix).

## Datasheet
https://asset.conrad.com/media10/add/160267/c1/-/en/001341282DS01/tehnicni-podatki-1341282-tipkovnica-s-folijo-matrika-3-x-4-su709930-1-kos.pdf
Pinout: https://learn.adafruit.com/matrix-keypad/pinouts
