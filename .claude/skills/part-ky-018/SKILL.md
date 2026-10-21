---
name: part-ky-018
description: Pinout, electrical limits, wiring and MicroPython driver for the KY-018 photoresistor (LDR) light sensor module (CdS cell in a 10 kΩ divider, analog output). Use when designing, wiring, simulating or writing code for a KY-018 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# KY-018 photoresistor module (KY-018)

## Overview
The **KY-018** is a small black 3-pin module from the 37-in-1 / 40-in-1 sensor kits, for example the **Joy-IT SensorKit KY-018 photoresistor (SEN-KY018)**. It carries a 5 mm **CdS light-dependent resistor** (GL55 series, GL5528-class) and a fixed **10 kΩ** resistor (marked 103) wired as a voltage divider. There is no chip, no comparator and no LED: S is the divider's middle point.
- Circuit (Joy-IT formula): **+V → 10 kΩ → S → LDR → GND**
- Brighter = lower LDR resistance = **lower voltage on S**. Dark = S close to the supply.
- The response is **not linear** and not calibrated: good for "is it dark?", only rough for lux.

## Pinout (module header, as printed on the board)
| Pin | Name | Function |
|-----|------|----------|
| 1 | S | Signal: divider output, connect to an ADC pin |
| 2 | + (middle, unmarked; Joy-IT calls it +V) | Supply, 3.3–5 V |
| 3 | − | Ground |

## Electrical limits
- Supply: **3.3–5 V** (Joy-IT). The divider draws Vcc / (10 kΩ + R_ldr): at most 0.33 mA on 3.3 V (0.5 mA on 5 V) in bright light, a few µA in the dark.
- LDR: max 150 V, 100 mW, −30 to +70 °C (GL55 datasheet); the module never comes close (≤ 0.63 mW at 5 V).
- S swings between about 0 V and the supply. **On an ESP32, Pico or Raspberry Pi, power + from 3.3 V** so S can never go above 3.3 V.

## Interface details
```
R_ldr = 10 kΩ × V_S / (Vcc − V_S)          (Joy-IT KY-018 code)
lux ≈ 10 × (R10 / R_ldr) ^ (1 / γ)          (from γ = lg(R10/R100), GL55 datasheet)
```
GL5528: R10 (resistance at 10 lux) = 10–20 kΩ, γ = 0.6, dark resistance ≥ 1 MΩ. The driver uses R10 = 15 kΩ, so its lux value is only a rough estimate.
Examples at Vcc = 3.3 V: 1.10 V → 5.00 kΩ (≈ 62 lux), 1.65 V → 10 kΩ (≈ 20 lux), 3.0 V → 100 kΩ (≈ 0.4 lux, dim room).
The result is ratiometric: use the actual voltage on the + pin as Vcc.

## Wiring
| Module | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| + (middle) | 3V3 | 3V3(OUT) (pin 36) | 3.3 V (pin 1) |
| − | GND | GND | GND (pin 6) |
| S | GPIO32–39 (ADC1) | GP26 / ADC0 (pin 31) | External ADC (e.g. KY-053 / ADS1115 A0) |

On the ESP32 use ADC1 pins (ADC2 does not work while Wi-Fi is on). The Raspberry Pi has no ADC.

## Using the driver
```python
from ky018 import KY018
import time
ldr = KY018(26)               # GPIO number of the ADC pin S is wired to; vcc=3.3 by default
while True:
    print('R=%.2fk lux~%.0f' % (ldr.resistance() / 1000, ldr.lux()))
    time.sleep(1)
```
`voltage()` averages 32 samples (`read_uv()` on ESP32, else `read_u16()` × 3.3 V / 65535), `resistance()` gives the LDR resistance in Ω, `lux()` a rough lux estimate, `brightness()` 0–100 % (100 % = S at 0 V). If the module runs from 5 V through an external ADC, pass `vcc=5.0`.

## Gotchas
- **Inverted sense**: a *higher* ADC reading means *darker*. Compare against a threshold measured in your own room rather than a fixed lux value.
- **Backwards clones**: if covering the LDR makes the reading go *down*, your board has the divider the other way round: swap the + and − wires (harmless on this purely resistive divider) or invert the formula.
- **5 V supply + 3.3 V board** can put almost 5 V on the ADC pin in the dark. Use 3.3 V.
- **ESP32 ADC** is nonlinear near 0 V and near the top, so very bright and very dark readings are poor.
- CdS cells are slow (20–30 ms) and lag after darkness; they also do not see infrared well. Lights flickering at 100/120 Hz show up as noise: average several samples.
- Joy-IT has replaced the KY-018 with the KY-054 phototransistor in revision 2 of its kit.

## Datasheet
https://www.kth.se/social/files/54ef17dbf27654753f437c56/GL5537.pdf (GL55 series CdS photoresistor manual). Module documentation: https://sensorkit.joy-it.net/en/sensors/ky-018
