---
name: part-ljc18a3-h-z-bx
description: Pinout, electrical limits, wiring and MicroPython driver for the LJC18A3-H-Z/BX capacitive proximity switch (M18 barrel, 1-10 mm sensing of metal and non-metal objects, 6-36 V supply, NPN normally-open open-collector output). Use when designing, wiring, simulating or writing code for an LJC18A3 capacitive sensor in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build, e.g. liquid / grain level detection through a tank wall or non-contact object counting.
---

# LJC18A3-H-Z/BX capacitive proximity switch

## Overview
The **LJC18A3-H-Z/BX** is an 18 mm threaded barrel (about 75 mm long) with a three-wire cable. It senses **almost anything** (metal, plastic, glass, wood, water, grain, a hand) in front of its face, without contact, and switches an NPN transistor on.
- Sensing distance **1-10 mm**, set with the trimpot on the back (largest on metal and water, shorter on dry plastic or wood)
- **Supply 6-36 V DC**, 12-24 V nominal, under 13 mA (it does not run from 3.3 V or 5 V)
- Output: **NPN, normally open, open collector**, sinks up to 300 mA. **OUT goes LOW when an object is detected**, otherwise it is open and needs a pull-up
- LED on the back lights while it detects
- Response about 100 Hz (sellers of the H version); fine for level switches and slow counting

Modelled product: **LJC18A3-H-Z/BX capacitive proximity sensor switch, NPN NO, DC 6-36 V** (M18 barrel, 3-wire lead: brown V+, black OUT, blue GND). No manufacturer datasheet is published; the figures come from the LJC18A3 family spec sheets reproduced by sellers (see Datasheet).

## Pinout (3-wire lead)
| # | Name | Wire | Function |
|---|---|---|---|
| 1 | VCC | brown | Supply, 6-36 V DC from a separate supply |
| 2 | OUT | black | NPN open collector, LOW = object |
| 3 | GND | blue | 0 V, common with the supply and the microcontroller |

## Electrical limits
- **VCC 6-36 V DC** from an external supply (12 V is typical). Never from the board's 3V3/5V pins. Reverse-polarity and load short-circuit protected (family spec).
- OUT is open collector: pull it up to **3V3** (4.7-10 kΩ; Sparkbench adds 10 kΩ; the driver also enables the internal pull-up). **Never pull OUT up to VCC** (12-24 V would destroy an ESP32/Pico GPIO).
- The supply negative, the blue wire and the microcontroller GND must be joined.
- Some units feed the indicator LED from the supply through the output, so an unloaded OUT can float to several volts. For extra protection put a Schottky diode (1N5819 / BAT85) in series: cathode to the black wire, anode to the GPIO + pull-up. A PC817 optocoupler is the fully isolated alternative.

## Interface details
Plain digital input:
```
OUT = 0  -> object within the set distance
OUT = 1  -> clear (via the 3.3 V pull-up)
```

## Wiring
| Sensor | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| Brown (VCC) | external 12 V + | external 12 V + | external 12 V + |
| Blue (GND) | GND + supply − | GND + supply − | GND (pin 6) + supply − |
| Black (OUT) | GPIO25 + 10 kΩ to 3V3 | GP2 + 10 kΩ to 3V3 | GPIO17 (pin 11) + 10 kΩ to 3V3 |

## Using the driver
```python
from ljc18a3 import LJC18A3
import time
sensor = LJC18A3(25)          # GPIO wired to the black wire
while True:
    print('Object: %s' % ('YES' if sensor.detected() else 'no'))
    time.sleep(0.5)
```
`detected()` is True while something is in range, `raw()` returns the pin level, `irq(handler)` fires on the falling edge (object arrives) or with `on_detect=False` on the rising edge.

## Gotchas
- Without a pull-up OUT floats and the readings are random.
- Capacitive sensors see everything: the mounting bracket, cables, your hand, condensation. Tune the trimpot with the real target in place and keep the face clean and dry.
- For liquid level through a container, the wall must be non-metallic and thin (a few mm); adjust until the LED just switches.
- Look-alikes: /BY is PNP (output goes HIGH to V+ - do not connect it to a GPIO directly), /AX and /AY are normally closed, LJ18A3 (no C) is inductive and sees metal only. Check the label.

## Datasheet
No manufacturer PDF is available. LJC18A3 family specs (6-36 V, < 13 mA, 300 mA NPN/PNP output, 10 mm ±10 %, protection): https://makerlab.ph/products/capacitive-proximity-sensor-ljc18a3-b-z-by. H-Z/BX listing (NPN NO, 6-36 V, 1-10 mm, 100 Hz): https://ebuildelectronics.odoo.com/shop/ljc18a3-h-z-bx-capacitive-proximity-sensor-switch-npn-6-36v-413. Wire colours (brown +, blue −, black output): https://www.direnc.net/kapasitif-pnp-proximity-sensor-ljc18a3-h-zby-en. NPN open-collector pull-up circuit: https://www.electrokit.com/upload/quick/03/0a/be46_NPN-open-collector.pdf
