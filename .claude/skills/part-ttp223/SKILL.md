---
name: part-ttp223
description: Pinout, electrical limits, wiring and MicroPython driver for the TTP223 capacitive touch button module (Tontek TTP223-BA6). Use when designing, wiring, simulating or writing code for a TTP223 touch sensor in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# TTP223 capacitive touch button module (TTP223)

## Overview
The **TTP223** from Tontek is a one-key capacitive touch detector. It replaces a push button: touch the pad and its output changes level. Hobbyists buy it on the **tiny 3-pin TTP223 touch module** (about 15 × 11 mm, red or blue, round "TOUCH" pad on the front, TTP223-BA6 in SOT-23-6 on the back). It has a red LED that lights while touched, and two solder pads A and B that set the output mode.

## Pinout (3-pin header, as printed on the back: VCC, I/O, GND)
| Pin | Function |
|---|---|
| VCC | Supply, 2.0–5.5 V |
| I/O | Touch output (chip pin Q, push-pull CMOS). High while touched by default |
| GND | Ground |

## Electrical limits
- Supply: 2.0–5.5 V (absolute max 5.5 V). The I/O output swings to VCC, so **power it from 3.3 V on an ESP32 or Pico**.
- Chip current: 1.5–3 µA (typical, 3 V, low-power mode); the on-board LED adds a few mA while touched.
- Output drive at 3 V: sinks 8 mA (VOL 0.6 V), sources 4 mA (VOH 2.4 V).
- Operating temperature −20 to 70 °C.

## Interface details
- Plain digital output, no protocol. Read the I/O pin as a GPIO input; no pull resistor needed (CMOS output).
- Pads (bridge with solder): **A → active low** (AHLB=1), **B → toggle/latching** (TOG=1). Both open (factory default) = momentary, active high.

| A | B | Behaviour |
|---|---|---|
| open | open | Momentary, high while touched (default) |
| short | open | Momentary, low while touched |
| open | short | Toggle, starts low; each touch flips the output |
| short | short | Toggle, starts high |

- Timing: about 0.5 s calibration after power-on (keep fingers off); the BA6 package is fixed in low-power mode, so the first touch can take up to about 220 ms, then ~60 ms while awake. Recalibrates about every 4 s when untouched.
- Sensitivity: a capacitor (0–50 pF) from the sense pad to GND lowers sensitivity; some boards have an empty pad for it.

## Wiring
- ESP32: VCC → 3V3, GND → GND, I/O → GPIO4.
- Pico: VCC → 3V3(OUT), GND → GND, I/O → GP15.
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, I/O → GPIO17 (pin 11).

## Using the driver
```python
from ttp223 import TTP223
import time
pad = TTP223(4)          # GPIO wired to I/O
while True:
    print('TOUCH=%d' % pad.touched())
    time.sleep(0.2)
```
Pass `active_high=False` if pad A is bridged. `irq(handler)` calls `handler` when a touch starts.

## Gotchas
- **Powered from 5 V the output is 5 V** – too much for an ESP32/Pico pin. Use 3.3 V.
- Don't touch the pad while powering up: the chip calibrates its baseline in the first 0.5 s and may then read "touched" the wrong way round until it recalibrates.
- It senses through thin plastic or glass (no metal) — mount it behind a panel up to a few mm thick.
- A noisy or shifting supply causes false touches; add a 100 nF capacitor across VCC/GND if the wiring is long.

## Datasheet
https://files.seeedstudio.com/wiki/Grove-Touch_Sensor/res/TTP223.pdf
