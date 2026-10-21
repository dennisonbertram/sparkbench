---
name: part-active-buzzer-5v
description: Pinout, electrical limits, wiring and MicroPython usage for a 5 V active buzzer (TMB12A05, 12 mm magnetic buzzer with built-in oscillator). Use when designing, wiring, simulating or writing code for an active buzzer in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Active buzzer 5 V (TMB12A05)

## Overview
The **TMB12A05** (Jiangsu Huawha / HNDZ and many clones) is a bare 12 × 9.5 mm magnetic buzzer with its own oscillator. Apply DC across its leads and it beeps at about **2.4 kHz** (2400 ± 300 Hz), at least 95 dB at 10 cm at 5 V. No PWM or tone generation is needed: on = beep, off = silent.

## Pinout (bare buzzer, two leads 7.6 mm apart)
| Pin | Function |
|---|---|
| + | Positive lead (longer leg, + on the sticker): GPIO or + supply |
| - | Negative lead: GND |

## Electrical limits
- Rated 5 V DC; operating range 3–7 V DC.
- Current ≤ 30 mA (datasheet curve: about 13 mA at 3.3 V, about 22 mA at 5 V).
- Operating temperature −40 to +85 °C.

## Wiring
- ESP32 (direct): + → any GPIO (e.g. D25), - → GND. About 13 mA at 3.3 V, within an ESP32 pin's rating.
- Pico or full volume: + → 5 V (VBUS/VIN), - → collector of an NPN (2N2222/S8050), emitter → GND, base → GPIO through 1 kΩ. GPIO high = beep.
- Raspberry Pi: use the transistor circuit (Pi GPIOs are rated for about 16 mA).

## Using it
```python
from machine import Pin
import time
buzzer = Pin(25, Pin.OUT, value=0)
buzzer.value(1)   # beep
time.sleep(0.2)
buzzer.value(0)   # quiet
```

## Gotchas
- Polarity matters; reversed it stays silent.
- It is an *active* buzzer: PWM does not change the pitch, it just crackles. Use a passive buzzer for melodies.
- Never feed more than 7 V.
- The 'remove seal after washing' sticker muffles it slightly; peel it off after soldering for full volume.
- The 7.6 mm lead spacing spans three breadboard hole pitches.

## Datasheet
https://www.electrokit.com/upload/quick/0a/0c/a15b_41037353-tds.pdf
