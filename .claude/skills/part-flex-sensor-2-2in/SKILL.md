---
name: part-flex-sensor-2-2in
description: Pinout, electrical limits, wiring and MicroPython driver for the Spectra Symbol 2.2" flex / bend sensor (FS-L-0055-253-ST, Adafruit 1070 Short Flex Sensor, ~25 kΩ flat). Use when designing, wiring, simulating or writing code for a flex sensor in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Flex sensor 2.2in (Spectra Symbol FS-L-0055-253-ST)

## Overview
A **Spectra Symbol 2.2" flex sensor** (active length 55.37 mm, part length 73.66 mm), sold by Adafruit as the **Short Flex/Bend Sensor (product 1070)**. It is a thin strip whose resistance rises when it is bent (printed side outward): about **25 kΩ flat** (±30 %), **45–125 kΩ bent** depending on bend radius, about 100 kΩ fully bent (Adafruit). It bends in one direction only. There is no chip and no supply: you read it with a voltage divider into an ADC.

## Pinout (two tabs at the end, 2.54 mm pitch)
| Pin | Function |
|---|---|
| 1 | One end of the resistive strip; wire to 3.3 V |
| 2 | Other end; wire to an ADC pin and a 47 kΩ resistor to GND |

The two tabs are not polarised and not labelled; either way round works. Sparkbench adds the 47 kΩ resistor from pin 2 to GND.

## Electrical limits
- Power rating 0.5 W continuous, 1 W peak (never close in a 3.3/5 V divider: about 0.1 mW).
- Temperature −35 to +80 °C, life > 1 million bends, 0.43 mm thick.
- Current in the divider: 3.3 V / (25 kΩ + 47 kΩ) ≈ 0.05 mA.

## Interface details
```
V(ADC) = 3.3 V × 47 kΩ / (47 kΩ + R_flex)
R_flex = 47 kΩ × (3.3 V − V) / V
angle  ≈ (R_flex − R_flat) × 90° / (R_bent − R_flat)    (two-point calibration)
```
Typical: flat 25 kΩ → 2.15 V; 75 kΩ → 1.27 V; 100 kΩ → 1.06 V. The datasheet gives no angle formula; the driver's angle is a linear fit between the flat resistance and the 90° resistance (defaults 25 kΩ / 100 kΩ). Calibrate your own sensor, since resistance varies ±30 % between sensors. The simulator models the same linear 25 kΩ (0°) → 100 kΩ (90°) relation.

## Wiring
| Sensor | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| 1 | 3V3 | 3V3(OUT) | 3.3 V (pin 1) |
| 2 | GPIO34 (ADC1) + 47 kΩ to GND | GP26 / ADC0 + 47 kΩ to GND | ADS1115 A0 + 47 kΩ to GND (the Pi has no ADC) |

## Using the driver
```python
from flex_sensor import FlexSensor
import time
flex = FlexSensor(34)                # ADC GPIO wired to pin 2
while True:
    r = flex.resistance()
    print('R=%dk A=%d' % (round(r / 1000), round(flex.angle(r))))
    time.sleep(0.5)
```
`FlexSensor(pin, r_load=47000, vcc=3.3, r_flat=25000, r_bent=100000)`; `volts()`, `resistance()`, `angle()`.

## Gotchas
- **Strain the base:** the area near the tabs is fragile. Glue or tape the tab end down so bending happens along the strip, not at the crimps, and do not bend it sharply at the base.
- **One direction only:** bending the other way changes the resistance very little.
- **Solder carefully:** the tabs are crimped onto a plastic film; use a female header or a quick solder joint, or the film melts.
- **ESP32:** use ADC1 pins (GPIO32–39); ADC2 stops working with Wi-Fi on.
- A larger load resistor than 47 kΩ gives more voltage swing for these 25–125 kΩ values; change `r_load` to match.

## Datasheet
https://cdn-shop.adafruit.com/datasheets/SpectraFlex2inch.pdf (Spectra Symbol, FS-L-0055-253-ST)
