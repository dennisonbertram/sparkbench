---
name: part-ld2410
description: Pinout, electrical limits, wiring and MicroPython driver for the HLK-LD2410C 24 GHz mmWave human presence radar (LD2410), read through its OUT pin. Use when designing, wiring, simulating or writing code for an LD2410 / LD2410C in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# HLK-LD2410C human presence radar (LD2410)

## Overview
The **HLK-LD2410C** from Hi-Link is a 24 GHz FMCW millimetre-wave radar that detects people, both **moving and still** (sitting, lying, breathing), which a PIR sensor cannot. It reports presence on a plain digital **OUT** pin (high = someone there) and, optionally, detailed target/distance data over a UART. Hobbyists buy it as the **HLK-LD2410C module**: a 16 x 22 mm blue board with a 5-pin 2.54 mm header (some sellers ship the holes unpopulated, so you may need to solder the header).

## Pinout (HLK-LD2410C, header order, labels as printed)
| Pin | Label | Function |
|---|---|---|
| 1 | TX | UART output from the module (256000 baud, 3.3 V), optional |
| 2 | RX | UART input to the module (configuration commands), optional |
| 3 | OUT | Target state: HIGH (3.3 V) when a human is present, LOW when not |
| 4 | GND | Ground |
| 5 | VCC | Supply 5-12 V (5 V recommended) |

## Electrical limits
- Supply: 5-12 V, 5 V recommended. The supply must be able to deliver **more than 200 mA**; average current is about 79 mA. 3.3 V is too low: use the 5 V / VBUS pin.
- IO level is **3.3 V**, so OUT, TX and RX connect directly to ESP32 / Pico GPIOs.
- Detection range 0.75-6 m (in 0.75 m distance gates), +/-60 degrees, -40 to 85 C.

## Interface details
- OUT: active high, push-pull, no pull-up needed. `1` = person present, `0` = nobody.
- After the person leaves, OUT stays high for the **no-one duration** (factory default **5 s**) before going low; any detection in that time restarts it.
- Factory defaults: max motion and rest distance gate 8, per-gate sensitivities set, UART 256000 baud, 8N1.
- Range, sensitivity and the no-one duration are changed over the UART (frames start FD FC FB FA, end 04 03 02 01) or with Hi-Link's PC tool / HLKRadarTool Bluetooth app. Basic use needs only OUT.

## Wiring
- ESP32: VCC -> 5V (VIN), GND -> GND, OUT -> GPIO4. TX/RX optional (GPIO16/17, UART2).
- Pico: VCC -> VBUS (5 V), GND -> GND, OUT -> GP15. TX/RX optional (GP1/GP0, UART0).
- Raspberry Pi 4: VCC -> pin 2 (5 V), GND -> pin 6, OUT -> GPIO17 (pin 11).

## Using the driver
```python
from ld2410 import LD2410
import time
radar = LD2410(4)        # GPIO wired to OUT
while True:
    print('PRESENCE=%d' % radar.present())
    time.sleep(0.5)
```
`radar.irq(handler)` calls `handler(pin)` when someone arrives (rising edge); `on_arrive=False` fires when the room has been empty for the no-one duration.

## Gotchas
- OUT stays high for 5 s (default) after the room empties: that is the no-one delay, not a fault.
- It senses through plastic and thin walls; fans, curtains moving or a vibrating mount can trigger it. Reduce the far gates' sensitivity if it sees people in the next room.
- Weak USB supplies brown out: the datasheet asks for a supply rated over 200 mA.
- Keep metal away from the antenna side (the side with the gold patches).
- The original LD2410 / LD2410B use 1.27 mm pin pitch; this is the 2.54 mm LD2410C. The OUT behaviour is the same.

## Datasheet
https://www.sudo.is/docs/esphome/components/ld2410/HLK-LD2410C_manual_v1.00.pdf
