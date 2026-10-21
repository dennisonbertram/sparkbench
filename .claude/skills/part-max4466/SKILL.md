---
name: part-max4466
description: Pinout, electrical limits, wiring and MicroPython driver for the MAX4466 electret microphone amplifier breakout (Adafruit #1063, OUT/GND/VCC). Use when designing, wiring, simulating or writing code for a MAX4466 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MAX4466 electret microphone amplifier (MAX4466)

## Overview
The **MAX4466** (Analog Devices / Maxim) is a low-power op-amp made for microphone preamps. Hobbyists buy it on the **Adafruit Electret Microphone Amplifier - MAX4466 with Adjustable Gain (product #1063)**: an electret mic, the MAX4466 and a gain trimmer (about **25x to 125x**) on a small 3-pin board. Generic purple/blue "GY-MAX4466" clones copy the same design.
- **OUT** carries the audio waveform, **DC biased at VCC/2** (DC coupled). In silence it sits steady at VCC/2 (1.65 V on 3.3 V).
- The output is **rail-to-rail**: loud sound swings it from near 0 V to near VCC.
- It is an analog signal, not a sound-level (dB) meter. Measure loudness as the **peak-to-peak** swing over a short window.

## Pinout (Adafruit #1063 header, as printed on the board)
| Pin | Name | Function |
|-----|------|----------|
| 1 | OUT | Audio out, biased at VCC/2 |
| 2 | GND | Ground |
| 3 | VCC | Supply, 2.4–5.5 V |

## Electrical limits
- Supply: **2.4–5.5 V** (datasheet supply range; printed on the board as "VCC: 2.4-5.5V").
- Current: amplifier 24 µA typical (48 µA max), plus the electret mic bias (well under 1 mA).
- OUT swings to both supply rails. **On an ESP32, Pico or Raspberry Pi, power it from 3.3 V** so OUT never goes above 3.3 V. 3.3 V is also the "quietest" supply.

## Interface details
- Analog only: connect OUT straight to an ADC pin (no capacitor or extra amplifier needed).
- Silence = VCC/2. Loudness = max − min of fast samples over ~50 ms (covers down to 20 Hz).
- Turn the trimmer on the back to set the gain: too high and loud sounds clip at the rails, too low and quiet sounds barely move the ADC.

## Wiring
| Board | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| VCC | 3V3 | 3V3(OUT) (pin 36) | 3.3 V (pin 1) |
| GND | GND | GND | GND (pin 6) |
| OUT | GPIO32–39 (ADC1) | GP26/27/28 (ADC) | External ADC (e.g. ADS1115/MCP3008) |

On the ESP32 use ADC1 pins (ADC2 stops working while Wi-Fi is on). The Raspberry Pi has no ADC.

## Using the driver
```python
from max4466 import MAX4466
import time
mic = MAX4466(34)          # GPIO wired to OUT
while True:
    print('bias=%.2fV p-p=%.2fV' % (mic.bias(), mic.peak_to_peak()))
    time.sleep(0.2)
```
`peak_to_peak(window_ms=50)` returns the swing in volts; `bias()` averages the DC level; `voltage()` is one reading (`read_uv()` on ESP32, else `read_u16()` × 3.3 V).

## Gotchas
- **5 V supply + 3.3 V board**: OUT can swing to 5 V and damage the GPIO. Use 3.3 V.
- **One reading means nothing**: the signal is a wave around VCC/2. Use peak-to-peak.
- **Noisy supply = noisy audio**: USB 5 V and Wi-Fi bursts show up on OUT. Use 3.3 V and keep wires short.
- **Clipping**: flat tops at 0 V / VCC mean the gain trimmer is too high.

## Datasheet
https://www.analog.com/media/en/technical-documentation/data-sheets/MAX4465-MAX4469.pdf. Board: https://www.adafruit.com/product/1063
