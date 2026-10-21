---
name: part-grove-water-atomization
description: Pinout, electrical limits, wiring and MicroPython code for the Seeed Grove - Water Atomization v1.0 (ultrasonic mist maker driver: ETA1617 5 V to 16 V boost, NE555 ~105 kHz oscillator, CJ2324 MOSFET driving a piezo transducer disc; Grove EN/NC/VCC/GND, EN high = mist). Use when designing, wiring, simulating or writing code for a Grove water atomizer / ultrasonic humidifier module in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Seeed Grove - Water Atomization (v1.0)

## Overview
An **ultrasonic mist maker** driver board plus a piezo transducer disc. Hobbyists buy it as the **Seeed Studio Grove - Water Atomization v1.0, SKU 101020090** (driver board, Grove cable, transducer plate). Per the Seeed v1.0 Eagle schematic:
- **EN** goes through **1 kΩ** to the base of a **9013 NPN** transistor (47 kΩ pull-down on EN, 47 kΩ base pull-down). The transistor pulls the gate of an **NCE3407A P-MOSFET** low, which connects the Grove 5 V (VCC_5V) to the rest of the board.
- An **ETA1617** boost converter makes about **16 V** from 5 V.
- An **NE555** oscillator (~105 kHz) switches a **CJ2324** N-MOSFET. With the 330 µH inductor it rings the transducer at up to **65 ± 5 V peak**.
- **EN high = atomize. EN low or unconnected = the whole driver is unpowered.**

## Pinout (Grove connector J1, silkscreen GND/VCC/NC/EN)
| Pin | Wire | Function |
|---|---|---|
| EN | yellow | Enable: high = mist on, low/unconnected = off |
| NC | white | Not connected |
| VCC | red | 5.0 V supply (up to 2 W, about 400 mA) |
| GND | black | Ground |

The transducer plugs into a second 2-pin connector (J2) on the opposite edge, so wire the board with a Grove-to-jumper cable.

## Electrical limits
- VCC: 5.0 V DC (Seeed spec), ripple ≤ 100 mV at max power. 3.3 V is not enough (the NE555 needs 4.5 V or more).
- Power: up to 2 W, so about 400 mA at 5 V. That is too much for most boards' 5 V pin together with the board itself. Use a separate 5 V 1 A (or larger) supply, and join its GND to the board's GND.
- EN: 3.3 V or 5 V logic, about 2.6 mA at 3.3 V ((3.3 − 0.7 V) / 1 kΩ, plus 70 µA into the 47 kΩ pull-down).
- Transducer output: 105 ± 5 kHz, up to 65 ± 5 V peak. **Do not touch J2 or the transducer pins while it runs.** Inductor L2 gets hot.

## Interface details
- Plain digital output, no driver: `Pin(n, Pin.OUT, value=0)`, then `.value(1)` for mist and `.value(0)` to stop.
- Do not PWM EN. It switches the whole driver's power, including the boost converter and the 100 µF capacitor. To get less mist, run it in bursts of seconds instead.

## Wiring
- ESP32: EN → GPIO26, GND → GND, VCC → separate 5 V supply + (supply − to GND).
- Pico: EN → GP16, GND → GND, VCC → separate 5 V supply + (or VBUS with a 1 A+ USB supply and nothing else heavy).
- Raspberry Pi 4: EN → pin 11 (GPIO17), GND → pin 6, VCC → pin 2 (5 V) with a 3 A Pi supply.
- Transducer: lay the disc on wet tissue in a cup of water, hollow (bottom) side down, so the underside is wet and the top stays just above water.

## Using it
```python
from machine import Pin
import time
mist = Pin(26, Pin.OUT, value=0)  # EN
mist.value(1); time.sleep(10); mist.value(0)
```

## Gotchas
- Never run the transducer dry. Without water it overheats and can crack in seconds.
- The white wire (pin 2) is NC. The control signal is on the yellow wire (pin 1, EN).
- The output to the disc is up to 70 V AC. Keep fingers off J2 and the disc's leads.
- Brown-outs: if the microcontroller resets when the mist starts, the 5 V supply is too weak. Use a separate supply.

## Datasheet
Product wiki and specs https://wiki.seeedstudio.com/Grove-Water_Atomization/ ; schematic https://files.seeedstudio.com/wiki/Grove-Water_Atomization/res/Schematic_file_in_PDF.zip ; NE555 https://www.ti.com/lit/ds/symlink/ne555.pdf
