---
name: part-arcade-button
description: Pinout, electrical limits, wiring and MicroPython driver for a 30 mm arcade push button (Sanwa OBSF-30 with SW-68 microswitch, 2 terminals). Use when designing, wiring, simulating or writing code for an arcade button in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# 30 mm arcade push button (Sanwa OBSF-30)

## Overview
A **30 mm arcade push button** snaps into a 30 mm hole in a 2-4 mm thick panel and has a small **microswitch** clipped to the bottom. Hobbyists buy it as the **Sanwa OBSF-30** (many colours, suffix -R, -B, -W ...), which ships with the **Sanwa SW-68** microswitch: two **.110" (2.8 mm) quick-connect tabs**, one **normally open** contact. No chip, no supply, not polarised.

## Pinout (two tabs, not polarised)
| Tab | Function |
|---|---|
| GND | Either tab: connect to ground |
| SIG | The other tab: connect to a GPIO with the internal pull-up on |

## Electrical limits
- SW-68 rating: **12 V DC, 100 mA** max; contact resistance under 50 mOhm; life 1 million presses (at 5 V 10 mA); -20 to +60 C.
- Logic-level use only: switch a GPIO, never a motor, solenoid or LED strip directly.
- With the 3.3 V internal pull-up only tens of microamps flow.

## Interface details
- Plain normally-open switch. With SIG pulled up: **0 = pressed, 1 = released**.
- Contacts bounce for a few milliseconds: the driver waits 10 ms of stable level.
- Some replacement microswitches (e.g. Omron B2R, Happ/Cherry types) have three tabs COM/NO/NC: then use COM and NO.

## Wiring
- ESP32: GND tab -> GND, SIG tab -> GPIO4 (internal pull-up on).
- Pico: GND tab -> GND, SIG tab -> GP15 (internal pull-up on).
- Raspberry Pi 4: GND tab -> pin 6, SIG tab -> GPIO17 (pin 11) with the internal pull-up.
- Use 2.8 mm (.110") female crimp connectors (not the 4.8 mm .187" size used by Happ buttons).

## Using the driver
```python
from arcade_button import ArcadeButton
import time
btn = ArcadeButton(4)    # GPIO wired to SIG, internal pull-up on
while True:
    print('BUTTON=%s' % ('DOWN' if btn.is_pressed() else 'UP'))
    time.sleep(0.2)
```
`btn.was_pressed()` returns True once per new press; `btn.irq(handler)` calls `handler(pin)` on press.

## Gotchas
- Random readings: the pull-up is missing; the switch only connects to ground, it never drives high.
- Never pull SIG up to 5 V on an ESP32 or Pico.
- Several presses counted for one: contact bounce; debounce in software (the driver does).
- Wrong crimp size: OBSF-30 tabs are 2.8 mm; 4.8 mm connectors fall off.
- The LED versions (Adafruit/generic "arcade button with LED") have 4 tabs; this part covers the plain 2-tab button.

## Datasheet
https://focusattack.com/sanwa-sw-68-button-micro-switch
