---
name: part-grove-electromagnet
description: Pinout, electrical limits, wiring and MicroPython code for the Seeed Grove Electromagnet (SKU 101020073; ZYE1-P20/15 holding magnet switched by a CJ2302 MOSFET, SIG/NC/VCC/GND). Use when designing, wiring, simulating or writing code for a Grove electromagnet in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Grove Electromagnet (v1.0)

## Overview
A **5 V holding electromagnet** (ZYE1-P20/15: 20 mm x 15 mm, 25 N rated, about 1 kg peak hold) on a Grove board with its own switch. Hobbyists buy it as the **Seeed Studio Grove - Electromagnet (SKU 101020073)**. Per the Seeed v1.0 Eagle schematic, SIG goes through **100 Ω** to the gate of a **CJ2302 N-channel MOSFET** (**100 kΩ** gate pull-down). The MOSFET switches the coil from VCC, and a **1N4148 flyback diode** sits across the coil.

## Pinout (Grove connector order)
| Pin | Wire | Function |
|---|---|---|
| SIG | yellow | Control input: high = magnet on, low/unconnected = off |
| NC | white | Not connected |
| VCC | red | 5 V coil supply, about 400 mA |
| GND | black | Ground (shared with the microcontroller and the 5 V supply) |

## Electrical limits
- Supply: 5 V DC, working current 400 mA, standby current 200 µA (Seeed spec). The coil is marked DC6V 0.5A (about 12 Ω), so expect roughly 0.4 A at 5 V.
- Feed VCC from a 5 V source rated for at least 0.5 A. Never from a 3V3 pin. A separate 5 V supply with a common ground is the safe choice.
- SIG only charges the MOSFET gate, so a 3.3 V GPIO drives it directly.

## Interface details
- Plain digital output: `Pin.value(1)` = hold, `Pin.value(0)` = release. No driver library needed.
- Optional PWM (about 1 kHz) on SIG to lower the holding power and heat once an object is held.

## Wiring
- ESP32: VCC → external 5 V (or VIN/5V on USB for one magnet), GND → GND, SIG → GPIO25.
- Pico: VCC → external 5 V (or VBUS), GND → GND, SIG → GP2.
- Raspberry Pi 4: VCC → external 5 V (or pin 2), GND → pin 6, SIG → pin 18 (GPIO24).
- The board has a 2 mm Grove socket. Use a Grove-to-female-jumper cable (yellow = SIG, white = NC, red = VCC, black = GND).

## Using it
```python
from machine import Pin
import time
magnet = Pin(25, Pin.OUT, value=0)  # SIG
magnet.value(1); time.sleep(2); magnet.value(0)   # hold for 2 s, then release
```

## Gotchas
- The signal is on the yellow wire (pin 1). The white wire (pin 2) is NC.
- The coil gets warm when left on. Switch it off when nothing needs holding.
- It holds best on flat mild steel at least 5 mm thick. Thin sheet, stainless steel, aluminium and brass hold weakly or not at all.
- A powered magnet can upset a nearby compass/magnetometer or Hall sensor. Keep them apart.

## Datasheet
https://files.seeedstudio.com/wiki/Bazaar_file/101020073/ZYE1-P%20electro%20holding%20magnets.pdf (magnet); schematic https://files.seeedstudio.com/wiki/Grove-Electromagnet/res/Grove_Electromagnet_v1.0_SCH_PCB.zip; product wiki https://wiki.seeedstudio.com/Grove-Electromagnet/
