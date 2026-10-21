---
name: part-ld2420
description: Pinout, electrical limits, wiring and MicroPython driver for the HLK-LD2420 24 GHz mmWave human presence radar (Hi-Link LD2420), read through its OT2 pin. Use when designing, wiring, simulating or writing code for an LD2420 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# HLK-LD2420 human presence radar (LD2420)

## Overview
The **HLK-LD2420** from Hi-Link is a 24 GHz FMCW millimetre-wave radar that senses **moving and micro-moving** (sitting, breathing) people up to about 8 m, which a PIR sensor cannot. It reports presence on a plain digital **OT2** pin (high = occupied) and, optionally, results and configuration over a UART (OT1 = TX, RX). Hobbyists buy it as the **HLK-LD2420 module**: a 20 x 20 mm board with a 5-hole 2.54 mm header J2 that ships **without pins**, so you solder a header on.

## Pinout (HLK-LD2420 J2, header order, labels as printed)
| Pin | Label | Function |
|---|---|---|
| 1 | 3V3 | Supply 3.0-3.6 V (3.3 V typ.) |
| 2 | GND | Ground |
| 3 | OT1 | UART TX from the module (115200 baud, 3.3 V), optional |
| 4 | RX | UART RX into the module (configuration), optional |
| 5 | OT2 | Detection status: HIGH when occupied, LOW when unoccupied |

(The 4-pin J1 header GND/DIO/CLK/3V3 is the SWD programming port; leave it unconnected.)

## Electrical limits
- Supply: **3.0-3.6 V**, 3.3 V typical, about 50 mA average. **Do not feed it 5 V**: use the board's 3V3 pin.
- All IO is 0-3.3 V, so OT2, OT1 and RX connect directly to ESP32 / Pico GPIOs. A 5 V Arduino needs level shifting on RX.
- Detection: moving person up to 8 m (wall mount) / 5 m (ceiling), micro-motion 6 m / 4 m, +/-60 degrees, 10 Hz refresh, -40 to 85 C.

## Interface details
- OT2: active high, 3.3 V logic, no pull-up needed. `1` = occupied, `0` = unoccupied.
- After the area empties, OT2 stays high for the **target disappearance delay** (configurable, 0-65535, in HLK-LD2420_TOOL); a detection within that time restarts the timer.
- UART: 115200 baud 8N1 per the manual (some early firmware used 256000). Min/max distance gates (0-15, 0.7 m each), trigger and maintain thresholds and the delay are set with Hi-Link's HLK-LD2420_TOOL over this UART. Basic use needs only OT2.

## Wiring
- ESP32: 3V3 -> 3V3, GND -> GND, OT2 -> GPIO4. OT1/RX optional (OT1 -> GPIO16 RX2, RX -> GPIO17 TX2).
- Pico: 3V3 -> 3V3(OUT), GND -> GND, OT2 -> GP15. OT1/RX optional (OT1 -> GP1, RX -> GP0, UART0).
- Raspberry Pi 4: 3V3 -> pin 1, GND -> pin 6, OT2 -> GPIO17 (pin 11).

## Using the driver
```python
from ld2420 import LD2420
import time
radar = LD2420(4)        # GPIO wired to OT2
while True:
    print('PRESENCE=%d' % radar.present())
    time.sleep(0.5)
```
`radar.irq(handler)` calls `handler(pin)` when someone arrives (rising edge); `on_arrive=False` fires when the area has been empty for the disappearance delay.

## Gotchas
- It is a **3.3 V part**, unlike the 5 V LD2410: 5 V on 3V3 or RX can destroy it.
- OT1 is the UART **TX**, not a second presence output; OT2 is the presence pin.
- OT2 staying high after you leave is the disappearance delay, not a fault.
- Radar sees through plastic and thin walls; fans, swaying curtains, plants in a draught or a shaky mount trigger it. Shield the back side with metal if things move behind it.
- Keep several 24 GHz radars from pointing straight at each other.

## Datasheet
https://www.elemon.com.ar/images/productos/hojas-de-datos/radar-modulos/hlk-ld2420.pdf
