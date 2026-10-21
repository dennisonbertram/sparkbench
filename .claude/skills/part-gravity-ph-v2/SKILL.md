---
name: part-gravity-ph-v2
description: Pinout, electrical limits, wiring and MicroPython driver for the DFRobot Gravity Analog pH Sensor / Meter Kit V2 (SEN0161-V2, 3-pin PH2.0 -/+/A connector, BNC lab-grade pH probe). Use when designing, wiring, simulating or writing code for a Gravity pH meter V2 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Gravity Analog pH Sensor V2 (DFRobot SEN0161-V2)

## Overview
The **DFRobot Gravity: Analog pH Sensor / Meter Kit V2** is a signal conditioner board plus a laboratory-grade BNC pH glass electrode. The board has an onboard voltage regulator, so it runs from **3.3–5.5 V** and its analog output **A stays within 0–3.0 V**, safe for a 3.3 V ADC.
- pH range 0–14, accuracy ±0.1 pH at 25 °C (after calibration)
- Probe: 5–60 °C liquid, zero point pH 7 ± 0.5, response < 2 min, internal resistance < 250 MΩ
- A is about **1500 mV in pH 7.00** buffer and about **2032 mV in pH 4.00** buffer (DFRobot_PH library defaults): **A rises as the liquid gets more acidic**, about 177 mV per pH.
- No chip to talk to: read A with an ADC.

## Pinout (3-pin PH2.0 Gravity connector, order printed on the board)
| Pin | Label | Function |
|---|---|---|
| 1 | - | Ground (black wire) |
| 2 | + | Supply 3.3–5.5 V (red wire) |
| 3 | A | Analog output 0–3.0 V (blue wire) |
| — | BNC | pH probe socket on the opposite edge |

The probe plugs into the BNC socket on the other edge of the board, so the module is wired with the Gravity cable / jumper leads.

## Electrical limits
- Supply 3.3–5.5 V (onboard regulator). Supply current is not specified by DFRobot (a few mA).
- A: 0–3.0 V, so it can go straight to an ESP32 / Pico ADC pin.
- Keep the signal board and the BNC dry; only the probe goes in the liquid (5–60 °C).

## Interface details
DFRobot's two-point formula (DFRobot_PH.cpp), voltages in mV:
```
slope     = (7.0 - 4.0) / ((Vn - 1500)/3 - (Va - 1500)/3)
intercept = 7.0 - slope * (Vn - 1500)/3
pH        = slope * (V - 1500)/3 + intercept        ( = 7 - 3·(V - Vn)/(Va - Vn) )
```
Vn / Va = A in pH 7.00 / pH 4.00 buffer (defaults 1500 / 2032.44 mV). Example with the defaults: A = 1003 mV → pH 9.8.
**Calibration**: rinse the probe, put it in pH 7.00 buffer, wait for the reading to settle, calibrate; rinse, repeat in pH 4.00. Like the library, the driver recognises the buffer from the voltage window (7.00: 1322–1678 mV, 4.00: 1854–2210 mV).

## Wiring
| Module | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| + | 3V3 (or 5V) | 3V3(OUT) | 3.3 V (pin 1) |
| - | GND | GND | GND |
| A | GPIO32–39 (ADC1) | GP26/27/28 (ADC) | External ADC (ADS1115) |

Use an ADC1 pin on the ESP32 (ADC2 stops working while Wi-Fi is on). The Pi 4 has no ADC.

## Using the driver
```python
from gravity_ph import GravityPH
ph = GravityPH(34)                   # A on GPIO34
mv = ph.millivolts()
print('A=%.2fV pH=%.1f' % (mv / 1000, ph.ph(mv)))
ph.calibrate()                       # probe in pH 7.00 buffer -> 7.0; then in pH 4.00 buffer -> 4.0
print(ph.neutral_mv, ph.acid_mv)     # save these and pass them to GravityPH(...) next time
```

## Gotchas
- The defaults are typical values only; every probe differs and ages. Calibrate monthly (weekly with heavy use) with fresh buffers.
- The DFRobot library takes a temperature argument but does not compensate with it; calibrate near the measuring temperature.
- A pH probe and a TDS/EC probe in the same water interfere; measure one at a time or isolate them.
- Never let the glass bulb dry out: store it in the cap with KCl (3 M) storage solution, and rinse with distilled water between liquids.
- The probe has a very high internal resistance; keep the BNC plug clean and dry or readings drift.

## Datasheet
https://wiki.dfrobot.com/Gravity__Analog_pH_Sensor_Meter_Kit_V2_SKU_SEN0161-V2 (vendor specification, pinout and board layout); formula from https://github.com/DFRobot/DFRobot_PH
