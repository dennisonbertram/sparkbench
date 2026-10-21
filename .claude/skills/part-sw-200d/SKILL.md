---
name: part-sw-200d
description: Pinout, electrical limits, wiring and MicroPython driver for the SW-200D two-ball tilt switch on the Seeed Studio Grove - Tilt Switch board (SIG, NC, VCC, GND; digital output). Use when designing, wiring, simulating or writing code for an SW-200D in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# SW-200D tilt switch (Seeed Grove - Tilt Switch)

## Overview
The **Grove - Tilt Switch** carries an **SW-200D** two-ball, single-direction tilt switch and a 10 kΩ resistor. No comparator, no LED.
- The switch is wired between **VCC and SIG**; a **10 kΩ pull-down** holds SIG at GND while it is open.
- The switch **closes when the gold-pin end points down** by more than about 10° (board upright) and **opens when tipped >10° toward the silver-pin end**.
- **SIG is HIGH while closed, LOW while open.**
- Supply: **3-5.25 V**, about 0.5 mA through the pull-down while closed.

## Pinout (Grove connector, as printed on the board)
| Pin | Name | Wire | Function |
|---|---|---|---|
| 1 | SIG | yellow | Digital output: 1 = switch closed, 0 = open |
| 2 | NC | white | Not connected |
| 3 | VCC | red | Supply, 3-5.25 V |
| 4 | GND | black | Ground |

## Electrical limits
- Board supply 3-5.25 V (Seeed wiki).
- SW-200D contact rating (datasheet): < 12 V, < 25 mA, closed < 1 Ω, open > 10 MΩ, conduction time about 2 ms, -40 to 70 °C, > 100,000 cycles.
- SIG is switched straight to VCC: **with a 3.3 V board power the module from 3V3**.

## Interface details
Plain digital input, no protocol:
```
SIG = 1 -> switch closed (gold-pin end down / upright)
SIG = 0 -> switch open   (tipped toward the silver-pin end)
```
Do not enable an internal pull-up (the board has a pull-down). Debounce in software; the driver waits 20 ms for a stable level.

## Wiring
| Grove | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| SIG | GPIO25 | GP2 | GPIO17 (pin 11) |
| NC | - | - | - |
| VCC | 3V3 | 3V3(OUT) (pin 36) | 3V3 (pin 1) |
| GND | GND | GND | GND (pin 6) |

## Using the driver
```python
from sw200d import SW200D
import time
sw = SW200D(25)            # GPIO wired to SIG
while True:
    print('Tilt switch: %s' % ('CLOSED' if sw.is_closed() else 'open'))
    time.sleep(0.5)
```
`is_closed()` returns the debounced state; `tilted()` is its inverse; `raw()` is the instantaneous SIG level.

## Gotchas
- **Active HIGH**, unlike the KY-020 / SW-520D modules, which read LOW when the switch is closed.
- **Single direction**: it only detects tipping toward the silver-pin end. Tipping sideways may not open it.
- **5 V on VCC puts 5 V on SIG**: use 3V3 with ESP32 / Pico.
- On/off only. For an angle use an accelerometer.
- The bare SW-200D (two leads) can be used without the Grove board: one lead to 3V3, the other to a GPIO with a 10 kΩ pull-down (or to GND with the internal pull-up, which inverts the logic).

## Datasheet
SW-200D: https://files.seeedstudio.com/wiki/Grove-Tilt_Switch/res/SW200D_datasheet.pdf
Board schematic (Grove - Tilt Switch v1.1): https://files.seeedstudio.com/wiki/Grove-Tilt_Switch/res/Grove-Tilt_Switch_v1.1_PDF_File.pdf
Pin order: Seeed wiki (SIG, NC, VCC, GND): https://wiki.seeedstudio.com/Grove-Tilt_Switch/
