---
name: part-m5stack-unit-dual-button
description: Pinout, electrical limits, wiring and MicroPython driver for the M5Stack Unit Dual Button (U025, blue + red push buttons, Grove connector). Use when designing, wiring, simulating or writing code for an M5Stack Dual Button unit in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# M5Stack Unit Dual Button (U025)

## Overview
The **M5Stack Unit Dual Button** (SKU U025) is a 48 x 24 mm unit with two push buttons, one with a **blue** cap and one with a **red** cap, and a 4-pin HY2.0 Grove socket. There is no chip on it. Each button has a passive circuit:
- the button shorts its signal line to **GND** when pressed (**active low**)
- at rest the line sits on a **10 kΩ (to VCC) / 20 kΩ (to GND)** divider with 100 nF to GND, so from 5 V it reads **about 3.3 V** when released
- each line is a plain level output. No GPIO pull-up is needed.

## Pinout (Grove HY2.0-4P, schematic J1)
| Pin | Name | Wire | Function |
|---|---|---|---|
| 1 | BLUE | white | Blue button (net A): ~3.3 V released, 0 V pressed |
| 2 | RED | yellow | Red button (net B): ~3.3 V released, 0 V pressed |
| 3 | 5V | red | Supply, 5 V |
| 4 | GND | black | Ground |

## Electrical limits
- Supply: 5 V from the Grove port (use 4.75-5.25 V). The released level is VCC x 20k/30k: 3.33 V at 5 V.
- Do **not** power it from 3.3 V: the released level would then be ~2.2 V, below the guaranteed logic-high threshold of a 3.3 V MCU (0.75 x VDD on ESP32).
- Current: about 0.17 mA per released button through the divider, 0.5 mA per pressed button. Under 1 mA in total.
- Source impedance of the released level is about 6.7 kΩ (10k || 20k). Leave the GPIO without a pull-down.

## Interface details
```
line = 1 (~3.3 V) -> released
line = 0 (0 V)    -> pressed
```
The contacts bounce for a few milliseconds, so the driver debounces for 20 ms.

## Wiring
| Unit | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| 5V (red) | 5V / VIN | VBUS (pin 40) | 5V (pin 2) |
| BLUE (white) | GPIO25 | GP2 | GPIO17 (pin 11) |
| RED (yellow) | GPIO26 | GP3 | GPIO27 (pin 13) |
| GND (black) | GND | GND | GND (pin 6) |

On an M5Stack Core plug it into **Port B**: blue = GPIO36, red = GPIO26.

## Using the driver
```python
from m5_dual_button import M5DualButton
import time
buttons = M5DualButton(25, 26)   # BLUE pin, RED pin
while True:
    print('BLUE=%d RED=%d' % buttons.read())   # 1 = pressed
    time.sleep(0.3)
```
`buttons.blue` / `buttons.red` each offer `raw()`, `is_down()`, `pressed()` (debounced) and `irq(handler, on_press=True)`.

## Gotchas
- **Grove socket, not header pins**: use a Grove-to-female-jumper cable for a breadboard.
- **Active low**: a pressed button reads 0. Invert in code.
- **Power from 5 V**, even with a 3.3 V board: the on-board divider brings the released level down to 3.3 V.
- The white wire is the blue button and the yellow wire is the red one. The colours of the wires and the caps do not match.
- Input-only pins (ESP32 GPIO34-39) are fine because no internal pull resistor is needed.

## Datasheet
M5Stack schematic: https://m5stack-doc.oss-cn-shenzhen.aliyuncs.com/578/Sch_UNIT_DualButton_v1.1.pdf
Pin order and wire colours: https://docs.m5stack.com/en/unit/dual_button (White = Blue Btn, Yellow = Red Btn) and UiFlow2 `DualButtonUnit((36, 26))` returning (blue, red): https://uiflow-micropython.readthedocs.io/en/latest/unit/dualbutton.html
