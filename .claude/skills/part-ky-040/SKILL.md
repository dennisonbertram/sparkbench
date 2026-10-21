---
name: part-ky-040
description: Pinout, electrical limits, wiring and MicroPython driver for the KY-040 rotary encoder module (quadrature CLK/DT outputs + push switch). Use when designing, wiring, simulating or writing code for a KY-040 rotary encoder in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# KY-040 rotary encoder module

## Overview
The **KY-040** is the common 5-pin rotary encoder module. It holds no chip: a mechanical
incremental encoder (EC11 style, 360° continuous) with two contacts **A (CLK)** and **B (DT)** to a
common **C (GND)**, two **10 kΩ pull-ups** from CLK and DT to the + pin, and a **push switch** that
connects SW to GND when the knob is pressed.
- Outputs are 2-bit **Gray code (quadrature)**: high while a contact is open, low while it is closed
- Turning **clockwise, CLK changes before DT**; counter-clockwise, DT changes first
- Typically **20 pulses and 20 clicks (detents) per turn**; some batches give 30 clicks / 15 pulses
- Supply: **3.3 V to 5 V** (only feeds the pull-ups), about 0.7 mA at 3.3 V with both contacts closed

## Pinout (5-pin header, as printed on the board)
| Pin | Name | Function |
|-----|------|----------|
| 1 | CLK | Encoder output A (10 kΩ pull-up), low while contact A closed |
| 2 | DT | Encoder output B (10 kΩ pull-up), low while contact B closed |
| 3 | SW | Push switch to GND, low while pressed (no pull-up fitted on most boards) |
| 4 | + | Supply for the pull-ups, 3.3–5 V |
| 5 | GND | Ground (encoder common C) |

## Electrical limits
- CLK and DT are pulled up to the **+** pin. **Powered from 5 V they output 5 V**, which can damage an ESP32 or Pico GPIO. With a 3.3 V MCU always connect + to 3V3.
- The contacts are low-current switches (EC11-type, about 10 mA at 5 V DC max): do not drive loads through them.

## Interface details
State = (CLK, DT). Clockwise one full cycle: `11 → 01 → 00 → 10 → 11`; counter-clockwise the reverse.
- On a 20-click module each click is one full cycle (4 edges) and the knob rests at `11`.
- On a 30-click / 15-pulse module each click is half a cycle (2 edges) and it rests at `11` or `00`.
- The contacts bounce for a few ms. Decode **every edge of both lines** with a transition table: a bounce
  goes forward then back and cancels itself. Counting only CLK edges miscounts.
- SW: input with internal pull-up, reads 0 while pressed.

## Wiring
| Module | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| CLK | GPIO32 | GP14 (pin 19) | GPIO17 (pin 11) |
| DT | GPIO33 | GP15 (pin 20) | GPIO27 (pin 13) |
| SW | GPIO25 (internal pull-up) | GP13 (pin 17, internal pull-up) | GPIO22 (pin 15, internal pull-up) |
| + | 3V3 | 3V3(OUT) (pin 36) | 3V3 (pin 1) |
| GND | GND | GND | GND |

## Using the driver
```python
from ky040 import KY040
import time
enc = KY040(32, 33, 25)      # GPIOs wired to CLK, DT, SW
while True:
    print('pos=%d btn=%d' % (enc.position(), enc.pressed()))
    time.sleep_ms(200)
```
The driver uses pin interrupts on both edges of CLK and DT and a full Gray-code state table.
`position()` returns clicks turned (clockwise positive), `reset()` zeroes it, `pressed()` is True while
the knob is pushed. Use `steps_per_detent=2` for 30-click modules; `use_irq=False` plus frequent
`update()` calls polls instead of using interrupts.

## Gotchas
- **Do not power + from 5 V on a 3.3 V board.**
- **SW floats when released** unless you enable `Pin.PULL_UP`.
- **Counts jump by 2 per click or need two clicks per count**: your module has the other detent type; change `steps_per_detent` (2 or 4).
- Direction backwards? Swap CLK and DT (or negate the position).
- Heavy debouncing with long `sleep`s in a polling loop loses steps when turned fast: use the interrupt mode.

## Datasheet
No chip datasheet exists for the module; module data sheet: https://www.handsontec.com/dataspecs/module/Rotary%20Encoder.pdf
