---
name: part-h206
description: Pinout, electrical limits, wiring and MicroPython driver for the H206 slotted speed sensor module (WYC-H206 photo-interrupter + LM393 comparator, digital pulse output for encoder wheels). Use when designing, wiring, simulating or writing code for an H206 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# H206 slotted speed sensor (H206 / LM393)

## Overview
The **H206 speed sensor** is the small green 3-pin board that comes with robot-car kits. A black **WYC-H206 slotted optocoupler** holds an IR LED facing a phototransistor across a ~6 mm slot, and an **LM393 comparator** turns its signal into a clean digital output. Put a slotted encoder disc (usually 20 slots) through the slot and you get one pulse per slot.
- **OUT goes HIGH while the slot is blocked**, LOW while it is clear (the OUT LED lights when clear)
- Supply: **3.3-5 V**
- Gives pulses only; speed (RPM) and distance come from counting them

## Pinout (3-pin header, as printed on the board)
| Pin | Name | Function |
|---|---|---|
| 1 | 5V | Supply, 3.3-5 V |
| 2 | GND | Ground |
| 3 | OUT | Digital output: 1 = slot blocked, 0 = clear |

## Electrical limits
- Supply 3.3-5 V (the LM393 itself accepts 2-36 V; the module's LED resistors are sized for 3.3-5 V).
- OUT is the LM393's open-collector output with a **10 kΩ pull-up to VCC**. Powered from 5 V, OUT swings to 5 V, which can damage an ESP32 or Pico GPIO. With a 3.3 V board power the module from 3V3.
- The LM393 sinks at least 6 mA at 1.5 V (TI datasheet); response time is about 1.3 µs, far faster than any wheel.
- Draws roughly 10-15 mA, mostly the IR LED and indicator LEDs.

## Interface details
Plain digital input, no protocol:
```
OUT = 1  -> a spoke is in the slot
OUT = 0  -> slot clear
RPM = pulses_per_second * 60 / slots_in_disc
```
Count rising edges with an interrupt. The board's comparator has no hysteresis, so a slow edge can produce extra pulses; the driver's `min_us` option ignores edges closer together than that.

## Wiring
| Module | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| 5V | 3V3 | 3V3(OUT) (pin 36) | 3V3 (pin 1) |
| GND | GND | GND | GND (pin 6) |
| OUT | GPIO25 | GP2 | GPIO17 (pin 11) |

## Using the driver
```python
from h206 import H206
import time
sensor = H206(25, slots=20)     # GPIO wired to OUT, slots in the disc
while True:
    print('pulses=%d slot=%s' % (sensor.count(), 'BLOCKED' if sensor.blocked() else 'clear'))
    print('rpm=%.0f' % sensor.rpm(1000))
```
`count()` returns blocked edges since start/`reset()`, `blocked()` the live slot state, `rpm(window_ms)` counts for a window and converts to wheel RPM. Pass `min_us=300` if counts look too high.

## Gotchas
- **Do not power from 5 V on a 3.3 V board**: OUT is pulled up to VCC.
- The header is printed **5V** but works at 3.3 V.
- Check polarity on your board with the OUT LED: it should light with the slot empty and go dark when you slide paper in. A few clones are inverted.
- Sunlight into the slot can stop it seeing spokes; keep the disc centred so it doesn't rub.
- Distance per pulse = wheel circumference / slots (e.g. 66 mm wheel, 20 slots: about 10.4 mm per pulse).

## Datasheet
No formal datasheet exists for the module; comparator datasheet: https://www.ti.com/lit/ds/symlink/lm393.pdf
Pin order: board photo (silkscreen 5V, GND, OUT) in https://www.electronicshub.org/interfacing-lm393-speed-sensor-with-arduino/
