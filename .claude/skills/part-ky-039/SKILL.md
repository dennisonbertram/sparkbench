---
name: part-ky-039
description: Pinout, electrical limits, wiring and MicroPython driver for the KY-039 heartbeat sensor (IR LED + phototransistor, analog pulse output). Use when designing, wiring, simulating or writing code for a KY-039 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# KY-039 heartbeat sensor (KY-039)

## Overview
The **KY-039** detects your pulse by shining infrared light through a fingertip. This page models the **Joy-IT SensorKit KY-039 heartbeat sensor (SEN-KY039HS)**: a small round black board with an IR LED and a phototransistor on it, on a 3-wire lead ending in three male Dupont pins. There is no chip, no amplifier and no filter: S is simply the phototransistor's collector.
- Circuit (Joy-IT): **+V → R → S → phototransistor → GND**, plus the IR LED with its own resistor.
- More light = transistor conducts more = **S lower**; less light = S closer to +V.
- Each heartbeat fills the fingertip with blood, which absorbs IR, so **S shows a sharp positive peak once per beat** riding on a DC level. Joy-IT's oscilloscope trace shows peaks of only a few hundred mV, followed by a slower dip and recovery.
- It is a hobby pulse detector, **not a medical device**.

## Pinout (lead order, as printed on the board)
| Pin | Name | Wire (Joy-IT) | Function |
|-----|------|------|----------|
| 1 | − | grey | Ground |
| 2 | + | white | Supply, 3.3–5 V |
| 3 | S | black | Signal: phototransistor collector, connect to an ADC pin |

Generic rectangular KY-039 boards from other 37-in-1 kits may order their header pins differently. Always follow the − / + / S marks on your own board.

## Electrical limits
- Supply: **3.3 V or 5 V** (Joy-IT). The IR LED takes most of the current, roughly 20 mA.
- S swings up to the supply voltage when the transistor is dark. **On an ESP32, Pico or Raspberry Pi, power + from 3.3 V** so S cannot go above 3.3 V.

## Interface details
S is an analog voltage. To get a heart rate:
1. Sample S every ~10 ms (Joy-IT's example: at least 5 samples per beat, 60 ms or faster for up to 200 BPM).
2. Track the recent minimum and maximum; count a beat when S rises through 60 % of that span, re-arm below 40 %.
3. BPM = 60000 × beats / (time between the first and last counted beat, ms).

Typical numbers: 0.2–0.6 V peak-to-peak per beat, 50–100 BPM at rest.

## Wiring
| Module | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| + (white) | 3V3 | 3V3(OUT) (pin 36) | 3.3 V (pin 1) |
| − (grey) | GND | GND | GND (pin 6) |
| S (black) | GPIO32–39 (ADC1) | GP26 / ADC0 (pin 31) | External ADC (e.g. KY-053 / ADS1115 A0) |

On the ESP32 use an ADC1 pin (ADC2 does not work while Wi-Fi is on). The Raspberry Pi has no ADC.

## Using the driver
```python
from ky039 import KY039
s = KY039(26)                  # GPIO number of the ADC pin S is wired to
while True:
    bpm = s.bpm()               # blocks: ~2 s to settle, then times 5 beats
    print('BPM=%d' % round(bpm) if bpm else 'no pulse')
```
`voltage()` returns one reading of S in volts. `bpm(beats=5, timeout_ms=15000)` returns beats per minute, or `None` when it finds no steady pulse (no finger, or the swing is below `min_pp` = 20 mV). After a call, `pp` holds the swing it saw in volts.

## Gotchas
- **Keep still.** Moving the finger shifts the DC level far more than a heartbeat does; the reading settles again after a couple of seconds.
- **Ambient light** (sunlight, lamps) swamps the phototransistor. Shade it, or tape the sensor to a fingertip as Joy-IT recommends (the little finger works well).
- Press lightly: squeezing hard pushes the blood out and the pulse disappears.
- The signal is small: the ESP32's 12-bit ADC is enough, but the Raspberry Pi needs an external ADC.
- Not a medical instrument: do not use it for health decisions.

## Datasheet
https://joy-it.net/files/files/Produkte/SEN-KY039HS/SEN-KY039HS-Manual-21-05-19.pdf (Joy-IT SEN-KY039HS manual). Module documentation: https://sensorkit.joy-it.net/en/sensors/ky-039
