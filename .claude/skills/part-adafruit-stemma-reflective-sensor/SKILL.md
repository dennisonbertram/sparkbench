---
name: part-adafruit-stemma-reflective-sensor
description: Pinout, electrical limits, wiring and MicroPython driver for the Adafruit STEMMA Reflective Photo Interrupt Sensor (product 5913, Vishay TCRT1000 reflective IR sensor with 10 kOhm pull-up, SIG/VIN/GND). Use when designing, wiring, simulating or writing code for this reflective photo interrupt sensor in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Adafruit STEMMA Reflective Photo Interrupt Sensor (TCRT1000)

## Overview
Adafruit product **5913** carries a **Vishay TCRT1000**: a 950 nm IR LED and a phototransistor side by side behind a daylight filter. It sees reflections best at **1 mm** and usefully from **0.2 to 4 mm**, so it detects things passing very close: filament, slots in an encoder disc, an object on a conveyor.
- **SIG is HIGH with nothing in front, LOW while IR is reflected back** (red Sig LED on)
- Trimmer sets IR LED current from about 10 mA to about 100 mA (sensitivity)
- Supply: **3-5 V**, green ON LED shows power
- Note: the request listed it as #5629, but that Adafruit ID is the FeatherS2 Neo; the sensor is #5913.

## Pinout (3-pin header, as printed: SIG, VIN, GND)
| Pin | Name | Function |
|---|---|---|
| 1 | SIG | Phototransistor collector, 10 kOhm pull-up to VIN: 1 = nothing, 0 = reflection |
| 2 | VIN | Supply 3-5 V |
| 3 | GND | Ground |

The STEMMA JST PH (2 mm) connector carries the same signals: white = SIG, red = VIN, black = GND.

## Board circuit (Adafruit "Stemma TCRT1000 rev A" schematic)
- IR LED anode via R2 and the 200 Ω trimmer R5 to VIN, cathode to GND: always on, 10-100 mA (datasheet max 100 mA).
- Phototransistor emitter to GND; collector = **SIG**, R4 10 kΩ to VIN.
- Red Sig LED (R1, jumper SJ2) between VIN and SIG: lights when SIG is pulled low.
- Green ON LED (R3, jumper SJ1) from VIN, 10 µF decoupling.

## Electrical limits
- Supply 3-5 V. SIG swings to VIN, so **power it from 3V3 on an ESP32 or Pico**.
- Draws up to about 105 mA with the trimmer turned fully up (IR LED); about 10-15 mA turned down.
- TCRT1000: emitter IF max 100 mA, VR 5 V; phototransistor VCEO 32 V, IC 50 mA; ambient −40 to +85 °C.

## Interface details
Plain digital input, no protocol:
```
SIG = 1  -> nothing within ~4 mm (or a dark, non-reflective surface)
SIG = 0  -> IR reflected back (object / light surface close in front)
```
The board has its own 10 kΩ pull-up, so no GPIO pull-up is needed. SIG is really an analog collector voltage that falls with more reflection; a weak reflection can sit mid-way, so turn the trimmer up if detection is marginal (or read SIG with an ADC).

## Wiring
| Module | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| SIG | GPIO25 | GP2 | GPIO17 (pin 11) |
| VIN | 3V3 | 3V3(OUT) (pin 36) | 3V3 (pin 1) |
| GND | GND | GND | GND (pin 6) |

## Using the driver
```python
from stemma_reflective import StemmaReflective
import time
sensor = StemmaReflective(25)     # GPIO wired to SIG
while True:
    print('Object: %s' % ('yes' if sensor.detected() else 'no'))
    time.sleep(0.2)
```
`detected()` is True while IR is reflected; `raw()` returns SIG; `irq(handler)` fires when an object appears (`on_detect=False` for when it leaves).

## Gotchas
- **Range is tiny**: about 0.2-4 mm. It is not an obstacle sensor for robots.
- **Turn the trimmer up** if objects are missed; turn it down to save current (up to ~100 mA at full).
- Do not run VIN at 5 V with a 3.3 V microcontroller: SIG would reach 5 V.
- Sunlight contains IR and can cause false detections; matte black surfaces may not be seen.

## Datasheet
https://cdn-learn.adafruit.com/assets/assets/000/129/122/original/tcrt1000.pdf (Vishay TCRT1000, doc 83752)
Pin order and circuit: https://learn.adafruit.com/adafruit-stemma-reflective-photo-interrupt-sensor/pinouts, schematic https://cdn-learn.adafruit.com/assets/assets/000/129/123/large1024/sensors_schem.png, fab print https://cdn-learn.adafruit.com/assets/assets/000/129/124/large1024/sensors_fab.png
