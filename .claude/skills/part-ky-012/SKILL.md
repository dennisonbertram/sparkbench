---
name: part-ky-012
description: Pinout, electrical limits, wiring and MicroPython code for the KY-012 active buzzer module (active piezo buzzer). Use when designing, wiring, simulating or writing code for a KY-012 buzzer in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# KY-012 active buzzer module (KY-012)

## Overview
The **KY-012** is an **active** piezo buzzer on a small 3-pin board. "Active" means it has its own oscillator: apply 3.3–5 V DC between S and - and it beeps at about **2.5 kHz (2500 ± 300 Hz)**, at least **85 dB**. Hobbyists buy it as the **Joy-IT / Keyes KY-012 active piezo buzzer module (COM-KY012APB)**, usually in the 37-in-1 sensor kits.

## Pinout (KY-012 module, header order)
| Pin | Function |
|---|---|
| S | Signal: high = beep, low = silent. Also powers the buzzer. |
| (middle) | Not connected |
| - | Ground |

## Electrical limits
- Operating voltage 3.3–5 V DC on S (Joy-IT sensorkit technical data; the older 2020 datasheet lists 3–5.5 V, the 2024 manual 3–5 V, so stay within 3.3–5 V).
- Current up to about 30 mA, drawn straight from the GPIO driving S.
- Tone 2500 ± 300 Hz, fixed; sound output ≥ 85 dB.

## Interface details
- Plain digital output: `Pin.value(1)` = on, `Pin.value(0)` = off. No driver needed.
- PWM does not set the pitch of an active buzzer; for tunes use a passive buzzer (KY-006).

## Wiring
- ESP32: S → D25, - → GND, middle pin unconnected.
- Pico: S → GP2, - → GND (quieter: a Pico pin gives at most 12 mA; use a transistor for full volume).
- Raspberry Pi 4: S → pin 18 (GPIO24), - → pin 6.
- Full volume / 5 V: NPN transistor (2N2222, 1 kΩ base resistor from the GPIO), buzzer S → 5 V, buzzer - → collector, emitter → GND.

## Using it
```python
from machine import Pin
import time
buzzer = Pin(25, Pin.OUT, value=0)  # S
buzzer.value(1)   # beep
time.sleep(0.5)
buzzer.value(0)   # quiet
```

## Gotchas
- Silent? Check you have an active buzzer (sealed bottom, beeps on a plain 3 V battery). A passive buzzer (KY-006, open green PCB underneath) only clicks on DC.
- The GPIO supplies all the buzzer current: fine on an ESP32, marginal on a Pico or Raspberry Pi pin.
- Clone boards vary; some label the middle pin + or swap the outer pins. Read the silkscreen.
- It is loud. Keep beeps short while testing.

## Datasheet
https://www.joy-it.net/files/files/Produkte/COM-KY012APB/COM-KY012APB-Datasheet-20200408.pdf
