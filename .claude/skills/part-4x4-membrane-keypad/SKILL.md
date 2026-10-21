---
name: part-4x4-membrane-keypad
description: Pinout, electrical limits, wiring and MicroPython driver for the 4x4 matrix membrane keypad (Adafruit #3844 and 8-pin clones, keys 123A/456B/789C/*0#D). Use when designing, wiring, simulating or writing code for a 4x4 membrane keypad in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# 4x4 membrane keypad (4x4 matrix membrane keypad)

## Overview
A thin, sticky-backed **16-key membrane keypad** laid out as 1 2 3 A / 4 5 6 B / 7 8 9 C / * 0 # D. There is no chip inside: it is a passive **4-row by 4-column switch matrix**, and pressing a key connects its row line to its column line. Hobbyists buy the **Adafruit Membrane 4x4 Matrix Keypad (#3844)** or the identical generic clones, which end in an 8-pin ribbon with a 2.54 mm female connector.

## Pinout (8-pin ribbon, keys facing you, left to right)
| Pin | Name | Keys on that line |
|---|---|---|
| 1 | R1 | 1 2 3 A |
| 2 | R2 | 4 5 6 B |
| 3 | R3 | 7 8 9 C |
| 4 | R4 | * 0 # D |
| 5 | C1 | 1 4 7 * |
| 6 | C2 | 2 5 8 0 |
| 7 | C3 | 3 6 9 # |
| 8 | C4 | A B C D |

Source: Adafruit #3844 product page ("starting from the left there are four row pins, and then to the right are the four column pins").

## Electrical limits
- No power pin. Runs at the microcontroller's own logic level (3.3 V on ESP32/Pico). Never feed 5 V into a 3.3 V board's pin.
- Contact resistance < 100 Ω; actuation force 160–180 g (Adafruit). Parallax rates its similar keypad at 24 V DC / 30 mA max.
- Current is only the pull-up current while a key is held (well under 1 mA).

## Interface details
- Columns: inputs with internal pull-ups.
- Scan: drive one row LOW, leave the other rows as inputs (high impedance), read the four columns; a LOW column means key (row, column) is down. Repeat for each row.
- Floating the idle rows (instead of driving them HIGH) prevents a short when two keys in the same column are pressed.
- Debounce about 20 ms.

## Wiring
- ESP32: R1–R4 → GPIO 25, 26, 27, 13; C1–C4 → GPIO 23, 19, 18, 17.
- Pico: R1–R4 → GP2, GP3, GP6, GP7; C1–C4 → GP8, GP9, GP10, GP11.
- Raspberry Pi 4: any 8 free GPIOs, e.g. R1–R4 → GPIO 5, 6, 13, 19; C1–C4 → GPIO 12, 16, 20, 21.

## Using the driver
```python
from keypad4x4 import Keypad
import time
kp = Keypad((25, 26, 27, 13), (23, 19, 18, 17))
while True:
    k = kp.get_key()   # returns a key once per press, else None
    if k:
        print('KEY=' + k)
    time.sleep_ms(10)
```
`kp.scan()` returns every key held; `kp.key()` returns the first held key or None.

## Gotchas
- If keys come out transposed (pressing 4 gives 2), the ribbon on your clone is numbered the other way round: swap the row and column pin tuples in code.
- Avoid ESP32 input-only pins (34–39) for rows; they cannot drive LOW.
- The membrane tail cracks if folded sharply; bend it gently.

## Datasheet
No chip datasheet (passive part). Product page: https://www.adafruit.com/product/3844
