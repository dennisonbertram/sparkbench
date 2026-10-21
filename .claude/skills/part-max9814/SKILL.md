---
name: part-max9814
description: Pinout, electrical limits, wiring and MicroPython driver for the MAX9814 AGC electret microphone amplifier breakout (Adafruit #1713, GND/Vdd/Gain/Out/AR). Use when designing, wiring, simulating or writing code for a MAX9814 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MAX9814 AGC electret microphone amplifier (MAX9814)

## Overview
The **MAX9814** (Analog Devices / Maxim) is a microphone amplifier with **automatic gain control (AGC)** and a built-in 2 V mic bias. Hobbyists buy it on the **Adafruit AGC Electret Microphone Amplifier - MAX9814 (product #1713)**: an electret mic and the MAX9814 on a small 5-pin board. Generic "MAX9814 microphone module" clones copy the same design, but check the order printed on your board.
- **Out** carries the audio waveform on a **DC bias of about 1.25 V** (datasheet: 1.23 V typical, 1.14–1.32 V). In silence it sits steady at that level.
- The swing is at most about **2 Vpp** (0.707 Vrms), whatever the supply, so Out stays within a 3.3 V ADC's range.
- The AGC turns loud nearby sounds down and quiet far-away sounds up, so the swing does not tell you absolute loudness (dB).

## Pinout (Adafruit #1713 header; pin numbers from Adafruit's EAGLE board file, J2)
Wire by the labels printed next to each pin. Pin 1 is GND; read from the other end the row is AR, Out, Gain, Vdd, GND.

| Pin | Name | Function |
|-----|------|----------|
| 1 | GND | Ground |
| 2 | Vdd | Supply, 2.7–5.5 V |
| 3 | Gain | Max gain: float 60 dB, GND 50 dB, Vdd 40 dB |
| 4 | Out | Audio out, biased at ~1.25 V |
| 5 | AR | Attack/release ratio: float 1:4000, Vdd 1:2000, GND 1:500 |

## Electrical limits
- Supply: **2.7–5.5 V** (datasheet operating voltage).
- Current: 3.1 mA typical, 6 mA max.
- Out: ~1.25 V bias, up to ~2 Vpp, so about 0.25–2.25 V. Safe for 3.3 V ADCs even when Vdd is 5 V.
- AR and Gain are three-level inputs: leave them floating, or tie them directly to Vdd or GND (not to a GPIO driving 3.3 V when Vdd is 5 V).

## Interface details
- Analog only: connect Out straight to an ADC pin. For line-in or headphones add a 1 µF series capacitor to block the DC bias.
- Silence = ~1.25 V. Loudness = max − min of fast samples over ~50 ms (covers down to 20 Hz).
- Gain floating (60 dB) can sound noisy; Adafruit suggests 40 or 50 dB for most uses.

## Wiring
| Board | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| Vdd | 3V3 | 3V3(OUT) (pin 36) | 3.3 V (pin 1) |
| GND | GND | GND | GND (pin 6) |
| Out | GPIO32–39 (ADC1) | GP26/27/28 (ADC) | External ADC (e.g. ADS1115/MCP3008) |
| Gain | leave open, or to Vdd / GND | same | same |
| AR | leave open | same | same |

On the ESP32 use ADC1 pins (ADC2 stops working while Wi-Fi is on). The Raspberry Pi has no ADC.

## Using the driver
```python
from max9814 import MAX9814
import time
mic = MAX9814(34)          # GPIO wired to Out
while True:
    print('bias=%.2fV p-p=%.2fV' % (mic.bias(), mic.peak_to_peak()))
    time.sleep(0.2)
```
`peak_to_peak(window_ms=50)` returns the swing in volts; `bias()` averages the DC level; `voltage()` is one reading (`read_uv()` on ESP32, else `read_u16()` × 3.3 V).

## Gotchas
- **One reading means nothing**: the signal is a wave around 1.25 V. Use peak-to-peak.
- **AGC hides loudness**: a shout and a distant voice can give similar swings. Use the MAX4466 if you need a fixed gain.
- **Noisy supply = noisy audio**: USB power and Wi-Fi bursts show up on Out. Batteries or a clean 3.3 V work best.
- **Bias is not VCC/2**: it is ~1.25 V on any supply, unlike the MAX4466.

## Datasheet
https://cdn-shop.adafruit.com/datasheets/MAX9814.pdf (Analog Devices MAX9814 datasheet). Board: https://www.adafruit.com/product/1713
