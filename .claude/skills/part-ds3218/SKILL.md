---
name: part-ds3218
description: Pinout, electrical limits, wiring and MicroPython code for the DS3218 20 kg digital servo (DSSERVO DS3218MG, 180° version). Use when designing, wiring, simulating or writing code for a DS3218 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# DS3218 20 kg digital servo, 180° version (DS3218)

## Overview
The **DSSERVO DS3218** is a high-torque digital metal-gear servo (about 18 kg·cm at 5 V, 21.5 kg·cm at 6.8 V; 0.16 s/60° at 5 V). It is sold in a **180°** and a **270°** version. Both take the same 500–2500 µs pulse; this part models the 180° version (DS3218MG 20KG, 180°).

## Pinout (3-wire lead, plug order)
| Pin | Wire | Function |
|---|---|---|
| SIG | White | PWM signal, 500–2500 µs pulse at 50 Hz (50–330 Hz accepted) |
| V+ | Red | Motor supply, 4.8–6.8 V |
| GND | Black | Ground (join to the microcontroller's GND) |

## Electrical limits
- Supply: 4.8–6.8 V. Never from 3.3 V.
- Current: 4–5 mA idle, up to **1.8 A stalled at 5 V** (2.6 A at 6.8 V). Running current is not published; plan on about 0.9 A while moving under load.
- Signal: 3.3 V logic from an ESP32 or Pico works.

## Interface details
- 500 µs = 0°, 1500 µs = 90° (neutral), 2500 µs = 180°; dead band 3 µs.
- MicroPython at 50 Hz (20 000 µs period): `duty_u16 = int(us * 65535 / 20000)`.
- The 270° version uses the same pulses for 0–270°: there, angle = (us − 500) × 270 / 2000.

## Wiring
- ESP32: SIG → GPIO25, V+ → separate 5–6 V supply (or VIN for light, unloaded tests), GND → GND (shared with the supply).
- Pico: SIG → GP2, V+ → separate 5–6 V supply (or VBUS for light tests), GND → GND.
- Raspberry Pi 4: SIG → GPIO18 (pin 12, hardware PWM), V+ → separate 5–6 V supply, GND → pin 6.

## Using it
```python
from machine import Pin, PWM
servo = PWM(Pin(25), freq=50)
def angle(deg):
    us = 500 + max(0, min(180, deg)) * 2000 / 180
    servo.duty_u16(int(us * 65535 / 20000))
angle(90)
```

## Gotchas
- Board resets when the servo moves: the supply is sagging. Use a separate 5–6 V, 2–3 A supply and a 470–1000 µF capacitor across V+/GND.
- Check the wire colours on your lead before powering: reversed supply can destroy it.
- If it buzzes at an end stop, it is straining against its limit; stay a few degrees inside 0–180.
- `duty_u16(0)` stops the pulses and lets the servo go limp (saves power).

## Datasheet
https://aifitlab.com/products/dsservo-ds3218-mg-servo-motor (DSSERVO spec table)
