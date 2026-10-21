---
name: part-g3mb-202p
description: Pinout, electrical limits, wiring and MicroPython code for the G3MB-202P solid state relay module (Omron G3MB-202P). Use when designing, wiring, simulating or writing code for a G3MB-202P SSR in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# G3MB-202P solid state relay module (G3MB-202P)

## Overview
The **Omron G3MB-202P** is a small solid state relay: a phototriac with zero-cross switching, a built-in input resistor and snubber. It switches **AC loads only**, 0.1–2 A at 75–264 VAC, silently and without contact wear. Hobbyists buy it on a **1-channel 5 V G3MB-202P SSR module, high level trigger, with resistive fuse**: a 3-pin input header and a 2-way screw terminal for the load.

## Pinout (1-channel high level trigger module, input header order)
| Pin | Function |
|---|---|
| DC+ | Module supply, 5 V |
| DC- | Ground (share with the microcontroller) |
| CH1 | Control input: high (3–5 V) = on, low (< 0.5 V) = off |

Output screw terminal (mains side): **A1 / B1**, the SSR's switched contact, wired in series with the load's live wire.

## Electrical limits
- SSR input (5 VDC version): operating range 4–6 VDC, input impedance 440 Ω ±20 %. Module: supply 5 V, about 12.5 mA per channel on, CH1 trigger current about 2 mA.
- Output: 100–240 VAC rated (75–264 VAC range), 0.1–2 A, surge 30 A for one 60 Hz cycle.
- Operate / release time: 1/2 mains cycle + 1 ms max (zero-cross).
- Input has no reverse-polarity protection: get DC+ / DC- the right way round.

## Interface details
- A plain digital input: drive CH1 high to switch the load on, low to switch it off. No driver needed, just `machine.Pin`.
- Zero-cross: the change takes effect at the next mains zero crossing, so it cannot dim lamps or follow PWM.

## Wiring
- ESP32: DC+ → 5V (VIN), DC- → GND, CH1 → D25.
- Pico: DC+ → VBUS (5 V from USB), DC- → GND, CH1 → GP2.
- Raspberry Pi 4: DC+ → pin 2 (5 V), DC- → pin 6, CH1 → pin 22 (GPIO25).
- Load: mains live → A1, B1 → load → mains neutral. Mains work only by an adult or qualified person, in a closed insulated enclosure.

## Using it
```python
from machine import Pin
import time
ssr = Pin(25, Pin.OUT, value=0)  # CH1
ssr.value(1)   # load on
time.sleep(2)
ssr.value(0)   # load off
```

## Gotchas
- **AC only.** On a DC load the triac latches on and never turns off.
- Loads under 0.1 A (small LED bulbs, phone chargers) may glow or not switch off: the snubber leaks a little current.
- Low level trigger modules with the same DC+/DC-/CH1 labels exist; their logic is inverted and a 3.3 V GPIO may not turn them fully off. Check the listing or silkscreen.
- Without a load connected, a multimeter on A1/B1 shows nothing useful: an SSR needs AC across it to switch.
- It warms up near 2 A; halve the load when several are mounted together or ventilation is poor.

## Datasheet
https://people.ece.cornell.edu/land/courses/ece4760/FinalProjects/s2004/daw33/RemoteOutlet/datasheets/D20G3MB0503.pdf
