---
name: part-xkc-y25
description: Pinout, electrical limits, wiring and MicroPython driver for the XKC-Y25-NPN non-contact capacitive liquid level sensor (5-12 V, NPN open-collector output, sticks to the outside of a non-metallic tank). Use when designing, wiring, simulating or writing code for an XKC-Y25 water level sensor in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# XKC-Y25-NPN non-contact liquid level sensor (XKC-Y25-NPN)

## Overview
The **XKC-Y25** is a small square capacitive sensor from Shenzhen XingKeChuang. You glue it to the **outside** of a plastic, glass or ceramic container (wall up to 20 mm). It reports whether liquid is at its height. It never touches the liquid.
- On/off only: one sensor = one level point. Use two sensors for high and low levels
- **NPN open-collector output.** With the black wire left open, **OUT goes LOW when liquid is sensed**. Otherwise OUT is open, so it **needs a pull-up**
- Supply **5-12 V DC** (the XKC-Y25-NPN 5-12 V model), 5 mA or less. Response time about **500 ms**. Level accuracy ±1.5 mm
- Sensitivity knob under the back cover. An LED lights when it senses liquid

The family has four versions that look the same: **-V** (drives OUT to the supply voltage), **-NPN**, **-PNP** (drives OUT high to the supply) and **-RS485**. The NPN version is the one to use with a 3.3 V board. Check the label.

Modelled product: **XKC-Y25-NPN (DC 5-12 V)**, 50 cm 4-wire lead on an XH2.54 4-pin plug.

## Pinout (4-wire lead, manual's terminal order)
| # | Name | Wire | Function |
|---|---|---|---|
| 1 | VCC | brown | Supply, 5-12 V |
| 2 | OUT | yellow | NPN open collector, LOW = liquid (black open) |
| 3 | GND | blue | Ground |
| 4 | MODE | black | Output mode ("COM terminal"): open = normally open, GND = normally closed |

## Electrical limits
- Supply 5-12 V for the 5-12 V model. A separate **24 V** NPN model exists for industrial use. Use the board's 5V / VBUS pin.
- OUT is an open collector and sinks up to 100 mA (the manual uses it to drive a small relay). It has no pull-up of its own. On a 3.3 V board, **pull it up to 3V3 with 10 kΩ**. The GPIO's internal pull-up also works on short leads. **Never pull it up to the sensor's 5-12 V supply.**
- The **-V and -PNP versions drive OUT to the supply voltage**. Don't wire them straight to an ESP32 or Pico GPIO.

## Interface details
Plain digital input (manual section 9):
```
black wire open (normally open):   liquid -> transistor on  -> OUT = 0
                                   none   -> transistor off -> OUT = 1 (pull-up)
black wire to GND (normally closed): the reverse
```
The output follows the liquid about 500 ms after it reaches the sensing point.

## Wiring
| Sensor | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| VCC (brown) | 5V / VIN | VBUS (pin 40) | 5V (pin 2) |
| GND (blue) | GND | GND | GND (pin 6) |
| OUT (yellow) | GPIO25 + 10 kΩ to 3V3 | GP2 + 10 kΩ to 3V3 | GPIO17 (pin 11) + 10 kΩ to 3V3 |
| MODE (black) | not connected | not connected | not connected |

## Using the driver
```python
from xkc_y25 import XKCY25
import time
sensor = XKCY25(25)          # GPIO wired to OUT; enables the internal pull-up too
while True:
    print('Liquid: %s' % ('YES' if sensor.liquid() else 'no'))
    time.sleep(0.5)
```
`liquid()` is True while liquid is at the sensor. `raw()` returns the pin level. `irq(handler)` calls `handler(pin)` when liquid arrives, or when it leaves with `on_liquid=False`. If you tied the black wire to GND, pass `normally_closed=True`.

## Gotchas
- **No pull-up means OUT floats** and the readings are random.
- **The black wire is not ground.** Grounding it inverts the output. The manual warns not to use it as GND.
- Mount it flat and tight against the wall (gap under 0.5 mm, glue it). Keep it away from metal and from where the liquid pours in. It cannot sense through metal tanks.
- Viscous liquids (over 30 mPa·s) cling to the wall and give false "liquid" readings.
- If it never switches, turn the knob counter-clockwise for more sensitivity. If it is always on, turn it clockwise.

## Datasheet
XKC-Y25-NPN instruction manual V1.6 (XingKeChuang): https://www.xkc-sensor.com/phoenix/admin/download?fileId=gtfUWpqMgIJO&dp=GvUApKfKKUAU (product page https://www.xkc-sensor.com/detail/1432.html).
Wire colours and order: the manual's "Terminal sequence" (brown VCC, yellow OUT, blue GND, black COM) and the ICStation listing.
