---
name: part-ky-024
description: Pinout, electrical limits, wiring and MicroPython driver for the KY-024 linear Hall magnetic sensor module (AH49E / 49E linear Hall IC + LM393 comparator, AO + DO). Use when designing, wiring, simulating or writing code for a KY-024 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# KY-024 linear Hall magnetic sensor module (KY-024)

## Overview
The **KY-024** is a small black 4-pin module from the 37-in-1 / 40-in-1 sensor kits, for example the **Joy-IT SensorKit KY-024**. It carries an **AH49E (49E) linear Hall-effect IC** on long legs, an **LM393 comparator**, a blue multi-turn trimmer (threshold), a power LED (LED1) and a "field detected" LED (LED2).
- **AO** is the Hall IC's output: about **half the supply with no magnet**, rising when a **south pole** faces the printed side of the sensor and falling for a **north pole**. It measures how strong the field is.
- **DO** goes **HIGH** (LED2 lit) when AO passes the trimmer threshold (Joy-IT KY-024; some clones are inverted).
- Typical uses: magnet position, wheel/shaft speed, measuring a magnet's strength, current sensing with a slotted core.

## Pinout (module header, as printed on the board)
| Pin | Name | Function |
|-----|------|----------|
| 1 | AO | Analog output (Hall IC output) |
| 2 | G | Ground |
| 3 | + | Supply, 3.3–5 V |
| 4 | DO | Digital output from the LM393, HIGH = past threshold |

## Electrical limits
- Supply: **3.3–5 V** on this module (AH49E: 3.0–6.5 V recommended, 8 V absolute max; LM393: 2–36 V).
- Current: AH49E 3.5 mA typ (4.5 mA max) at 5 V, plus the LEDs: about 6–10 mA in total.
- AH49E at 5 V (datasheet): null **2.5 V** (2.25–2.75 V), sensitivity **1.6 mV/G** typ (1.1–2.1), field range **±1000 G** typ (±650 G min), output span 0.8 V to VCC−0.8 V.
- The output is set by the supply: null = VCC/2, sensitivity scales with VCC/5 V. At 3.3 V: null ≈ 1.65 V, ≈ 1.06 mV/G, so ±1000 G gives about 0.59–2.71 V.
- AO and DO swing up to the supply. **On an ESP32, Pico or Raspberry Pi, power + from 3.3 V.**

## Interface details
No protocol. Field from the AO voltage:
```
B [gauss] = (V_AO - VCC/2) / (1.6 mV/G x VCC / 5 V)       (1 mT = 10 G)
```
Positive = south pole at the printed face. The null varies ±10 % between parts and the sensitivity ±30 %, so zero the reading with no magnet nearby and calibrate against a known magnet for real numbers. DO is an LM393 output with the board's pull-up: HIGH once AO passes the trimmer setting.

## Wiring
| Module | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| + | 3V3 | 3V3(OUT) (pin 36) | 3.3 V (pin 1) |
| G | GND | GND | GND (pin 6) |
| AO | GPIO32–39 (ADC1) | GP26/27/28 (ADC) | needs an external ADC (e.g. KY-053) |
| DO | any GPIO, e.g. GPIO25 | any GP, e.g. GP18 | any GPIO, e.g. GPIO24 (pin 18) |

## Using the driver
```python
from ky024 import KY024
import time
hall = KY024(32, do=25)     # AO GPIO, DO GPIO; vcc=3.3 by default
hall.zero()                 # optional: no magnet near
while True:
    print('B=%d G DO=%d' % (hall.gauss(), hall.triggered()))
    time.sleep(0.5)
```
`voltage()` returns AO in volts, `gauss()` the field, `triggered()` the DO state. Pass `vcc=5.0` only if your ADC can take 5 V signals; `active_high=False` for clones whose DO goes LOW.

## Gotchas
- **5 V supply + 3.3 V board** puts up to ~4.2 V on AO and 5 V on DO. Use 3.3 V.
- On the ESP32 use ADC1 pins (GPIO32–39); ADC2 does not work with Wi-Fi on.
- Readings are typical, not calibrated: the 49E's sensitivity can be 1.1–2.1 mV/G.
- The field falls off fast with distance; a fridge magnet a few cm away may read only tens of gauss.
- Do not bend the Hall IC's legs right at the body.

## Datasheet
https://www.diodes.com/assets/Datasheets/AH49E.pdf (AH49E linear Hall IC). LM393: https://www.ti.com/lit/ds/symlink/lm393.pdf. Module documentation and pin order: https://sensorkit.joy-it.net/en/sensors/ky-024
