---
name: part-grove-pir-motion-sensor
description: Pinout, electrical limits, wiring and MicroPython driver for the Seeed Grove - PIR Motion Sensor v1.2 (SKU 101020020; BISS0001-type PIR controller with XC6206 3.3 V regulator, Grove SIG/NC/VCC/GND, active-high output). Use when designing, wiring, simulating or writing code for a Grove PIR motion sensor in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Seeed Grove - PIR Motion Sensor (v1.2, BISS0001)

## Overview
The **Grove - PIR Motion Sensor** (Seeed SKU 101020020) is a 20 x 40 mm Grove board with a white Fresnel dome over an **LHI778** pyroelectric element, a **BISS0001**-type PIR controller (the v1.2 schematic fits the pin-compatible TM2291) and an **XC6206P332** 3.3 V LDO.
- **SIG goes high (about 3.3 V) when a warm body moves** in front, low otherwise (active high)
- Hold time Tx is set by R14 = 10 kΩ and C1 = 10 nF: about 2.5 s by the BISS0001 formula (Tx ≈ 24576·R·C; Seeed's note gives 40000·R·C ≈ 4 s). Seeed quotes 1-25 s when the optional pot R6 is fitted.
- Trigger-inhibit time after each pulse Ti ≈ 24 × 4.7 MΩ × 10 nF ≈ 1.1 s
- Jumper **J2**: non-retriggerable (default, A to GND) or retriggerable (A to VCC, hold restarts while motion continues)
- Range 0.1-6 m (3 m default), 120° cone, wavelength 7-14 µm

## Pinout (Grove connector J3)
| Pin | Wire | Name | Function |
|---|---|---|---|
| 1 | yellow | SIG | Motion output: ~3.3 V through 10 kΩ while triggered, 0 V otherwise |
| 2 | white | NC | Not connected |
| 3 | red | VCC | Supply 3-5 V |
| 4 | black | GND | Ground |

## Electrical limits
- VCC 3-5 V (Seeed wiki); about 100 µA at 3 V, 150 µA at 5 V.
- The BISS0001 runs from the on-board 3.3 V LDO (absolute max supply 5 V for the chip), so SIG is never above 3.3 V: safe for 3.3 V GPIOs even with VCC = 5 V.
- SIG has a 10 kΩ series resistor: drive a high-impedance input only, not an LED.
- Operating temperature -20 to +70 °C (BISS0001).

## Interface details
Plain digital output, active high, no pull resistor needed:
```
SIG = 1  -> motion (held Tx, ~2.5-4 s)
SIG = 0  -> no motion (new triggers ignored for ~1 s after each pulse)
```

## Wiring
| Module | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| SIG (yellow) | GPIO25 | GP2 | GPIO17 (pin 11) |
| NC (white) | - | - | - |
| VCC (red) | 3V3 or 5V | 3V3(OUT) or VBUS | 3.3 V (pin 1) or 5 V (pin 2) |
| GND (black) | GND | GND | GND (pin 6) |

The board has a 2 mm Grove socket: use a Grove-to-female-jumper cable to reach a breadboard.

## Using the driver
```python
from grove_pir import GrovePIR
import time
pir = GrovePIR(25)            # GPIO wired to SIG
while True:
    print('MOTION=%d' % pir.motion())
    time.sleep(0.5)
```
`motion()` returns True while SIG is high; `on_change(handler)` calls `handler(True/False)` on each edge.

## Gotchas
- **Warm-up**: readings during the first minute after power-up are unreliable.
- In the default non-retriggerable mode, continuous motion gives repeated ~3 s pulses with ~1 s gaps, not one long high: count rising edges or latch in software.
- It senses **moving** warm bodies only; it does not see through glass. Heaters, sun and air drafts cause false triggers.
- The 10 kΩ series resistor means SIG cannot drive an LED or relay directly.
- Not the same as the **Grove - Digital PIR Sensor** or Grove mini PIR (different boards).

## Datasheet
BISS0001: https://files.seeedstudio.com/wiki/Grove_PIR_Motion_Sensor/resources/Twig_-_BISS0001.pdf
Schematic v1.2: https://files.seeedstudio.com/wiki/Grove_PIR_Motion_Sensor/resources/Grove_PIR_Sensor_v1.2.pdf
Wiki (pin colours, specs): https://wiki.seeedstudio.com/Grove-PIR_Motion_Sensor/
