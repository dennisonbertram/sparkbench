---
name: part-grove-ir-distance-interrupter
description: Pinout, electrical limits, wiring and MicroPython driver for the Seeed Grove - IR Distance Interrupter v1.2 (SKU 101020040; Everlight ITR9909 reflective IR pair + LM393 comparator, Grove SIG/NC/VCC/GND, SIG low on reflection). Use when designing, wiring, simulating or writing code for a Grove IR distance interrupter / infrared reflective sensor in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Seeed Grove - IR Distance Interrupter v1.2

## Overview
An **Everlight ITR9909** (940 nm IR LED and NPN phototransistor side by side) on a Grove board with an **LM393** comparator, a sensitivity trimmer and a red indicator LED. When enough IR bounces back from an object or a light surface in front of the sensor, **SIG goes LOW and the LED lights**; with nothing there (or a dark surface) SIG stays **HIGH**. Used for object counting, optical encoders and line following. Hobbyists buy it as **Seeed Grove - IR Distance Interrupter v1.2, SKU 101020040**.

Note: the Seeed wiki prose says SIG goes HIGH on reflection, but the board schematic and Seeed's own Arduino and GrovePi examples (and comments) show **LOW = reflection detected**. The schematic is what the board does.

## Pinout (Grove connector J1, schematic order)
| Pin | Wire | Function |
|---|---|---|
| SIG | yellow | Digital output: 0 = reflection detected, 1 = nothing |
| NC | white | Not connected |
| VCC | red | Supply 3.3-5 V |
| GND | black | Ground |

The board has a 2 mm Grove socket: use a Grove-to-female-jumper cable to reach the breadboard.

## Board circuit (Seeed Eagle schematic)
- IR LED: anode to VCC, cathode through three 220 Ω resistors in parallel (about 73 Ω) to GND, always on.
- Phototransistor: collector to VCC, emitter through 2.7 MΩ to GND; that node feeds the LM393 **−** input.
- 10 kΩ trimmer between VCC and GND (1 nF on the wiper) sets the LM393 **+** input (threshold).
- LM393 open-collector output = **SIG**, 2.7 kΩ pull-up to VCC; the red LED (4.7 kΩ from VCC) is lit while SIG is low.

## Electrical limits
- Supply 3.3 V or 5 V (Seeed wiki). SIG is pulled up to VCC, so **power it from 3.3 V on an ESP32 or Pico**.
- Current: Seeed lists 20 mA max. From the schematic the IR LED alone takes about (VCC − 1.2 V) / 73 Ω ≈ 29 mA at 3.3 V and up to about 50 mA at 5 V (the ITR9909's absolute maximum), another reason to run it at 3.3 V.
- ITR9909: LED IF 50 mA max, VR 5 V; phototransistor VCEO 30 V, IC 50 mA; −25 to +85 °C; 15 µs rise/fall.
- Range: Seeed lists 7.5-40 cm effective distance. In practice detection depends strongly on the surface colour and the trimmer setting; light, matte surfaces at short range are the reliable case.

## Interface details
Plain digital input, no protocol:
```
SIG = 0 -> reflected IR above the threshold (object / white surface), LED on
SIG = 1 -> nothing detected (or a black surface), LED off
```
No internal pull-up needed (the board has 2.7 kΩ to VCC).

## Wiring
| Module | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| SIG | GPIO27 | GP15 | GPIO17 (pin 11) |
| NC | - | - | - |
| VCC | 3V3 | 3V3(OUT) (pin 36) | 3V3 (pin 1) |
| GND | GND | GND | GND (pin 6) |

## Using the driver
```python
from grove_ir_interrupter import GroveIRInterrupter
import time
sensor = GroveIRInterrupter(27)     # GPIO wired to SIG
while True:
    print('Object: %s' % ('yes' if sensor.detected() else 'no'))
    time.sleep(0.5)
```
`detected()` is True while IR is reflected back; `raw()` returns SIG; `irq(handler)` fires when an object appears (`on_detect=False` when it leaves).

## Gotchas
- **Adjust the trimmer**: hold a white surface in front and turn it until the LED just lights (clockwise = more sensitive).
- **Active low**: SIG low means "something there"; the wiki prose has it backwards.
- Bright light (sunlight, incandescent lamps) contains IR and can trigger or blind it.
- Black, matte objects reflect little IR and may not be detected at all.
- At 5 V SIG reaches 5 V: never wire it straight to a 3.3 V GPIO in that case.

## Datasheet
https://files.seeedstudio.com/wiki/Grove-IR_Distance_Interrupter_v1.2/res/ITR9909_datasheet.pdf (ITR9909); schematic https://files.seeedstudio.com/wiki/Grove-IR_Distance_Interrupter_v1.2/res/Eagle_files.zip; wiki https://wiki.seeedstudio.com/Grove-IR_Distance_Interrupter_v1.2/
