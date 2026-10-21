---
name: part-ky-037
description: Pinout, electrical limits, wiring and MicroPython driver for the KY-037 high-sensitivity sound sensor module (KY-037, AO + DO). Use when designing, wiring, simulating or writing code for a KY-037 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# KY-037 high-sensitivity sound sensor module (KY-037)

## Overview
The **KY-037** is a black 4-pin module with a **large (about 10 mm) electret microphone**, an **LM393 comparator**, a blue multi-turn trimmer (sensitivity), a power LED (LED1) and a "sound" LED (LED2). It is the high-sensitivity sibling of the KY-038 (same circuit, bigger microphone) and is sold in the 37-in-1 / 40-in-1 sensor kits, for example the **Joy-IT SensorKit KY-037**.
- **AO**: the microphone signal itself, a DC level with the audio riding on it. Joy-IT notes it is inverted: a stronger signal gives a *lower* AO voltage.
- **DO**: the LM393 output (with the module's pull-up). It goes **HIGH** while the sound is past the trimmer threshold and LED2 lights.
- It detects "loud or not" (claps, knocks, voices). It is **not** a calibrated sound-level (dB) meter and is poor for recording audio.

## Pinout (module header, as printed on the board)
| Pin | Name | Function |
|-----|------|----------|
| 1 | AO | Analog microphone signal |
| 2 | G | Ground |
| 3 | + | Supply, 3.3–5 V |
| 4 | DO | Digital output, HIGH = sound above threshold |

## Electrical limits
- Supply: **3.3–5 V** (Joy-IT wires it to 5 V on Arduino and to 3.3 V on Raspberry Pi / Pico). The LM393 itself runs on 2–36 V.
- Current: a few mA, mostly the two LEDs.
- AO and DO swing up to the supply voltage. **On an ESP32, Pico or Raspberry Pi, power the module from 3.3 V** so neither output can go above 3.3 V.

## Interface details
- DO = LM393 comparing the microphone signal with the trimmer voltage. Turn the trimmer until LED2 just goes out in a quiet room; a clap then makes DO go HIGH for a moment. The pulses are short, so poll often or use an interrupt.
- AO is a DC level plus audio. A single ADC reading says little: take many quick samples and use the **peak-to-peak** spread as loudness (`peak_to_peak()` in the driver), or the averaged level (`voltage()`).

## Wiring
| Module | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| + | 3V3 | 3V3(OUT) (pin 36) | 3.3 V (pin 1) |
| G | GND | GND | GND (pin 6) |
| DO | any GPIO, e.g. GPIO25 | any GP, e.g. GP2 | any GPIO, e.g. GPIO24 (pin 18) |
| AO | GPIO32–39 (ADC1) | GP26/27/28 (ADC) | External ADC (e.g. KY-053 / ADS1115) |

On the ESP32 use ADC1 pins (ADC2 does not work while Wi-Fi is on). The Raspberry Pi has no ADC: use DO alone or add one.

## Using the driver
```python
from ky037 import KY037
import time
mic = KY037(32, 25)   # AO GPIO, DO GPIO
while True:
    print('AO=%.2fV p-p=%.2fV sound=%s' % (mic.voltage(), mic.peak_to_peak(), mic.detected()))
    time.sleep(0.2)
```
`voltage()` averages 32 samples (`read_uv()` on ESP32, else `read_u16()` × 3.3 V). `detected()` is True while DO is HIGH.

## Gotchas
- **Trimmer first**: out of the box DO is often stuck HIGH or LOW. It is a 25-turn pot (3296), so turn it many times while watching LED2.
- **DO is active HIGH** on the KY-037 (Joy-IT). Some other sound modules (3-pin boards) are active LOW, so check the LED.
- **5 V supply + 3.3 V board** puts 5 V on the GPIO pins. Use 3.3 V.
- **AO is inverted and noisy**: compare spreads, not single values.

## Datasheet
https://www.ti.com/lit/ds/symlink/lm393.pdf (LM393 comparator). Module documentation: https://sensorkit.joy-it.net/en/sensors/ky-037
