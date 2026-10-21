---
name: part-ky-013
description: Pinout, electrical limits, wiring and MicroPython driver for the KY-013 analog temperature module (10 kΩ NTC thermistor, B 3950 K, in a 10 kΩ divider). Use when designing, wiring, simulating or writing code for a KY-013 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# KY-013 analog temperature module (KY-013)

## Overview
The **KY-013** is a small black 3-pin module from the 37-in-1 / 40-in-1 sensor kits, for example the **Joy-IT SensorKit KY-013 (SEN-KY013)**. It carries a black bead **NTC thermistor** (10 kΩ at 25 °C, B25/50 = 3950 K) and a fixed **10 kΩ** resistor wired as a voltage divider. There is no chip and no LED: the S pin is just the divider's middle point.
- Circuit (Joy-IT): **+V → 10 kΩ → S → NTC → GND**
- Warmer = lower NTC resistance = **lower voltage on S**. At 25 °C, S sits at half the supply.
- Range: −55 °C to +125 °C (Joy-IT), about ±0.5 °C after calculation; the response is **not linear**.

## Pinout (module header, as printed on the board)
| Pin | Name | Function |
|-----|------|----------|
| 1 | S | Signal: divider output, connect to an ADC pin |
| 2 | + (middle, unmarked) | Supply, 3.3–5 V |
| 3 | − | Ground |

## Electrical limits
- Supply: **3.3–5 V** (Joy-IT). The divider draws Vcc / (10 kΩ + R_ntc): about 0.17 mA at 25 °C on 3.3 V, at most 0.5 mA even at 125 °C on 5 V.
- S swings between 0 V and the supply. **On an ESP32, Pico or Raspberry Pi, power + from 3.3 V** so S can never go above 3.3 V.
- The thermistor bead self-heats slightly (dissipation constant ≥ 2 mW/°C, MF52-type NTC); at these currents that is well below 0.1 °C.

## Interface details
Two steps, both from the Joy-IT KY-013 documentation:
```
R_ntc = 10 kΩ × (V_S / Vcc) / (1 − V_S / Vcc)
1 / T(K) = 1 / 298.15 + ln(R_ntc / 10 kΩ) / 3950
T(°C) = T(K) − 273.15
```
Examples at Vcc = 3.3 V: 1.65 V = 25 °C, 1.00 V = 45 °C, 2.40 V ≈ 4.5 °C (R = 26.7 kΩ), 0.50 V ≈ 69.6 °C (R = 1.79 kΩ).
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
from ky013 import KY013
import time
sensor = KY013(26)            # GPIO number of the ADC pin S is wired to; vcc=3.3 by default
while True:
    print('T=%.1fC' % sensor.temperature())
    time.sleep(1)
```
`voltage()` averages 32 samples (`read_uv()` on ESP32, else `read_u16()` × 3.3 V / 65535), `resistance()` gives the NTC resistance in Ω, `temperature()` the temperature in °C. If the module runs from 5 V through an external ADC, pass `vcc=5.0`.

## Gotchas
- **Backwards reading**: some clone boards put the thermistor on the + side instead. If the reading goes *down* when you warm the bead with your fingers, swap the + and − wires (harmless on this purely resistive divider) or invert the formula.
- **5 V supply + 3.3 V board** can put up to 5 V on the ADC pin when it is cold. Use 3.3 V.
- **ESP32 ADC** is nonlinear near 0 V and near the top, so hot (S < 0.15 V) and very cold readings are poor without calibration.
- The bead is on bare legs: do not let them touch each other or other metal, and do not dunk the module in water.

## Datasheet
https://cdn-shop.adafruit.com/datasheets/103_3950_lookuptable.pdf (10 kΩ B3950 NTC resistance table). Module documentation: https://sensorkit.joy-it.net/en/sensors/ky-013
