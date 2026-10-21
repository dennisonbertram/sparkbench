---
name: part-limit-switch
description: Pinout, electrical limits, wiring and MicroPython driver for the KW11 micro limit switch (KW11-3Z SPDT snap-action switch, COM/NO/NC). Use when designing, wiring, simulating or writing code for a limit switch or end-stop in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Limit switch (KW11-3Z micro switch)

## Overview
The **KW11-3Z** is the generic micro limit switch sold for CNC machines and 3D-printer end-stops: a snap-action **SPDT** switch about 20 × 10 × 6.4 mm with a hinge lever and three solder/quick-connect terminals marked **C (COM), NO, NC**. It is a clone of the Omron SS-5GL subminiature basic switch: same body, mounting holes and terminal arrangement. No chip and no supply: it is just a changeover contact.

- Lever **released**: COM–NC closed, COM–NO open.
- Lever **pressed**: COM–NO closed, COM–NC open.

## Pinout (terminal order along the body, from the lever hinge end)
| Terminal | Function |
|---|---|
| COM | Common contact: connect to GND |
| NO | Normally open: closes to COM when pressed. Connect to a GPIO with the internal pull-up |
| NC | Normally closed: opens when pressed. Optional (fail-safe end-stop wiring); not modelled by the simulator |

## Electrical limits
- Contact rating (seller listings for KW11-3Z): 5 A 125/250 VAC. The Omron SS-5 original is rated 5 A 125 VAC, 3 A 250 VAC, 5 A 30 VDC: use the lower figures.
- Contact resistance ≤ 50 mΩ; insulation ≥ 100 MΩ.
- Silver contacts: the Omron minimum applicable load is 5 VDC 160 mA. At GPIO currents (tens of µA) a silver contact can become unreliable over years; fine for hobby end-stops, but use a gold-contact (SS-01 type) switch for critical logic signals.
- Operating force about 0.5 N (hinge lever), mechanical life ≥ 1,000,000 operations.

## Interface details
- Plain changeover switch. With COM to GND and NO pulled up: **0 = pressed, 1 = released**.
- Fail-safe wiring (common on 3D printers): COM to GND, NC to the GPIO: 0 = released, 1 = pressed **or a broken wire**.
- The GPIO **needs a pull-up** (`Pin.PULL_UP`, or 10 kΩ to **3.3 V**, never 5 V on an ESP32/Pico).
- Contacts bounce for a few ms: the driver debounces (10 ms).

## Wiring
- ESP32: COM → GND, NO → GPIO4 (internal pull-up on).
- Pico: COM → GND, NO → GP15 (internal pull-up on).
- Raspberry Pi 4: COM → pin 6 (GND), NO → GPIO17 (pin 11) with the pull-up.

## Using the driver
```python
from limit_switch import LimitSwitch
import time
sw = LimitSwitch(4)          # GPIO wired to NO, COM to GND
while True:
    print('LIMIT=%s' % ('HIT' if sw.is_pressed() else 'CLEAR'))
    time.sleep(0.2)
```
For NC wiring use `LimitSwitch(4, normally_closed=True)`. `sw.irq(handler)` calls `handler(pin)` on each press.

## Gotchas
- Reading always 1: the wire goes to NC instead of NO (or vice versa); check the C/NO/NC marks moulded on the body.
- Random readings: the pull-up is missing; the switch only connects to GND, it never drives high.
- Do not run motors or mains through it directly on a hobby build; switch a relay or the driver's enable input instead.
- Mount it so the carriage stops before the lever bottoms out (overtravel is only about 1 mm).

## Datasheet
https://omronfs.omron.com/en_US/ecb/products/pdf/en-ss.pdf (Omron SS, the original this generic KW11-3Z copies)
