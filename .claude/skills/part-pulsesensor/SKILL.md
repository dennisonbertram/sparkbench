---
name: part-pulsesensor
description: Pinout, electrical limits, wiring and MicroPython driver for the PulseSensor optical heart-rate sensor (World Famous Electronics PulseSensor.com kit / Pulse Sensor Amped, Adafruit 1093, SparkFun SEN-11574). Use when designing, wiring, simulating or writing code for a PulseSensor in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# PulseSensor optical heart-rate sensor (PulseSensor)

## Overview
The **PulseSensor** from World Famous Electronics (PulseSensor.com) is an open-source optical heart-rate sensor. A green LED shines into a fingertip or earlobe, an APDS-9008 light sensor picks up the reflected light, and an amplifier turns the blood-volume pulse (photoplethysmography, PPG) into an analog **Signal** that rests near Vdd/2 and rises with every heartbeat. Hobbyists buy it as the **PulseSensor Kit / Pulse Sensor Amped** (also sold by Adafruit as #1093 and SparkFun as SEN-11574): a 15.8 mm round board on a 24 in colour-coded ribbon cable ending in three male header pins. It is not a medical device.

## Pinout (ribbon cable, identify by colour)
| Pin | Wire | Function |
|---|---|---|
| GND | black | Ground |
| Vdd | red | Supply, 3.0–5.5 V, ~4 mA |
| Signal | purple | Analog pulse waveform, rests near Vdd/2 |

## Electrical limits
- Supply: **3.0–5.5 V**, 3–4 mA.
- Signal range **0.3 V to Vdd** (typical Vdd/2 baseline). On 5 V it can exceed a 3.3 V ADC pin, so on ESP32 / Pico **power it from 3.3 V**.
- Operating temperature −40 to +85 °C (electrical, not a skin-contact rating).

## Wiring
- ESP32: GND → GND, Vdd → 3V3, Signal → an ADC1 pin (e.g. D32).
- Pico: GND → GND, Vdd → 3V3(OUT), Signal → GP28 (ADC2).
- Raspberry Pi: no ADC; use an ADS1115 or MCP3008 for Signal.

## Using the driver
```python
from pulsesensor import PulseSensor
ps = PulseSensor(32)
bpm = ps.bpm()
print('No pulse' if bpm is None else 'BPM=%d' % round(bpm))
```
`bpm()` learns the waveform's range for 2 s, then times 4 beat intervals between rising crossings of a 60 % threshold (re-armed below 40 %, 250 ms refractory). It returns None when there is no clear pulse. `voltage()` / `raw()` give the Signal for plotting.

## Gotchas
- Powering from 5 V into a 3.3 V ADC can push Signal above 3.3 V.
- Cover the front with a clear vinyl dot and insulate the back before it touches skin; sweat and finger oil short the circuit.
- Light, steady pressure: pressing hard flattens the pulse; movement and bright light add noise.
- The baseline wanders, so detect beats with an adaptive threshold, not a fixed voltage.
- On ESP32 use an ADC1 pin (ADC2 is unusable while Wi-Fi is on).

## Datasheet
https://cdn-shop.adafruit.com/product-files/1093/Pulse+Sensor+Data+Sheet-2018.pdf
