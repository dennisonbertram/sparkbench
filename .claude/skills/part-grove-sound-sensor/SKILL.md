---
name: part-grove-sound-sensor
description: Pinout, electrical limits, wiring and MicroPython driver for the Seeed Grove - Sound Sensor v1.6 (LM358 microphone amplifier, AC-coupled analog sound on SIG, Grove pins SIG/NC/VCC/GND). Use when designing, wiring, simulating or writing code for a Grove Sound Sensor in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Grove - Sound Sensor (LM358)

## Overview
The **Seeed Grove - Sound Sensor v1.6** (SKU 101020023) is an electret microphone followed by an **LM358** dual op-amp. From Seeed's v1.6 schematic:
- The mic is biased by 10 kΩ from VCC and AC coupled (1 µF, 100 kΩ to GND) into two **non-inverting stages, each 1 + 10k/1k = 11** (about ×121 in total). There is no gain trimmer.
- Both stages are referenced to GND on a single supply, so only the **positive half** of the sound is amplified (LM358 output 0 V to VCC − 1.5 V).
- The amplifier output reaches **SIG through a 220 nF capacitor in series**: SIG is **AC coupled** and the board gives it **no DC level**. A single reading means nothing.
- Measure loudness as the **peak-to-peak** spread of fast samples over ~50 ms. It is a relative level, not a calibrated dB meter.
- Not the same board as the Grove *Loudness* Sensor (LM2904, which outputs a smoothed envelope).

## Pinout (Grove connector, pin 1 to 4, from Seeed's v1.6 schematic J1)
| Pin | Name | Wire | Function |
|-----|------|------|----------|
| 1 | SIG | yellow | Sound output (AC coupled through 220 nF) |
| 2 | NC | white | Not connected |
| 3 | VCC | red | Supply, 5 V |
| 4 | GND | black | Ground |

## Electrical limits
- Supply: **5 V** (Seeed spec; the LM358 itself needs 3–30 V, and on 3.3 V its output range shrinks to ~1.8 V).
- Current: 4–5 mA at 5 V (Seeed spec; LM358 0.7 mA typ / 1.2 mA max).
- Amplifier swing at 5 V: 0 to ~3.5 V peak-to-peak. Through the series 220 nF only the swing reaches SIG, so a 3.3 V ADC pin is not driven by a DC level from the board.

## Interface details
- Analog only: SIG to an ADC pin.
- **Recommended:** give SIG a DC level with two 100 kΩ resistors (one from the ADC pin to 3V3, one to GND). SIG then idles at 1.65 V and the sound swings around it. Without them the level drifts, and the negative half is clipped by the ADC pin.
- Loudness = max − min over ~50 ms. Seeed's Arduino example averages 32 `analogRead()` values; with an AC-coupled output that average only shows the DC level, so use peak-to-peak.

## Wiring
| Board | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| VCC | 5V / VIN | VBUS (pin 40) | 5 V (pin 2) |
| GND | GND | GND | GND (pin 6) |
| SIG | GPIO32–39 (ADC1) | GP26/27/28 (ADC) | External ADC (e.g. ADS1115) |
| NC | – | – | – |

Use a Grove-to-female-jumper cable (the board has a 2 mm Grove socket). On the ESP32 use ADC1 pins (ADC2 stops working while Wi-Fi is on). Add the 2 × 100 kΩ bias divider at the ADC pin.

## Using the driver
```python
from grove_sound import GroveSound
import time
mic = GroveSound(34)          # GPIO wired to SIG
while True:
    print('p-p=%.2fV' % mic.peak_to_peak())
    time.sleep(0.2)
```
`peak_to_peak(window_ms=50)` returns the swing in volts; `average(n=32)` is the DC level (1.65 V with the bias divider); `voltage()` is one reading.

## Gotchas
- **One reading or an average is not loudness**: SIG is AC coupled. Use peak-to-peak.
- **No DC bias on the board**: add the 100 kΩ / 100 kΩ divider, or readings wander and the bottom half is clipped.
- **3.3 V supply**: below Seeed's 5 V spec the LM358 output range is tiny. Use 5 V.
- **Fixed gain**: no trimmer; very loud sound clips at ~3.5 V p-p.

## Datasheet
LM358: https://files.seeedstudio.com/wiki/Grove_Sound_Sensor/res/LM358.pdf. Board: https://wiki.seeedstudio.com/Grove-Sound_Sensor/ (schematic https://files.seeedstudio.com/wiki/Grove_Sound_Sensor/res/Grove%20-%20Sound%20Sensor%20v1.6%20Schematic.pdf)
