---
name: part-gravity-ec
description: Pinout, electrical limits, wiring and MicroPython driver for the DFRobot Gravity Analog Electrical Conductivity Sensor/Meter V2 (K=1), SKU DFR0300 (3-pin - + A signal board with a BNC lab-grade EC probe). Use when designing, wiring, simulating or writing code for an EC / conductivity meter in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build, e.g. hydroponics nutrient monitoring.
---

# Gravity analog EC meter (DFRobot DFR0300, K=1)

## Overview
The **DFRobot Gravity Analog Electrical Conductivity Sensor/Meter V2 (K=1), DFR0300** measures how well water conducts electricity (EC, in ms/cm), which tracks how much salt / nutrient is dissolved in it. A signal conditioner board drives the lab-grade K=1 probe (BNC) with **AC excitation** (less polarisation, longer probe life) and outputs a hardware-filtered DC voltage on **A** proportional to conductivity.
- Supported range **0–20 ms/cm**, recommended **1–15 ms/cm**, accuracy **±5 % F.S.**
- Output **0–3.4 V** on A (about 0.164 V per ms/cm)
- Probe 0–40 °C; the board itself is not waterproof
- No chip to talk to: it is an analog sensor, read with an ADC

## Pinout (signal board, PH2.0 3-pin Gravity connector, order from DFRobot's pinout table)
| Pin | Name | Function |
|---|---|---|
| 1 | - | Power GND (0 V) |
| 2 | + | Power VCC, 3.0–5.0 V |
| 3 | A | Analog signal output, 0–3.4 V |

The probe plugs into the separate BNC socket. Gravity cable colours: black = -, red = +, blue = A.

## Electrical limits
- Supply: **3.0–5.0 V**.
- Output: 0–3.4 V. 3.4 V is above a 3.3 V ADC's range, so **power the board from 3.3 V** when A goes straight to an ESP32 / Pico ADC (the output then cannot exceed the supply). Across the 0–20 ms/cm range the output stays at or below 3.28 V. If you power it from 5 V, add a divider (e.g. 10 kΩ / 20 kΩ) and pass `divider=1.5` to the driver.
- Probe 0–40 °C.

## Interface details
DFRobot's conversion (DFRobot_EC library, RES2 = 820, ECREF = 200), V in mV on A:
```
rawEC = 1000 × V_mV / 820 / 200            ms/cm  (= V_mV / 164)
EC    = rawEC × K                          K from calibration (default 1.0)
EC25  = EC / (1 + 0.0185 × (T − 25))       temperature compensation to 25 °C
```
Two K values: K_low (from the 1413 µS/cm buffer) is used below 2.0 ms/cm, K_high (from the 12.88 ms/cm buffer) above 2.5 ms/cm, with hysteresis in between.
Example: V = 2.11 V at 25 °C → 12.88 ms/cm.
**Calibration (two points, both required)**: put the probe in 1413 µS/cm buffer, call `calibrate(T)`; rinse, then in 12.88 ms/cm buffer, call `calibrate(T)` again. The buffer is recognised from rawEC (0.9–1.9 → 1.413, 9–16.8 → 12.88); K = 820 × 200 × EC_buffer × (1 + 0.0185(T − 25)) / 1000 / V_mV and must be 0.5–1.5. Save the two K values yourself (e.g. a file) and pass them as `k_low`, `k_high`.

## Wiring
| Sensor | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| + | 3V3 | 3V3(OUT) | 3.3 V (pin 1) |
| - | GND | GND | GND |
| A | GPIO32–39 (ADC1) | GP26/27/28 (ADC) | External ADC (ADS1115 / MCP3008) |

On the ESP32 use ADC1 pins (ADC2 stops working while Wi-Fi is on). The Pi 4 has no ADC.

## Using the driver
```python
from gravity_ec import GravityEC
ec = GravityEC(34, k_low=1.0, k_high=1.0)      # A on GPIO34
v = ec.voltage()
print('A=%.2fV EC=%.2fms/cm' % (v, ec.ec(v, temperature=25.0)))
```
`voltage()` is the median of 30 ADC samples (`read_uv()` on ESP32, else `read_u16()` × 3.3 V).

## Gotchas
- **Temperature matters** (~1.85 %/°C): feed the real water temperature (e.g. a waterproof DS18B20).
- **Calibrate both points** (DFRobot FAQ); recalibrate about monthly, weekly with heavy use, using fresh buffer.
- **Two probes in one tank interfere** (e.g. EC and pH): don't measure them at the same time without isolation.
- Rinse the probe with distilled water between solutions and dry it before storing.
- The ESP32 ADC is non-linear above about 3.1 V even at 11 dB attenuation; readings near 19–20 ms/cm are less accurate.
- This is the K=1 probe: for seawater-level conductivity use the K=10 version (DFR0300-H).

## Datasheet
https://wiki.dfrobot.com/Gravity__Analog_Electrical_Conductivity_Sensor___Meter_V2__K%3D1__SKU_DFR0300
