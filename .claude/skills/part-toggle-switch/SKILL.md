---
name: part-toggle-switch
description: Pinout, electrical limits, wiring and MicroPython driver for an SPDT miniature toggle switch (MTS-102, ON-ON, 3 lugs L1/COM/L2). Use when designing, wiring, simulating or writing code for a toggle switch in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Toggle switch (MTS-102 SPDT miniature toggle)

## Overview
The **MTS-102** is the generic miniature toggle switch sold in every hobby kit: a bat lever on a 1/4-40 (about 6 mm) threaded bushing, a small red or blue body and **three solder lugs in a row, 4.7 mm apart**. It is **SPDT ON-ON**: the middle lug (COM) is the moving contact and it is always joined to one of the two outer lugs. It latches: the lever stays where you put it. No chip and no supply.

- Lever one way: COM-L1 closed, COM-L2 open.
- Lever the other way: COM-L2 closed, COM-L1 open.
- Break-before-make: for a moment while the lever moves, neither is closed.

## Pinout (lugs in a row; the lugs are not marked)
| Lug | Function |
|---|---|
| L1 | Outer lug: closes to COM in one lever position. Connect to a GPIO with the internal pull-up |
| COM | Middle lug, common contact: connect to GND |
| L2 | Other outer lug: closes to COM in the other lever position. Optional second GPIO (pull-up on) |

## Electrical limits
- MTS series datasheet: **6 A 125 VAC / 3 A 250 VAC**, contact resistance 20 mOhm max, insulation 1000 MOhm at 500 VDC, dielectric 1500 VAC for 1 minute, -25 to +85 C, electrical life 10,000 cycles.
- At a 3.3 V GPIO with the internal pull-up only microamps flow.
- Lug pitch is 4.7 mm, not 2.54 mm: it does not plug into a breadboard. Solder wires to the lugs and bring them to a 3-pin header.

## Interface details
- With COM to GND and L1/L2 pulled up: **0 = that contact closed, 1 = open**. Exactly one reads 0 when the lever rests.
- One GPIO is enough (L1 only): 0 = one position, 1 = the other.
- On most toggle switches the lever points **away** from the outer lug it connects. Check yours with a multimeter.
- Contacts bounce for a few ms: the driver waits 20 ms of stable readings.

## Wiring
- ESP32: COM -> GND, L1 -> GPIO4, L2 -> GPIO5 (internal pull-ups on).
- Pico: COM -> GND, L1 -> GP14, L2 -> GP15 (internal pull-ups on).
- Raspberry Pi 4: COM -> pin 6 (GND), L1 -> GPIO17 (pin 11), L2 -> GPIO27 (pin 13), pull-ups on.

## Using the driver
```python
from toggle_switch import ToggleSwitch
import time
sw = ToggleSwitch(4, 5)     # GPIOs wired to L1 and L2, COM to GND
while True:
    print('SWITCH=%s' % sw.position())    # 'L1', 'L2' or None while moving
    time.sleep(0.2)
```
With one wire: `ToggleSwitch(4)` and `sw.is_on()`.

## Gotchas
- Both pins read 0: COM is not on the middle lug (you grounded an outer lug).
- Random readings: the pull-up is missing; the switch only connects to GND, it never drives high.
- Never pull up to 5 V on an ESP32/Pico.
- Do not switch motors or mains through it on a hobby build; switch a relay or driver input instead.
- The MTS-103 (ON-OFF-ON) looks identical but has a centre-off position where neither lug is joined.

## Datasheet
https://ok1if.hamqth.com/PIXANC/MTS-SMTS-Series.pdf (MTS / SMTS series miniature toggle switches)
