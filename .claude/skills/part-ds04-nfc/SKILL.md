---
name: part-ds04-nfc
description: Pinout, electrical limits, wiring and MicroPython driver for the DS04-NFC 360° continuous-rotation servo (Luxorparts / Kjell & Company 90770). Use when designing, wiring, simulating or writing code for a DS04-NFC in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# DS04-NFC continuous-rotation servo

## Overview
The **DS04-NFC** is a standard-size (40.5 × 20 mm, 38 g) servo built for continuous 360° rotation. The control pulse sets **speed and direction**, not an angle. At 4.8 V it gives 5.5 kg·cm of torque and about 45 RPM (0.22 s/60°), and the datasheet says speed is roughly linear with the pulse. It is sold as a bare servo with a 290 mm 3-wire lead ending in a JR/Futaba 2.54 mm female plug (Luxorparts DS04-NFC, Kjell & Company item 90770). Horns and screws are included.

## Pinout (3-wire lead, connector order)
| Pin | Wire | Function |
|---|---|---|
| GND | Black (−) | Ground |
| V+ | Red (+) | Supply, 4.8–6 V |
| SIG | White | Control pulse, 50 Hz |

Some clones use brown/red/orange wires in the same order.

## Electrical limits
- Supply: 4.8–6 V. Do not run it from 3.3 V.
- Current: less than 1000 mA, which is the datasheet's maximum (it reaches about 1 A when stalled at 4.8 V).
- Signal: 3.3 V logic from an ESP32 or Pico works.

## Interface details (datasheet)
- The servo expects a 50 Hz frame (20 ms period).
- 1.5 ms means **stop**.
- 1.0–1.5 ms turns it **counter-clockwise** ("full reverse" at 1.0 ms).
- 1.5–2.0 ms turns it **clockwise** ("full forward" at 2.0 ms).
- The datasheet gives no dead band. The simulator assumes a narrow ±10 µs band around 1.5 ms.
- Driver: `speed(pct)` takes pct from -100 to 100. Positive values turn it clockwise: pulse = 1500 + 5 × pct µs. duty_u16 = pulse_us × 65535 / 20000.

## Wiring
- ESP32: V+ → external 5–6 V supply (1 A), GND → GND (shared with the supply), SIG → D13.
- Pico: V+ → external 5–6 V supply, GND → GND (shared), SIG → GP15.
- Raspberry Pi 4: V+ → external 5 V supply, GND → pin 6 (shared with the supply ground), SIG → pin 12 (GPIO18).

## Using the driver
```python
from ds04_nfc import DS04NFC
import time
wheel = DS04NFC(13)
wheel.cw(50)     # clockwise, half speed (1750 us)
time.sleep(2)
wheel.ccw(100)   # counter-clockwise, full speed (1000 us)
time.sleep(2)
wheel.stop()     # 1500 us
```

## Gotchas
- The datasheet's direction is the reverse of FS90R and SG90-360 servos: here shorter pulses turn it counter-clockwise.
- The vendor notes the axis has a slight offset. If it creeps at 1.5 ms, pass `stop_us=` a few µs different. It cannot hold a position.
- Up to 1 A per servo can reset a USB-powered board, so use its own supply and a 470–1000 µF capacitor across V+/GND.
- `off()` stops the pulses completely.

## Datasheet
https://www.kjell.com/globalassets/mediaassets/701903_90770_datasheet_en.pdf
