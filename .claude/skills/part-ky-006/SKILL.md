---
name: part-ky-006
description: Pinout, electrical limits, wiring and MicroPython code for the KY-006 passive buzzer module (passive piezo buzzer, HW-508). Use when designing, wiring, simulating or writing code for a KY-006 buzzer in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# KY-006 passive buzzer module (KY-006)

## Overview
The **KY-006** is a **passive** piezo buzzer on a small 3-pin board. "Passive" means it has no oscillator: it only sounds while you feed it a square wave, and the pitch is the frequency of that wave. It is loudest near **2 kHz** and is specified for **1.5-2.5 kHz**, though it plays other notes more quietly. Hobbyists buy it as the **common KY-006 passive buzzer module** (Keyes / HW-508 clone, e.g. Electrokit 41015714), usually in the 37-in-1 sensor kits.

## Pinout (KY-006 module, header order)
| Pin | Function |
|---|---|
| S | Signal: PWM square wave = tone. Also powers the buzzer. |
| (middle) | Not used |
| - | Ground |

## Electrical limits
- Buzzer rated 1.5-15 V (Electrokit datasheet); drive it at 3.3-5 V from a GPIO (Joy-IT sensorkit).
- Current up to about 25 mA, drawn from the GPIO driving S.
- Frequency range 1.5-2.5 kHz (resonance about 2 kHz).

## Interface details
- PWM output: `PWM(Pin(n))`, `freq(hz)` sets the note, `duty_u16(32768)` (50 %) plays it, `duty_u16(0)` silences it. No driver needed.
- A steady DC level does nothing but click; for a fixed beep from plain on/off use an active buzzer (KY-012).

## Wiring
- ESP32: S -> D25, - -> GND, middle pin unconnected.
- Pico: S -> GP15, - -> GND.
- Raspberry Pi 4: S -> pin 18 (GPIO24), - -> pin 6 (use gpiozero TonalBuzzer or software PWM).
- More volume / 5 V: NPN transistor (2N2222, 1 kOhm base resistor from the GPIO), buzzer S -> 5 V, buzzer - -> collector, emitter -> GND.

## Using it
```python
from machine import Pin, PWM
import time
bz = PWM(Pin(25))
for f in (1568, 1760, 1976, 2093):  # G6 A6 B6 C7
    bz.freq(f)
    bz.duty_u16(32768)
    time.sleep(0.2)
bz.duty_u16(0)
```

## Gotchas
- Only clicks? You are driving it with a plain high/low; use PWM.
- Constant tone that will not change pitch? You have an active buzzer (KY-012), not a KY-006.
- Leave duty at 0 when idle; a PWM left running keeps beeping.
- Clone boards vary; some label the middle pin + or swap the outer pins. Read the silkscreen.

## Datasheet
https://www.electrokit.com/upload/product/41015/41015714/Passive_Piezo_Buzzer.pdf
