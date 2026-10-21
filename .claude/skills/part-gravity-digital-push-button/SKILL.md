---
name: part-gravity-digital-push-button
description: Pinout, electrical limits, wiring and MicroPython driver for the DFRobot Gravity Digital Push Button module (DFR0029, active-high key with on-board pull-down and LED, D/VCC/GND Gravity connector). Use when designing, wiring, simulating or writing code for a Gravity digital push button in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# DFRobot Gravity Digital Push Button (DFR0029)

## Overview
The **Gravity: Digital Push Button** (DFR0029-R red, -Y yellow, -G green, -B blue, -W white) is a 22 x 30 mm board with a large 12 mm tactile key, a red indicator LED and a 3-pin Gravity (JST PH 2.0) connector. No chip: the key connects VCC to the output through 1 kOhm, and a 10 kOhm resistor pulls the output down while released. **Active high**: D reads 1 while pressed, 0 when released; the LED lights while pressed.

## Pinout (Gravity connector J1, schematic pin order)
| Pin | Wire | Function |
|---|---|---|
| D | green | Digital output: HIGH (= VCC via 1 kOhm) pressed, LOW (10 kOhm pull-down) released |
| VCC | red | Supply 3.3-5 V |
| GND | black | Ground |

## Electrical limits
- Supply 3.3-5 V (DFRobot spec).
- Current: about 0.3 mA through the pull-down plus 1-3 mA for the LED, only while pressed; nothing while released.
- D swings to VCC: at 5 V supply the GPIO would see 5 V (through 1 kOhm). Power it from **3.3 V** on an ESP32 / Pico / Raspberry Pi.

## Interface details
- Plain switch with pull-down, no logic IC: 1 = pressed, 0 = released.
- Tactile contacts bounce for a few milliseconds: the driver waits 10 ms of stable level.
- Do not turn on the GPIO's internal pull-up; it fights the board's 10 kOhm pull-down (a pull-down is harmless but unnecessary).

## Wiring
- ESP32: D -> GPIO4, VCC -> 3V3, GND -> GND.
- Pico: D -> GP15, VCC -> 3V3(OUT), GND -> GND.
- Raspberry Pi 4: D -> GPIO17 (pin 11), VCC -> pin 1 (3.3 V), GND -> pin 6.
- The board has a 2 mm Gravity socket: use the Gravity-to-Dupont cable that comes with it (green D, red VCC, black GND).

## Using the driver
```python
from gravity_button import GravityButton
import time
btn = GravityButton(4)     # GPIO wired to D
while True:
    print('BUTTON=%s' % ('DOWN' if btn.is_pressed() else 'UP'))
    time.sleep(0.2)
```
`btn.was_pressed()` returns True once per new press; `btn.irq(handler)` calls `handler(pin)` on the rising edge.

## Gotchas
- Opposite polarity to a bare button with Pin.PULL_UP: here pressed = 1.
- 5 V on VCC puts 5 V on the GPIO: use 3.3 V with 3.3 V boards.
- Several presses counted for one: contact bounce; debounce in software (the driver does).
- The on-board LED lighting confirms the key closes; if the LED lights but the GPIO stays 0, check the green D wire.

## Datasheet
https://dfimg.dfrobot.com/wiki/17140/DFR0029_digital-push-button_schematics_v1.0.pdf
