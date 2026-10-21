---
name: part-gravity-heart-rate-sen0203
description: Pinout, electrical limits, wiring and MicroPython driver for the DFRobot Gravity Heart Rate Monitor Sensor (SEN0203, SON1303 optical sensor + SON3130 op-amp, analog/digital output switch). Use when designing, wiring, simulating or writing code for a SEN0203 heart rate sensor in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# DFRobot Gravity Heart Rate Monitor Sensor (SEN0203)

## Overview
The **DFRobot Gravity: Heart Rate Monitor Sensor (SEN0203)** is a 28 x 24 mm round board that straps to a fingertip. A SON1303 reflective optical sensor (green LED + photodetector) picks up the blood-volume pulse (photoplethysmography) and a SON3130 rail-to-rail quad op-amp amplifies it. A slide switch **SW1** selects what reaches the Signal pin:
- **A** – analog pulse waveform, 0..VCC (U2A/U2B amplifier output).
- **D** – digital square pulse, 0/VCC, high during each beat (U2C comparator with hysteresis + U2D buffer; the "Heart" LED blinks with it).
Not a medical device.

## Pinout (PH2.0-3P Gravity connector)
| Pin | Wire | Function |
|---|---|---|
| 1 GND | black | Ground |
| 2 VCC | red | Supply 3.3–5.5 V, < 10 mA |
| 3 Signal | green/blue | Analog (A) or digital (D) heart-rate output |

## Electrical limits
- DFRobot rates the board 3.3–6 V (5 V recommended); the SON3130 op-amp's recommended maximum is **5.5 V** (6 V absolute), so stay at or below 5.5 V.
- Output swings to VCC in both modes: on a 3.3 V board **power it from 3.3 V**.
- Current under 10 mA.

## Wiring
- ESP32: GND → GND, VCC → 3V3, Signal → an ADC1 pin (e.g. D32), switch on A.
- Pico: GND → GND, VCC → 3V3(OUT), Signal → GP26–GP28, switch on A.
- Raspberry Pi: no ADC; set the switch to D and read Signal on any GPIO (VCC from 3.3 V).

## Using the driver
```python
from sen0203 import SEN0203
hr = SEN0203(32)                 # switch on A
# hr = SEN0203(15, mode='digital')  # switch on D
bpm = hr.bpm()
print('No pulse' if bpm is None else 'BPM=%d' % round(bpm))
```
Analog mode learns the waveform's range for 2 s, then times 4 beat intervals between rising crossings of a 60 % threshold (re-armed below 40 %). Digital mode times rising edges of the beat pulse. Both ignore edges closer than 250 ms and return None without a clear pulse.

## Gotchas
- The A/D switch, the code's mode and the pin type must match, or you read nothing.
- Keep the clear film on the sensor (transparent tape works); without it the module doesn't work.
- Strap, don't press: too tight or too loose, or moving, makes readings unstable.
- The analog baseline depends on finger and ambient light; use an adaptive threshold, not a fixed voltage.
- PH2.0 is a 2.0 mm connector, not a 2.54 mm header: use the Gravity cable or PH2.0-to-DuPont leads.

## Datasheet
https://dfimg.dfrobot.com/wiki/20189/SEN0203_heart-rate-monitor-sensor_schematics_1.0.pdf (schematic; chip datasheets SON1303/SON3130 in the wiki's datasheet zip)
