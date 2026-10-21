---
name: part-m5stack-unit-angle
description: Pinout, electrical limits, wiring and MicroPython driver for the M5Stack Unit Angle (SKU U005, 10 kΩ rotary potentiometer knob with a 10 kΩ series resistor, analog output 0–2.5 V on a Grove HY2.0-4P port). Use when designing, wiring, simulating or writing code for an M5Stack Unit Angle in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# M5Stack Unit Angle (U005)

## Overview
The **M5Stack Unit Angle** is a LEGO-compatible block with a rotary knob and a Grove (HY2.0-4P) socket. Inside (M5Stack schematic and output-voltage diagram):
- a fixed resistor **R1 = 10 kΩ** from the 5V pin to the top of the track
- a **10 kΩ potentiometer** (R2) from there to GND; its **wiper is the Analog Output** pin

There is no regulator, op-amp or ADC on the unit: it is a plain divider fed from the 5 V pin.

```
Uo = 5000 mV × Rp / (Rp + R1)      Rp = wiper-to-GND resistance, 0 … 10 kΩ
```
So the output runs **0 V to 2.5 V** (M5Stack spec: "Output Voltage 0 ~ 2500 mV"), and it is **not linear** in knob angle: the curve bends over towards the top (knob half-way gives about 1.67 V, not 1.25 V). The driver turns the voltage back into the knob position:
```
Rp = R1 × Uo / (5 V − Uo)          position = Rp / 10 kΩ
```

## Pinout (Grove HY2.0-4P, as in M5Stack's PinMap)
| Pin | Wire | Name | Function |
|-----|------|------|----------|
| 1 | Black | GND | Ground |
| 2 | Red | 5V | Supply, 5 V (feeds R1 and the pot) |
| 3 | Yellow | NC | Not connected |
| 4 | White | AO | Analog output 0–2.5 V (pot wiper) |

On an M5Stack Core this is Port B (analog on G36).

## Electrical limits
- Supply: **5 V** (4.5–5.5 V). Current = 5 V / (10 kΩ + 10 kΩ) = 0.25 mA.
- The output tracks the supply: Uo(max) = Vcc / 2. With 5 V that is 2.5 V, **safe for 3.3 V ADC pins** (ESP32, Pico).
- Running it from 3.3 V also works, but the range shrinks to 0–1.65 V: pass `vcc=3.3` to the driver.
- Source resistance of the output: up to 5 kΩ (R1 + pot top half in parallel with the bottom half), fine for a microcontroller ADC.

## Wiring
| Unit | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| GND (black) | GND | GND | GND (pin 6) |
| 5V (red) | 5V / VIN | VBUS | 5 V (pin 2) |
| NC (yellow) | — | — | — |
| AO (white) | ADC1 pin, e.g. GPIO36 / GPIO34 | GP26–GP28 (ADC) | needs an external ADC (e.g. ADS1115) |

## Using the driver
```python
from m5_unit_angle import UnitAngle
import time
knob = UnitAngle(36)                 # GPIO wired to AO
while True:
    print('V=%.2f P=%d%%' % (knob.voltage(), round(knob.percent())))
    time.sleep(0.5)
```
`resistance()` gives Rp in ohms, `fraction()` 0.0–1.0, `raw()` one raw ADC reading.

## Gotchas
- **Not linear**: do not scale 0–2.5 V straight to 0–100 %; use `percent()`, which inverts the divider formula.
- **Reads 2.5 V at most**, not 3.3 V: mapping `read_u16()` 0–65535 to 0–100 % never reaches 100 %.
- On an ESP32 use an **ADC1** pin with 11 dB attenuation (the driver sets it); ADC2 stops working while Wi-Fi is on.
- One revision of M5Stack's schematic image shows R1 = **4.7 kΩ** instead of 10 kΩ; with that resistor the top of the range is 5 × 10/14.7 = 3.4 V (above 3.3 V, still under the ESP32's 3.6 V absolute maximum). If your unit reads more than 2.5 V at full turn, it has the 4.7 kΩ resistor: use `UnitAngle(pin, r1=4700)` and keep the knob off the end stop, or power it from 3.3 V.
- The unit has a Grove socket, not header pins: use a Grove-to-jumper cable on a breadboard.

## Datasheet
- Product page / spec / PinMap: https://docs.m5stack.com/en/unit/angle
- Schematic and output formula: https://static-cdn.m5stack.com/resource/docs/products/unit/angle/angle_sch_02.webp
