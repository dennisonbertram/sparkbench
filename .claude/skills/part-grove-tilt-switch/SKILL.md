---
name: part-grove-tilt-switch
description: Pinout, electrical limits, wiring and MicroPython driver for the Seeed Grove - Tilt Switch (SKU 101020025; SW-200D two-ball tilt switch from VCC to SIG with a 10 kOhm pull-down, Grove SIG/NC/VCC/GND). Use when designing, wiring, simulating or writing code for a Grove Tilt Switch in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Seeed Grove - Tilt Switch (SW-200D)

## Overview
The **Seeed Grove - Tilt Switch (SKU 101020025)** is the simplest possible tilt sensor: an **SW-200D** two-ball tilt switch connected from **VCC to SIG**, and a **10 kΩ pull-down (R1)** from SIG to GND (Seeed schematic v1.1). There is no comparator, potentiometer or LED.
- Upright (switch can with its gold pins down): the balls bridge the contacts, the switch is closed and **SIG = VCC (HIGH)**.
- Tilted past about 10° the other way / turned over: the switch opens and the pull-down makes **SIG = 0 V (LOW)**.
- Seeed specifies a connect angle of 10°–170° and a disconnect angle of 190°–350°: it tells you which way up it is, not an angle.
- Supply: **3.0–5.25 V**; current is only VCC / 10 kΩ (0.33 mA at 3.3 V) while upright.

## Pinout (Grove connector J2, schematic order)
| Pin | Wire | Function |
|---|---|---|
| SIG | yellow | Output: 1 = upright, 0 = tilted |
| NC | white | Not connected |
| VCC | red | Supply 3.0–5.25 V |
| GND | black | Ground |

The board has a 2 mm Grove socket, so it is wired with a Grove-to-female-jumper cable.

## Electrical limits
- VCC 3.0–5.25 V (Seeed wiki).
- SIG is VCC through the closed switch (<1 Ω), so **the high level equals VCC**. At 5 V that is 5 V on the GPIO, which can damage an ESP32 or Pico: power VCC from 3V3.
- SW-200D: < 12 V, < 25 mA, closed < 1 Ω, open > 10 MΩ, about 2 ms bounce, 100,000 cycles.

## Interface details
Plain digital input, no protocol:
```
SIG = 1  -> upright (switch closed)
SIG = 0  -> tilted  (switch open, 10 k pull-down)
```
No internal pull resistor is needed (the board has the pull-down). Debounce in software: the driver waits 20 ms for a stable level.

## Wiring
| Module | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| SIG | GPIO25 | GP2 | GPIO17 (pin 11) |
| NC | – | – | – |
| VCC | 3V3 | 3V3(OUT) (pin 36) | 3V3 (pin 1) |
| GND | GND | GND | GND (pin 6) |

## Using the driver
```python
from grove_tilt import GroveTilt
import time
sensor = GroveTilt(25)          # GPIO wired to SIG
while True:
    print('Tilt: %s' % ('TILTED' if sensor.tilted() else 'upright'))
    time.sleep(0.5)
```
`upright()` / `tilted()` return the debounced state; `raw()` is the instantaneous SIG level.

## Gotchas
- **Polarity is opposite to the blue SW-520D/LM393 modules**: here SIG is HIGH when upright. (The Seeed wiki text says "LOW normally", meaning when tipped; the schematic is authoritative.)
- **Do not power from 5 V on a 3.3 V board**: SIG goes straight to VCC.
- "Upright" means the switch's gold pins point down. Lying flat it sits near the switching angle and may flicker.
- For an actual angle use an accelerometer (ADXL345, MPU6050).

## Datasheet
SW-200D: https://files.seeedstudio.com/wiki/Grove-Tilt_Switch/res/SW200D_datasheet.pdf
Schematic: https://files.seeedstudio.com/wiki/Grove-Tilt_Switch/res/Grove-Tilt_Switch_v1.1_PDF_File.pdf
Wiki: https://wiki.seeedstudio.com/Grove-Tilt_Switch/
