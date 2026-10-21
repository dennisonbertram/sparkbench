---
name: part-grove-loudness-sensor
description: Pinout, electrical limits, wiring and MicroPython driver for the Seeed Grove - Loudness Sensor (LM2904 op-amp, analog sound envelope on SIG, Grove pins SIG/NC/VCC/GND). Use when designing, wiring, simulating or writing code for a Grove Loudness Sensor in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Grove - Loudness Sensor (LM2904)

## Overview
The **Seeed Grove - Loudness Sensor** (v0.9b) puts a microphone in front of a **TI LM2904** dual op-amp. Unlike a plain microphone breakout it does not output the audio waveform: the op-amp stages are referenced to GND on a single supply, so only the positive half of the sound is amplified, and a 47 kΩ / 1 µF filter (47 ms) smooths it into a **positive envelope**.
- **SIG ≈ 0 V in silence** and rises with loudness.
- The top is set by the LM2904 output limit, **about VCC − 1.5 V** (≈ 3.5 V on 5 V).
- Gain (about 1 + 560k / (1k + trimmer)) is set with the screw potentiometer.
- It is a relative loudness level, not a calibrated dB meter. Seeed's Arduino example simply prints `analogRead()` 0–1023.

## Pinout (Grove connector, pin 1 to 4, from Seeed's schematic)
| Pin | Name | Wire | Function |
|-----|------|------|----------|
| 1 | SIG | yellow | Envelope output (analog) |
| 2 | NC | white | Not connected |
| 3 | VCC | red | Supply, 3.5–10 V |
| 4 | GND | black | Ground |

## Electrical limits
- Supply: **3.5–10 V** (Seeed spec; the LM2904 itself runs from 3–26 V). Power it from **5 V**: 3.3 V is below its minimum.
- Current: LM2904 0.7 mA typ / 1.2 mA max at 5 V (both amplifiers), plus the microphone: about 2 mA total.
- SIG can reach ~3.5 V on a 5 V supply, a little above a 3.3 V ADC's range. The 47 kΩ resistor in series with SIG limits the current to a few µA, so it is safe, but very loud sounds read as full scale.

## Interface details
- Analog only: SIG straight to an ADC pin.
- Read it as a level: average fast samples over ~50 ms to remove the ripple left by the 47 ms filter.
- A threshold (e.g. > 0.05 V, or Seeed's "value > 10" out of 1023) detects a loud sound.

## Wiring
| Board | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| VCC | 5V / VIN | VBUS (pin 40) | 5 V (pin 2) |
| GND | GND | GND | GND (pin 6) |
| SIG | GPIO32–39 (ADC1) | GP26/27/28 (ADC) | External ADC (e.g. ADS1115) |
| NC | – | – | – |

Use a Grove-to-female-jumper cable (the board has a 2 mm Grove socket, not header pins). On the ESP32 use ADC1 pins (ADC2 stops working while Wi-Fi is on).

## Using the driver
```python
from grove_loudness import GroveLoudness
import time
mic = GroveLoudness(34)       # GPIO wired to SIG
while True:
    print('level=%.2fV peak=%.2fV' % (mic.level(), mic.peak()))
    time.sleep(0.2)
```
`level(window_ms=50)` averages SIG in volts; `peak()` is the highest reading in the window; `raw10()` gives Seeed's 0–1023 scale (10-bit, 5 V full scale).

## Gotchas
- **It is not a waveform**: don't compute peak-to-peak like a MAX4466; the envelope already is the loudness.
- **3.3 V supply**: below the 3.5 V minimum, the output range shrinks to almost nothing. Use 5 V.
- **Slow response**: the 47 ms filter smooths out very short clicks; use `peak()` for claps.
- **Gain too high**: SIG sits at the top limit for ordinary sound. Turn the trimmer down.

## Datasheet
LM2904: https://files.seeedstudio.com/wiki/Grove-Loudness_Sensor/res/LM2904DR.pdf. Board: https://wiki.seeedstudio.com/Grove-Loudness_Sensor/
