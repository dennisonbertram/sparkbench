---
name: part-gravity-orp
description: Pinout, electrical limits, wiring and MicroPython driver for the DFRobot Gravity Analog ORP Sensor PRO (SEN0464), an industrial ORP (redox) probe with an analog signal converter (3-pin A, +, - Gravity connector, S+/S- probe terminal). Use when designing, wiring, simulating or writing code for an ORP / redox potential meter in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Gravity ORP sensor (DFRobot SEN0464, Analog ORP Sensor PRO)

## Overview
The **DFRobot Gravity Analog ORP Sensor PRO (SEN0464)** measures oxidation-reduction potential (ORP, in mV) of water: positive means oxidising (e.g. chlorinated pool water), negative means reducing. The kit is an industrial probe (platinum indicator electrode, silver/silver-chloride reference, 3/4" NPT thread) plus a small signal converter board. The converter adds the probe voltage to a fixed **2480 mV** reference and outputs it on **A**:
- Measuring range **−2000 to +2000 mV** → A ≈ **0.48 to 4.48 V** (0 mV ORP = 2.48 V)
- Converter supply **5 V**; it has its own voltage reference, so supply ripple does not shift the reading much
- Probe: 5–70 °C, electrode potential 245–270 mV (in the reference test), stability ±8 mV / 24 h, life about 1 year
- No chip to talk to: read A with an ADC

## Pinout (signal converter)
Gravity PH2.0 3-pin output connector, order printed on the board:
| Pin | Name | Function |
|---|---|---|
| 1 | A | Analog output, 0.48–4.48 V (ORP + 2.48 V) |
| 2 | + | Supply, 5 V |
| 3 | - | Ground |

Probe input: a 2-way 5.08 mm pluggable screw terminal on the other edge, **S+** (electrode +) and **S−** (electrode −). Gravity cable colours: green/blue = A, red = +, black = −. Because the two connectors are on different edges, the board is wired with jumper leads.

## Electrical limits
- Supply **5 V** (use 5V / VIN / VBUS, not 3.3 V).
- A rises above 3.3 V for ORP above about +820 mV, so on a 3.3 V board put a **10 kΩ / 20 kΩ divider** between A and the ADC pin (the pin sees 2/3 of A; driver `divider=1.5`).
- Probe is not fully waterproof: immerse only the sensing end, never the whole probe or the cable gland.

## Interface details
DFRobot_ORP_PRO library:
```
ORP (mV) = V_A (mV) − (2480 + calibration)
calibration = V_A(shorted) − 2480        measured with S+ shorted to S− (0 mV input); 0 by default
```
Example: A = 3.13 V → ORP = +650 mV. The probe normally needs no calibration; check it with an ORP standard solution if readings look wrong.

## Wiring
| Converter | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| + | 5V / VIN | VBUS (5 V) | 5 V (pin 2) |
| - | GND | GND | GND |
| A | GPIO32–39 (ADC1) via 10 k / 20 k divider | GP26/27/28 via 10 k / 20 k divider | External ADC (ADS1115) |

Use an ADC1 pin on the ESP32 (ADC2 stops working while Wi-Fi is on). The Pi 4 has no ADC.

## Using the driver
```python
from gravity_orp_pro import GravityORP
orp = GravityORP(34, divider=1.5)        # A on GPIO34 through a 10k/20k divider
v = orp.voltage()
print('A=%.2fV ORP=%dmV' % (v, round(orp.orp(v) / 10) * 10))   # ADC is not good to 1 mV
# optional: short S+ to S-, then orp.calibrate_zero() and keep the returned offset
```

## Gotchas
- ORP probes respond slowly in clean water: allow a few minutes to settle after immersion.
- Do not run an ORP probe and a pH/EC/TDS probe in the same water without isolation; they interfere.
- Rinse with deionised or tap water; never scrub the platinum tip with a hard brush.
- The ESP32 ADC is non-linear near its ends; `read_uv()` uses its calibration.

## On a 3.3 V board
- **A** can reach about 4.5 V, so on an ESP32 or Pico it goes to the GPIO through a divider: 10 kΩ from A to the pin, 20 kΩ from the pin to GND (Sparkbench adds both resistors). The pin then sees 0.67 × the output voltage, so multiply ADC readings by 1.5 (the driver's `divider` argument does this).

## Datasheet
https://wiki.dfrobot.com/sen0464 (DFRobot wiki; conversion from the DFRobot_ORP_PRO library)
