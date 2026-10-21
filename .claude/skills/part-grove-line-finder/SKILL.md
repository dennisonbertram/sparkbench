---
name: part-grove-line-finder
description: Pinout, electrical limits, wiring and MicroPython driver for the Seeed Grove - Line Finder v1.1 (SKU 101020172; RS-06WD IR reflective sensor + LMV358 comparator, Grove SIG/NC/VCC/GND, SIG high over a black line). Use when designing, wiring, simulating or writing code for a Grove Line Finder in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build, e.g. a line-following robot.
---

# Seeed Grove - Line Finder v1.1

## Overview
A 20 x 20 mm Grove board with an **RS-06WD** reflective sensor (IR LED + phototransistor) and an **LMV358** op-amp used as a comparator, a sensitivity trimmer (R6) and a red indicator LED. Point it down at the floor to follow a black line on white (or the reverse). Hobbyists buy it as **Seeed Grove - Line Finder v1.1, SKU 101020172**.
- **SIG HIGH over a black line** (or with nothing in range), **LOW over a white surface** (red LED on)
- Supply: **5 V** (Seeed specification)
- SIG is a push-pull op-amp output that swings to VCC, i.e. **5 V**

## Pinout (Grove connector J1, schematic order)
| Pin | Wire | Function |
|---|---|---|
| SIG | yellow | Digital output: 1 = black line / nothing, 0 = white |
| NC | white | Not connected |
| VCC | red | Supply 5 V |
| GND | black | Ground |

The board has a 2 mm Grove socket: use a Grove-to-female-jumper cable to reach a breadboard.

## Board circuit (Seeed schematic v1.1)
- IR LED: 100 Ω from VCC, always on (about 35-40 mA at 5 V).
- Phototransistor pulls the LMV358 **+** input low against a 22 kΩ pull-up when IR comes back.
- Trimmer R6 (10 kΩ) sets the **−** input.
- LMV358 output = **SIG** (rail-to-rail push-pull). Red LED + 10 kΩ from VCC to SIG: lit when SIG is low.
So: white surface → strong reflection → + input below threshold → SIG low.

## Electrical limits
- VCC 5 V per Seeed (LMV358 absolute max 5.5 V; use 4.75-5.25 V).
- About 40 mA, mostly the IR LED.
- **SIG swings to 5 V**: on an ESP32 / Pico / Raspberry Pi put a divider in the line, e.g. **10 kΩ from SIG to the GPIO and 15 kΩ from the GPIO to GND** (3.0 V high). Sparkbench adds these resistors for you. The logic is unchanged.

## Interface details
Plain digital input, no protocol. No pull-up or pull-down needed (the op-amp drives both ways).
```
SIG = 1  -> black line, or nothing within range
SIG = 0  -> white / light surface
```

## Wiring
| Module | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| VCC | 5V (VIN) | VBUS (pin 40) | 5V (pin 2) |
| GND | GND | GND | GND (pin 6) |
| SIG | via 10k/15k divider to GPIO27 | via divider to GP15 | via divider to GPIO17 (pin 11) |

## Using the driver
```python
from grove_line_finder import GroveLineFinder
import time
sensor = GroveLineFinder(27)   # GPIO wired (through the divider) to SIG
while True:
    print('Surface: %s' % ('black' if sensor.on_line() else 'white'))
    time.sleep(0.5)
```
`on_line()` is True over black, `on_white()` True over white, `raw()` returns SIG, `irq(handler)` fires when the sensor moves onto the line (`on_line=False` for moving onto white).

## Gotchas
- **Never wire SIG straight to a 3.3 V GPIO** while the module runs on 5 V.
- "Black" (SIG high) also means "nothing there", e.g. the robot was lifted off the floor.
- Keep the sensor a few mm to about 1-2 cm above the surface and turn the trimmer until the red LED is on over white and off over the line.
- Sunlight contains IR and can cause false readings; glossy black tape can reflect like white.

## Datasheet
LMV358: https://files.seeedstudio.com/wiki/Grove_Line_Finder/res/Lmv358.pdf
Schematic and pin order: https://files.seeedstudio.com/wiki/Grove_Line_Finder/res/202000932_Grove%20-%20Line%20Finder%20v1.1.zip (J1: SIG, NC, VCC, GND); wiki https://wiki.seeedstudio.com/Grove-Line_Finder/
