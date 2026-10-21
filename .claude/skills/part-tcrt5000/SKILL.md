---
name: part-tcrt5000
description: Pinout, electrical limits, wiring and MicroPython driver for the TCRT5000 IR line tracking sensor module (Vishay TCRT5000 reflective sensor + LM393 comparator, DO and AO outputs). Use when designing, wiring, simulating or writing code for a TCRT5000 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# TCRT5000 IR line tracking sensor (TCRT5000)

## Overview
The **Vishay TCRT5000** packs a 950 nm IR LED and a phototransistor side by side behind a daylight filter. It sees reflections best at **2.5 mm** and usefully from 0.2 to 15 mm, so it is used pointing down at the floor to follow a black line. Hobbyists buy it on the **common blue 4-pin module** with an **LM393 comparator**, a sensitivity trimmer, a power LED and a switch LED.
- **DO goes LOW over a white / reflective surface** (switch LED on), **HIGH over a black line** or with nothing in range
- **AO** is the raw phototransistor voltage: near VCC with no reflection, lower the more IR comes back
- Supply: **3.3-5 V**

## Pinout (4-pin header, as printed on the common board)
| Pin | Name | Function |
|---|---|---|
| 1 | VCC | Supply, 3.3-5 V |
| 2 | GND | Ground |
| 3 | DO | Digital output: 0 = white/reflective, 1 = black line / nothing |
| 4 | AO | Analog output (optional), lower = more reflection |

Some newer boards print **VCC, DO, AO, GND**: always follow the silkscreen.

## Board circuit (from the module schematic)
- IR LED: 180 Ω from VCC, always on (about 21 mA at 5 V, 11 mA at 3.3 V; datasheet maximum 60 mA).
- Phototransistor collector: 10 kΩ pull-up to VCC, 100 nF to GND. This node is **AO** and feeds the LM393 **+** input.
- Trimmer VR1 (10 kΩ) sets the LM393 **−** input.
- LM393 output = **DO**, 10 kΩ pull-up to VCC; the switch LED (1 kΩ from VCC) lights when DO is low.
So: reflection → transistor conducts → AO drops below the trimmer voltage → DO low.

## Electrical limits
- Supply 3.3-5 V. DO and AO swing up to VCC, so **power it from 3V3 on an ESP32 or Pico**.
- Draws up to about 28 mA at 5 V (mostly the IR LED and the two indicator LEDs).
- TCRT5000: IR LED max 60 mA / reverse 5 V; phototransistor VCEO 70 V, ambient −25 to +85 °C.

## Interface details
Plain digital input, no protocol:
```
DO = 0  -> white / light surface within a few mm
DO = 1  -> black line, or nothing in range
```
No internal pull-up needed (the board has one). For a graded value read AO with an ADC: on an ESP32 use 11 dB attenuation (the driver does this) so the full 0-3.3 V range is measured.

## Wiring
| Module | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| VCC | 3V3 | 3V3(OUT) (pin 36) | 3V3 (pin 1) |
| GND | GND | GND | GND (pin 6) |
| DO | GPIO27 | GP15 | GPIO17 (pin 11) |
| AO (optional) | GPIO34 | GP26 (ADC0) | needs an external ADC |

## Using the driver
```python
from tcrt5000 import TCRT5000
import time
sensor = TCRT5000(27)            # GPIO wired to DO; TCRT5000(27, 34) also reads AO
while True:
    print('Surface: %s' % ('white' if sensor.reflective() else 'black'))
    time.sleep(0.5)
```
`reflective()` is True over white, `on_line()` True over black; `raw()` returns DO; `analog()` returns AO as 0-65535; `irq(handler)` fires when a reflective surface appears (`on_reflect=False` for moving onto the line).

## Gotchas
- **Height matters**: keep the sensor 2-10 mm above the floor. Too high and everything reads "black".
- **Set the trimmer** so the switch LED is on over white and off over the black line.
- "Black" (DO high) also means "nothing there", e.g. the robot was lifted off the floor.
- **Sunlight** and incandescent light contain IR and can cause false readings.
- Glossy black tape can reflect IR like white; matte black works best.

## Datasheet
https://www.vishay.com/docs/83760/tcrt5000.pdf
Module schematic and pin order: https://easyelecmodule.com/wp-content/uploads/TCRT5000-Sensor-Module-Circuit-Diagram-1.jpg (VCC, GND, DO, AO).
