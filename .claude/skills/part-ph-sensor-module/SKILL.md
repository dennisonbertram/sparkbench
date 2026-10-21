---
name: part-ph-sensor-module
description: Pinout, electrical limits, wiring and MicroPython driver for the PH-4502C analog pH sensor module with BNC pH probe (6-pin To/Do/Po/G/G/V+ header, two trimmers). Use when designing, wiring, simulating or writing code for a pH meter / pH probe module in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# pH sensor module (PH-4502C with BNC probe)

## Overview
The **PH-4502C** is the common blue pH meter board sold with a BNC glass-electrode probe (E-201-C type). The probe makes about 59 mV per pH unit (Nernst, 25 °C); the board amplifies it and shifts it so the **Po** pin reads about **2.5 V at pH 7** once the offset trimmer is set. Po **rises as the liquid gets more acidic** and falls as it gets more alkaline (typically about 0.18 V per pH).
- pH range 0–14, response ≤ 5 s, stable within 60 s (vendor listing)
- 5 V ± 0.2 V supply, 5–10 mA, ≤ 0.5 W
- No chip to talk to: read Po with an ADC
- Two trimmers: POT1 (nearest the BNC) = analog offset; POT2 = pH limit for the Do output

## Pinout (6-pin header, order printed on the board)
| Pin | Name | Function |
|---|---|---|
| 1 | To | Temperature-related analog output (board dependent, uncalibrated; optional) |
| 2 | Do | pH limit trigger, high/low set by POT2 (optional) |
| 3 | Po | pH analog output (connect to an ADC) |
| 4 | G | Ground (probe / analog ground) |
| 5 | G | Ground (board power ground) |
| 6 | V+ | Supply, 5 V DC |

Both pins are printed "G"; Sparkbench names them G1 (pin 4) and G2 (pin 5). Connect both to GND. The probe plugs into the BNC socket on the opposite edge, so the board is wired with jumper leads.

## Electrical limits
- Supply **5 V ± 0.2 V** only (not 3.3 V). 5–10 mA.
- Po stays below 3.3 V for pH above about 2.3 (with the 2.5 V offset), so it can go straight to a 3.3 V ADC for normal liquids. For very acidic liquids add a divider (e.g. 10 kΩ / 20 kΩ, divider=1.5).
- Do swings between about 0.8 V and 3.65 V (forum measurement): put 1 kΩ in series or a divider before a 3.3 V GPIO.
- Probe: liquid 0–60 °C; keep the glass bulb wet (storage solution, KCl 3 M); never let it dry out.

## Interface details
```
pH = 7 + (V_neutral − V_Po) / slope        V_neutral ≈ 2.50 V (set with POT1), slope ≈ 0.18 V/pH at 25 °C
```
Example: Po = 3.05 V → pH ≈ 3.9.
**Offset**: unplug the probe, short the BNC centre pin to its shell, turn POT1 until Po = 2.50 V.
**Two-point calibration**: read Po in pH 7 (or 6.86) and pH 4.00 buffers, rinse between them, and solve slope = (V₁ − V₂)/(pH₂ − pH₁). The slope scales with absolute temperature (Nernst).

## Wiring
| Module | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| V+ | 5V / VIN | VBUS (5 V) | 5 V (pin 2) |
| G (both) | GND | GND | GND |
| Po | GPIO32–39 (ADC1) | GP26/27/28 (ADC) | External ADC (ADS1115) |
| Do (optional) | any GPIO via 1 kΩ | any GP via 1 kΩ | GPIO via divider |

Use an ADC1 pin on the ESP32 (ADC2 stops working while Wi-Fi is on). The Pi 4 has no ADC.

## Using the driver
```python
from ph4502c import PH4502C
probe = PH4502C(34)                 # Po on GPIO34
v = probe.voltage()
print('Po=%.2fV pH=%.1f' % (v, probe.ph(v)))
probe.calibrate_two_point(7.00, 2.50, 4.00, 3.04)   # your measured buffer voltages
```

## Gotchas
- The default 2.5 V / 0.18 V/pH is a starting point only; every probe differs and ages. Calibrate with buffers.
- **Isolation**: a pH probe and a TDS/EC probe in the same water interfere; measure one at a time or isolate them.
- Readings need up to a minute to settle; the glass electrode has a very high impedance, so keep the BNC and cable dry and clean.
- To is not a calibrated temperature reading; use a waterproof DS18B20 for temperature compensation.
- Probes wear out (about 1–3 years); a slope well below 0.15 V/pH after calibration means replace the probe.


## On a 3.3 V board
- **Po** can rise above 3.3 V, so on an ESP32 or Pico it goes to the GPIO through a divider: 10 kΩ from Po to the pin, 20 kΩ from the pin to GND (Sparkbench adds both resistors). The pin then sees 0.67 × the output voltage, so multiply ADC readings by 1.5 (the driver's `divider` / `div` argument does this).

## Datasheet
https://thinkrobotics.com/products/ph4502c-ph-meter (vendor specification; no manufacturer datasheet is published for this board)
