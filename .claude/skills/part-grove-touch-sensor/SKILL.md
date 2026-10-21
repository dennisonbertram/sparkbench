---
name: part-grove-touch-sensor
description: Pinout, electrical limits, wiring and MicroPython driver for the Seeed Grove - Touch Sensor (Tontek TTP223-BA6 capacitive touch pad, Grove SIG/NC/VCC/GND, active-high output). Use when designing, wiring, simulating or writing code for a Grove Touch Sensor in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Seeed Grove - Touch Sensor (TTP223-BA6)

## Overview
A one-key capacitive touch pad on a Grove board. The **TTP223-BA6** from Tontek watches the round metal pad and drives SIG **high while a finger touches (or is very close to) the pad**, replacing a push button. On this board the mode is fixed: direct (momentary), active high, low-power mode, no maximum on-time. Hobbyists buy it as the **Seeed Grove - Touch Sensor** (blue 20 × 20 mm Grove board, 4-pin Grove socket).

## Pinout (Grove connector, pin 1 first; silkscreen GND, VCC, NC, SIG)
| Pin | Wire | Function |
|---|---|---|
| SIG | yellow | Touch output (TTP223 Q, push-pull CMOS), high while touched |
| NC | white | Not connected |
| VCC | red | Supply, 2.0–5.5 V |
| GND | black | Ground |

## Electrical limits
- Supply 2.0–5.5 V. SIG swings to VCC, so **power it from 3.3 V with an ESP32 or Pico**.
- Chip current 1.5–3 µA typical at 3 V (low-power mode); an indicator LED, if fitted, adds a little while touched.
- Output drive at 3 V: sinks 8 mA (VOL 0.6 V), sources 4 mA (VOH 2.4 V).
- Response time: up to ~220 ms for the first touch (low-power mode), ~60 ms while awake.

## Interface details
- Plain digital output, no protocol: read SIG as a GPIO input, no pull resistor needed.
- About 0.5 s calibration after power-on: keep fingers off the pad. It recalibrates about every 4 s while untouched.
- Senses through thin plastic, glass or paper (no metal).

## Wiring
- ESP32: SIG → GPIO4, VCC → 3V3, GND → GND (NC unused).
- Pico: SIG → GP15, VCC → 3V3(OUT), GND → GND.
- Raspberry Pi 4: SIG → pin 11 (GPIO17), VCC → pin 1 (3.3 V), GND → pin 6.
- The board has a 2 mm Grove socket: use a Grove-to-female-jumper cable to reach the breadboard.

## Using the driver
```python
from grove_touch import GroveTouch
import time
pad = GroveTouch(4)      # GPIO wired to SIG; waits 0.5 s for calibration
while True:
    print('TOUCH=%d' % pad.touched())
    time.sleep(0.2)
```
`irq(handler)` calls `handler(pin)` when a touch starts (`on_touch=False` for release).

## Gotchas
- **Powered from 5 V, SIG goes to 5 V** – too much for an ESP32/Pico pin. Use 3.3 V.
- Touching the pad during power-up spoils the baseline calibration; it then reads wrong until it recalibrates.
- A noisy or drifting supply causes false touches; keep leads short.
- Grove pin 2 (white) is NC on this module.

## Datasheet
https://files.seeedstudio.com/wiki/Grove-Touch_Sensor/res/TTP223.pdf (wiki: https://wiki.seeedstudio.com/Grove-Touch_Sensor/)
