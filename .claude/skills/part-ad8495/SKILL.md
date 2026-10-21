---
name: part-ad8495
description: Pinout, electrical limits, wiring and MicroPython driver for the Adafruit AD8495 analog K-type thermocouple amplifier breakout (#1778, Analog Devices AD8495ARMZ with 1.25 V reference). Use when designing, wiring, simulating or writing code for an AD8495 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# AD8495 analog K-type thermocouple amplifier (Adafruit #1778)

## Overview
The **AD8495** (Analog Devices) is a fixed-gain (122.4) instrumentation amplifier with built-in cold junction compensation for **K-type thermocouples**. It turns the thermocouple's microvolt signal into **5 mV/°C** that you read with an ADC. No digital interface.
The **Adafruit AD8495 breakout (#1778)** uses the A-grade AD8495ARMZ and a TLVH431 **1.25 V reference on the REF pin**, so 0 °C reads 1.25 V and negative temperatures work on a single supply:
```
T(°C) = (Vout − 1.25 V) / 0.005 V
```
Examples: 1.25 V = 0 °C, 1.375 V = 25 °C, 1.75 V = 100 °C, 2.75 V = 300 °C.
- Accuracy: ±1 °C around room temperature; ±2 °C linearity for −25 °C to +400 °C (datasheet Table 7). Outside that range the thermocouple's own nonlinearity grows; see Analog Devices AN-1087.
- K type only. A J, T or other type thermocouple gives wrong readings.

## Pinout (Adafruit #1778)
Header (bottom edge, left to right, silkscreen up):
| Pin | Function |
|---|---|
| GND | Ground |
| OUT | Analog output, 1.25 V + 5 mV/°C |
| GND | Ground (second, same net) |
| V+ | Supply, 3–18 V |

Screw terminal (opposite edge): **Ylw+** (yellow, + lead of the thermocouple) and **Red−** (red, − lead).

## Electrical limits
- Supply: board 3–18 V (chip 2.7–36 V single supply). 180 µA typical, 250 µA max.
- Output range: 0.025 V to V+ − 0.1 V. With 3.3 V supply the board covers about −245 °C to +390 °C; with 5 V about −245 °C to +730 °C.
- **With V+ above 3.3 V the output can exceed 3.3 V** (open thermocouple drives it to the rail). Power it from 3.3 V when OUT goes to a 3.3 V ADC.
- Specified ambient (cold junction) range 0–50 °C.

## Wiring
| Board | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| V+ | 3V3 | 3V3(OUT) (pin 36) | 3.3 V (pin 1) |
| GND | GND | GND | GND |
| OUT | GPIO34 (ADC1) | GP26 / ADC0 | External ADC (e.g. ADS1115 A0) |

Thermocouple yellow wire → Ylw+, red wire → Red−. The Raspberry Pi has no ADC.

## Using the driver
```python
from ad8495 import AD8495
import time
tc = AD8495(26)            # GPIO of the ADC pin OUT is wired to
while True:
    print('T=%.1fC' % tc.temperature())
    time.sleep(1)
```
The driver averages 32 samples, uses calibrated `read_uv()` where available (ESP32), otherwise `read_u16()` × 3.3 / 65535 (pass `adc_vref=`). Pass `vref_out=` if your REF voltage differs from 1.25 V.

## Gotchas
- 1 °C is only 5 mV: one 12-bit step on a 3.3 V ADC is about 0.16 °C, and ADC noise is larger. Average and keep wires short.
- An open (unplugged) thermocouple makes the output float/rail high: a sudden reading of ~400 °C at 3.3 V means a loose wire.
- Thermocouple polarity reversed reads temperature changes backwards.
- Keep the board (cold junction) at the same temperature as the terminal; don't let it sit near the heat source.
- ESP32 ADC is nonlinear near the top of its range; calibrate at two points if you need accuracy above ~300 °C.

## Datasheet
https://www.analog.com/media/en/technical-documentation/data-sheets/AD8494_8495_8496_8497.pdf
