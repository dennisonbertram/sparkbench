---
name: part-a3144
description: Pinout, electrical limits, wiring and MicroPython driver for the KY-003 Hall magnetic sensor module (Allegro-type A3144 unipolar Hall-effect switch). Use when designing, wiring, simulating or writing code for an A3144 / KY-003 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# A3144 Hall-effect switch module (A3144)

## Overview
The **A3144** is a unipolar Hall-effect switch: when the **south pole** of a magnet comes close to its branded (printed) face, its open-collector output switches **low**; take the magnet away and it lets go. It has a built-in Schmitt trigger (about 55 G hysteresis), so the output is clean on/off. Hobbyists buy it as the **KY-003 Hall magnetic sensor module** (Joy-IT SEN-KY003HMS / Keyes 37-in-1 kit board, 30 x 15 mm, black PCB, A3144 in TO-92 plus a status LED that lights when a magnet is detected).

## Pinout (KY-003 module, header order, labels as printed)
| Pin | Function |
|---|---|
| - | Ground |
| (middle, VCC) | Supply, 4.5-24 V (use 5 V) |
| S | Signal: open-collector output, LOW when a magnet is detected |

## Electrical limits
- Supply: **4.5-24 V** (A3144 datasheet; absolute max 28 V). 3.3 V is below the minimum: power the module from **5 V**.
- Supply current: 4.4 mA typical, 9 mA max (output off), plus the LED while a magnet is present.
- Output: open-collector NPN, sinks up to 25 mA, saturation 175 mV typical at 20 mA. Output OFF voltage up to 28 V.
- Magnetic switch points (A3144, 25 C): operate BOP 70-350 G, release BRP 50-330 G, hysteresis 20 G min / 55 G typ.
- Operating temperature: -40 to +85 C (E suffix).

## Interface details
- Plain digital output, no protocol. Active low: `0` = magnet, `1` = no magnet.
- The output **needs a pull-up**. Use the microcontroller's internal pull-up (`Pin.PULL_UP`, to 3.3 V). Joy-IT suggests an external 10 kOhm pull-up "to 5 V" for Arduino: **do not** do that on an ESP32 or Pico, it would put 5 V on the GPIO. If you want an external resistor, use 10 kOhm from S to **3.3 V**.
- Only the south pole facing the printed face switches it (unipolar). The north pole does nothing.
- Switching is fast (rise 0.04 us, fall 0.18 us typical), so it works for RPM counting with interrupts.

## Wiring
- ESP32: - -> GND, middle -> 5V (VIN), S -> GPIO4 (internal pull-up on).
- Pico: - -> GND, middle -> VBUS (5 V), S -> GP15 (internal pull-up on).
- Raspberry Pi 4: - -> pin 6, middle -> pin 2 (5 V), S -> GPIO17 (pin 11) with the internal pull-up to 3.3 V.

## Using the driver
```python
from a3144 import A3144
import time
hall = A3144(4)          # GPIO wired to S, internal pull-up enabled
while True:
    print('MAGNET=%d' % hall.detected())
    time.sleep(0.2)
```
`hall.irq(handler)` calls `handler(pin)` each time a magnet arrives (falling edge), handy for counting wheel turns.

## Gotchas
- Nothing happens? Flip the magnet: only the south pole works, and only on the printed face.
- Reads 0 all the time or floats randomly: the pull-up is missing (open-collector output).
- Never connect a pull-up from S to 5 V when S goes to a 3.3 V board.
- Running it at 3.3 V is outside the datasheet (min 4.5 V); some clones work, many are unreliable.
- A3144 is discontinued at Allegro; modules use clone chips (marked 3144, A3144E, AH3144) with the same pinout and behaviour.

## Datasheet
https://www.allegromicro.com/~/media/Files/Datasheets/A3141-2-3-4-Datasheet.ashx
