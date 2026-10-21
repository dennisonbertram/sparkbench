---
name: part-sound-sensor-do
description: Pinout, electrical limits, wiring and MicroPython driver for the LM393 sound detection module (electret microphone + LM393 comparator, digital OUT only, FC-04 / MH-sensor style). Use when designing, wiring, simulating or writing code for a sound / clap / noise detector module in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# LM393 sound detection module (DO only)

## Overview
The **LM393 sound detection module** (blue MH-sensor-series board, often sold as FC-04) has:
- an **electret microphone**
- an **LM393 comparator**, a blue **sensitivity trimmer**, a power LED and a status LED

It has one output, **OUT**, a yes/no "is it loud?" signal:
- **HIGH** when it is quiet
- **LOW** (status LED lit) while the sound is louder than the trimmer threshold

OUT does not measure volume. It only says whether a sound crossed the threshold.

## Pinout (3-pin header, as printed)
| Pin | Name | Function |
|-----|------|----------|
| 1 | OUT | Digital output: HIGH = quiet, LOW = sound (pulled up to VCC on the board) |
| 2 | GND | Ground |
| 3 | VCC | Supply, 3.3–5 V |

## Electrical limits
- Supply: **3.3–5 V** (module rating; the LM393 itself runs on 2–36 V). A few mA with the LEDs on.
- The LM393 output is open-collector (TI datasheet: sinks at least 6 mA at 1.5 V); the board pulls OUT up to VCC.
- **On an ESP32 or Pico, power the module from 3.3 V** so OUT never goes above 3.3 V.

## Interface details
- The comparator compares the microphone signal with the trimmer voltage. It switches in about 1 µs, so OUT follows the sound wave itself: a clap gives a burst of short LOW pulses, not one steady LOW.
- So **sample OUT over a short window** (the driver's `heard(50)` watches it for 50 ms) or use a falling-edge interrupt. A single `value()` read can miss a sound.
- There is no calibration or dB scale. Set the threshold with the trimmer.

## Wiring
| Module | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| OUT | any GPIO, e.g. GPIO25 | any GP, e.g. GP2 | any GPIO, e.g. GPIO24 (pin 18) |
| GND | GND | GND | GND (pin 6) |
| VCC | 3V3 | 3V3(OUT) | 3.3 V (pin 1) |

## Using the driver
```python
from sound_do import SoundDO
import time
mic = SoundDO(25)             # OUT GPIO; active_low=False for boards whose OUT goes HIGH on sound
while True:
    print('Sound: %s' % ('YES' if mic.heard(50) else 'quiet'))
    time.sleep(0.2)
```

## Gotchas
- **OUT is backwards**: LOW means sound. Check yours: clap and watch the status LED.
- **Set the threshold**: in silence, turn the trimmer until the status LED just goes off, then back it off a little. Too sensitive and the LED stays on.
- It only reacts to fairly loud, close sounds (claps, knocks, speech up close). It cannot tell you how loud it is: use a module with an AO pin or an analog microphone (MAX4466, MAX9814) for that.
- The pin order is OUT, GND, VCC; plugging it in reversed puts the supply on OUT.

## Datasheet
https://www.ti.com/lit/ds/symlink/lm393.pdf (LM393 comparator on the board).
