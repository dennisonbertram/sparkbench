---
name: part-sparkfun-sound-detector
description: Pinout, electrical limits, wiring and MicroPython driver for the SparkFun Sound Detector (SEN-12642 / SEN-14262, electret mic + LMV324, AUDIO / ENVELOPE / GATE outputs, header GND/VCC/GATE/ENVELOPE/AUDIO). Use when designing, wiring, simulating or writing code for a SparkFun Sound Detector in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# SparkFun Sound Detector (LMV324)

## Overview
The **SparkFun Sound Detector** (SEN-12642; SEN-14262 is the same board with headers fitted) is an electret microphone and an **LMV324** quad rail-to-rail op-amp. It gives three outputs at once (SparkFun v11 schematic and hookup guide):
- **AUDIO**: the microphone signal amplified ×100 (inverting preamp, R3 100k / R2 1k), DC coupled and riding on **VCC/2** (2.5 V on 5 V). Loudness = peak-to-peak swing.
- **ENVELOPE**: a precision rectifier (gain 2.2) and peak hold (10 µF / 10 kΩ, ~0.1 s decay) with a buffer: **0 V when quiet**, rising with loudness. Read it with an ADC.
- **GATE**: a Schmitt trigger on the envelope: **LOW when quiet, HIGH while sound is present** (the red LED follows it). Read it with a digital input or an interrupt.
Each output leaves the board through a 100 Ω resistor. The values are relative, not calibrated dB.

## Pinout (header JP1, pin 1 to 5, as printed on the board)
| Pin | Name | Function |
|-----|------|----------|
| 1 | GND | Ground |
| 2 | VCC | Supply, 3.5–5.5 V (5 V ideal) |
| 3 | GATE | Digital: HIGH while sound is detected |
| 4 | ENVELOPE | Analog: amplitude of the sound, 0 V in silence |
| 5 | AUDIO | Analog: audio waveform on VCC/2 |

## Electrical limits
- Supply: **3.5–5.5 V** (SparkFun; the LMV324 itself is rated 2.5–5.5 V, 6 V absolute max). Use a clean supply: ripple above ~10 mV makes it unstable.
- Current: a few mA (LMV324 ~0.4 mA, mic bias and LED ~1–2 mA each).
- Outputs are **rail-to-rail**: on 5 V, AUDIO, ENVELOPE and GATE can all reach 5 V. On a 3.3 V board put a **divider on each output used** (10 kΩ from the output to the pin, 15 kΩ from the pin to GND: ×0.6, 5 V → 3.0 V). SparkFun recommends 5 V for the module and level-translating the outputs rather than running it on 3.3 V.

## Interface details
- AUDIO: sample fast for ~50 ms and take max − min. In silence it reads VCC/2.
- ENVELOPE: a slow DC level; average a few readings.
- GATE: plain push-pull logic level, no pull-up needed. Threshold is fixed (R11/R12 from VCC, R14 hysteresis); change sensitivity with the preamp gain (fit R17 in parallel with R3 to lower it).
- Unused outputs can be left unconnected.

## Wiring
| Module | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| VCC | 5V / VIN | VBUS (pin 40) | 5 V (pin 2) |
| GND | GND | GND | GND (pin 6) |
| GATE | any GPIO via 10k/15k divider | any GP via divider | any GPIO via divider |
| ENVELOPE | GPIO32–39 (ADC1) via divider | GP26/27/28 via divider | external ADC |
| AUDIO | GPIO32–39 (ADC1) via divider | GP26/27/28 via divider | external ADC |

## Using the driver
```python
from sound_detector import SoundDetector
import time
sd = SoundDetector(audio=34, envelope=35, gate=25)   # scale=25/15 undoes the 10k/15k dividers
while True:
    print('env=%.2fV gate=%d p-p=%.2fV' % (sd.envelope(), sd.gate(), sd.peak_to_peak()))
    time.sleep(0.2)
```
`envelope()` and `peak_to_peak()` return volts at the module (the divider is undone with `scale`); pass `scale=1` if wired without dividers.

## Gotchas
- **5 V outputs**: powered from 5 V, all three outputs reach 5 V. Use the dividers on a 3.3 V board.
- **Too sensitive**: air conditioning or music next door can trip GATE. Lower the gain with R17 (100k ∥ 100k = ×50, 33 dB).
- **Noisy USB power** shows up as noise or a constant tone; batteries (3 × AA = 4.5 V) or a regulated 5 V work best.
- Handling and wind noise are picked up; mount it on foam.

## Datasheet
LMV324: http://cdn.sparkfun.com/datasheets/Sensors/Sound/LMV324.pdf. Board: https://www.sparkfun.com/products/12642, schematic https://cdn.sparkfun.com/assets/8/a/1/2/5/sound-detector-v11.pdf, guide https://learn.sparkfun.com/tutorials/sound-detector-hookup-guide
