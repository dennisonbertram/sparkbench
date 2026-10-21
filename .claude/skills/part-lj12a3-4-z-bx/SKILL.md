---
name: part-lj12a3-4-z-bx
description: Pinout, electrical limits, wiring and MicroPython driver for the LJ12A3-4-Z/BX inductive proximity switch (M12 barrel, 4 mm metal sensing, 6-36 V supply, NPN normally-open open-collector output). Use when designing, wiring, simulating or writing code for an LJ12A3-4-Z/BX in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build, e.g. 3D printer / CNC endstops or metal object counting.
---

# LJ12A3-4-Z/BX inductive proximity switch

## Overview
The **LJ12A3-4-Z/BX** is a 12 mm threaded metal barrel (about 58 mm long) with a 1 m three-wire cable. It senses **metal** (iron and steel best) in front of its face, without contact, and switches an NPN transistor on.
- Sensing distance **0-4 mm** (±10 %) on steel; other metals are sensed closer
- **Supply 6-36 V DC** (it does not run from 3.3 V or 5 V; use a 12 V or 24 V supply)
- Output: **NPN, normally open, open collector**, sinks up to 300 mA. **OUT goes LOW when metal is detected**, otherwise it is open and needs a pull-up
- Red LED on the end lights while it detects
- Switching frequency above 10 kHz, so it can count gear teeth

Modelled product: **LJ12A3-4-Z/BX** (M12 x 58 mm nickel-plated brass barrel, 1 m PVC lead: brown V+, black OUT, blue GND).

## Pinout (3-wire lead)
| # | Name | Wire | Function |
|---|---|---|---|
| 1 | VCC | brown | Supply, 6-36 V DC from a separate supply |
| 2 | OUT | black | NPN open collector ("load"), LOW = metal |
| 3 | GND | blue | Ground, common with the supply and the microcontroller |

Wire colours follow the usual industrial code (and the Electrokit sheet). A few batches have been seen labelled differently, so check the label on the cable before powering it.

## Electrical limits
- **VCC 6-36 V DC** from an external supply (12 V is typical). Never from the board's 3V3/5V pins. Polarity protected.
- OUT is open collector: pull it up to **3V3** (4.7-10 kΩ, Sparkbench adds 10 kΩ; the driver also enables the internal pull-up). **Never pull OUT up to VCC** (12-24 V would destroy an ESP32/Pico GPIO).
- The supply negative, the blue wire and the microcontroller GND must be joined.
- Many units have the indicator LED in the collector circuit, so an unloaded OUT can float to several volts. For extra protection put a small Schottky diode (1N5819 / BAT85) in series: cathode to the black wire, anode to the GPIO + pull-up. A logic-level opto (PC817) is the fully isolated alternative.
- No short-circuit protection on some batches: never connect OUT straight to a supply.

## Interface details
Plain digital input:
```
OUT = 0  -> metal within ~4 mm
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
from lj12a3 import LJ12A3
import time
sensor = LJ12A3(25)          # GPIO wired to the black wire
while True:
    print('Metal: %s' % ('YES' if sensor.detected() else 'no'))
    time.sleep(0.5)
```
`detected()` is True while metal is in range, `raw()` returns the pin level, `irq(handler)` fires on the falling edge (metal arrives) or with `on_detect=False` on the rising edge.

## Gotchas
- Without a pull-up OUT floats and the readings are random.
- It only sees metal; plastic, wood and glass are invisible to it. Aluminium and copper trigger closer than steel.
- As a 3D printer Z probe, the bed must be steel (or have a steel sheet); 4 mm is the maximum, aim for 1-2 mm.
- The 5 V variant (LJ12A3-4-Z/BX-5V), the PNP version (/BY) and the 2-wire version (/EX) look identical: check the label.

## Datasheet
Electrokit LJ12A3-4 sheet: https://www.electrokit.com/upload/product/41014/41014825/LJ12A3-4.pdf (brown V+, black load, blue GND). Also Conrad/iduino sheet: https://asset.conrad.com/media10/add/160267/c1/-/en/002380072DS00/datablad-2380072-iduino-sensor-modul-passar-till-arduino-bulk.pdf
