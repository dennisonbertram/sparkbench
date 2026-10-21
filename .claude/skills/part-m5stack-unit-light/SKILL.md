---
name: part-m5stack-unit-light
description: Pinout, electrical limits, wiring and MicroPython driver for the M5Stack Unit Light (SKU U021, photoresistor + LM393 comparator, analog AO and digital DO on a Grove HY2.0-4P port). Use when designing, wiring, simulating or writing code for an M5Stack Unit Light in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# M5Stack Unit Light (U021)

## Overview
The **M5Stack Unit Light** is a small LEGO-compatible block with a Grove (HY2.0-4P) socket. Inside (M5Stack schematic UNIT_LIGHTNESS V1.0):
- an **HT7533** regulator that makes 3.3 V from the 5V pin
- a **photoresistor** under a **10 kΩ** resistor to 3.3 V, giving the analog output **AO**
- an **LM393** comparator (onsemi LM393DR2G) that compares AO with a **10 kΩ trimmer**, giving the digital output **DO** (10 kΩ pull-up to 3.3 V)

AO is a relative light level, not lux:
- **AO = 3.3 V × R_ldr / (10 kΩ + R_ldr)**, so AO **falls as the light gets brighter** (near 0 V in bright light, towards 3.3 V in the dark).

DO:
- **HIGH** when AO is above the trimmer voltage (**darker** than the threshold)
- **LOW** when **brighter** than the threshold

## Pinout (Grove HY2.0-4P, as printed in M5Stack's PinMap)
| Pin | Wire | Name | Function |
|-----|------|------|----------|
| 1 | Black | GND | Ground |
| 2 | Red | 5V | Supply, 5 V (regulated to 3.3 V on the unit) |
| 3 | Yellow | DO | Digital output: HIGH = dark, LOW = bright |
| 4 | White | AO | Analog output 0–3.3 V: lower = brighter |

On an M5Stack Core this is Port B (DO = G26, AO = G36).

## Electrical limits
- Supply: **5 V** on the red wire (4.5–5.5 V). The HT7533 is only specified to regulate from 4.5 V in (Holtek datasheet), so do not power the unit from 3.3 V: the rail would sag below 3.3 V and the AO formula below would be off. Draws about 1–2 mA (LM393 plus two 10 kΩ dividers; no LEDs).
- AO and DO never exceed the unit's own 3.3 V rail, so they are **safe for 3.3 V GPIOs** even with a 5 V supply.
- DO is the LM393 open-collector output with a 10 kΩ pull-up; it sinks at least 6 mA (onsemi datasheet).

## Interface details
- AO has a 100 nF capacitor to GND; with 10 kΩ that is a 1 ms filter, so it settles almost instantly.
- LDR resistance from AO: **R = 10 kΩ × V / (3.3 − V)**.
- The LM393's input common-mode range only reaches VCC − 1.5 V (about 1.8 V here), so DO switches most reliably with the trimmer set in the lower half of AO's range (bright to medium light).

## Wiring
| Unit | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| GND (black) | GND | GND | GND (pin 6) |
| 5V (red) | 5V / VIN | VBUS | 5 V (pin 2) |
| DO (yellow) | any GPIO, e.g. GPIO26 | any GP, e.g. GP2 | any GPIO, e.g. GPIO24 (pin 18) |
| AO (white) | ADC1 pin, e.g. GPIO36 / GPIO34 | GP26–GP28 (ADC) | needs an external ADC (e.g. ADS1115) |

## Using the driver
```python
from m5_unit_light import UnitLight
import time
light = UnitLight(36, 26)          # AO GPIO, DO GPIO
while True:
    print('AO=%.1fV DO=%s' % (light.voltage(), 'dark' if light.dark() else 'bright'))
    time.sleep(1)
```
`light.resistance()` gives the photoresistor in ohms, `light.brightness()` a 0–100 % relative level.

## Gotchas
- **AO is inverted**: a lower voltage means more light.
- **DO is HIGH in the dark**: handy for a night light (switch on while `dark()` is True).
- On an ESP32, use an **ADC1** pin for AO (ADC2 stops working while Wi-Fi is on).
- The trimmer only moves the DO threshold; it does not scale AO (so two units will not read the same).
- Not calibrated in lux. For lux use a BH1750, VEML7700 or M5Stack's DLight unit.
- The unit has a Grove socket, not header pins: use a Grove-to-jumper cable on a breadboard.

## Datasheet
- Schematic: https://m5stack-doc.oss-cn-shenzhen.aliyuncs.com/709/U201-UNIT_LIGHT_SCHE.pdf
- LM393: https://www.onsemi.com/pdf/datasheet/lm393-d.pdf
