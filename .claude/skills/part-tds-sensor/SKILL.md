---
name: part-tds-sensor
description: Pinout, electrical limits, wiring and MicroPython driver for the TDS (total dissolved solids) water quality sensor, DFRobot Gravity Analog TDS Sensor/Meter SEN0244 and its clones (3-pin - + A board with a 2-pin probe). Use when designing, wiring, simulating or writing code for a TDS / EC / water quality meter in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# TDS water quality sensor (DFRobot Gravity SEN0244)

## Overview
The **DFRobot Gravity Analog TDS Sensor/Meter (SEN0244)** measures how much is dissolved in water (TDS, in ppm = mg/L) from its electrical conductivity. A small signal board drives the waterproof 2-pin probe with **AC excitation** (so the probe does not polarise) and outputs a DC voltage on **A** that rises with conductivity. Many clones ("TDS Meter V1.0" boards) use the same circuit, pins and formula.
- TDS range **0–1000 ppm**, accuracy **±10 % F.S. at 25 °C**
- Output **0–2.3 V** on A, safe for 3.3 V ADCs
- Probe: 2 needles, waterproof, max water temperature 55 °C; do not dip the signal board itself
- No chip to talk to: it is an analog sensor, read with an ADC

## Pinout (signal board, PH2.0 3-pin Gravity connector, order printed on the board)
| Pin | Name | Function |
|---|---|---|
| 1 | - | Ground |
| 2 | + | Supply, 3.3–5.5 V |
| 3 | A | Analog output, 0–2.3 V |

The probe plugs into the separate 2-pin "TDS" XH connector. Gravity cable colours: black = -, red = +, blue = A.

## Electrical limits
- Supply: **3.3–5.5 V**, working current 3–6 mA.
- Output: 0–2.3 V (does not exceed 3.3 V, so no divider is needed).
- Probe in water no hotter than 55 °C. The board is not waterproof.

## Interface details
DFRobot's conversion (GravityTDS library and wiki sample code), with V = voltage on A:
```
EC   = (133.42·V³ − 255.86·V² + 857.39·V) × K       µS/cm, K = calibration factor (default 1.0)
EC25 = EC / (1 + 0.02 × (T − 25))                     temperature compensation to 25 °C
TDS  = EC25 × 0.5                                     ppm
```
Example: V = 1.45 V at 25 °C → TDS ≈ 556 ppm.
**Calibration**: put the probe in a 1413 µS/cm (707 ppm) buffer at known temperature T and solve K = 1413 × (1 + 0.02(T − 25)) / (133.42V³ − 255.86V² + 857.39V). DFRobot accepts K between 0.25 and 4.0.

## Wiring
| Sensor | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| + | 3V3 | 3V3(OUT) | 3.3 V (pin 1) |
| - | GND | GND | GND |
| A | GPIO32–39 (ADC1) | GP26/27/28 (ADC) | External ADC (ADS1115 / MCP3008) |

On the ESP32 use ADC1 pins (ADC2 stops working while Wi-Fi is on). The Pi 4 has no ADC.

## Using the driver
```python
from gravity_tds import GravityTDS
tds = GravityTDS(34, temperature=25.0)   # A on GPIO34; set temperature from a DS18B20 for compensation
print('A=%.2fV TDS=%dppm EC=%duS/cm' % (tds.voltage(), round(tds.tds()), round(tds.ec())))
```
`voltage()` is the median of 30 ADC samples (`read_uv()` on ESP32, else `read_u16()` × 3.3 V). `calibrate(1413)` sets K from a buffer solution.

## Gotchas
- **Not a water-safety test**: TDS says nothing about bacteria or which substances are dissolved.
- **Temperature matters** (~2 %/°C): feed the real water temperature (e.g. a waterproof DS18B20) or readings drift.
- **Two probes in one tank interfere** (DFRobot FAQ): do not run a TDS and a pH/EC probe in the same water at the same time without isolation.
- **Electrolysis**: do not leave the probe powered in water for long periods; switch + from a GPIO or MOSFET and measure occasionally.
- The ESP32 ADC is non-linear near the ends; `read_uv()` uses its calibration.
- Above about 1000 ppm the formula leaves its rated range.

## Datasheet
https://wiki.dfrobot.com/Gravity__Analog_TDS_Sensor___Meter_For_Arduino_SKU__SEN0244
