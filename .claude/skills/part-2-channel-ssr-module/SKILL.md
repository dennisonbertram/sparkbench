---
name: part-2-channel-ssr-module
description: Pinout, electrical limits, wiring and MicroPython code for the 2-channel 5 V solid state relay module, low level trigger (2x Omron G3MB-202P, DC+/DC-/CH1/CH2). Use when designing, wiring, simulating or writing code for a 2-channel SSR module in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# 2-channel SSR module, low level trigger (G3MB-202P x2)

## Overview
Two **Omron G3MB-202P** solid state relays on one board. Each is a phototriac with zero-cross switching, a built-in input resistor and a snubber. Each channel also has a 2 A resistive fuse and a status LED. The relays switch **AC loads only**, 0.1–2 A at 75–264 VAC, silently and without contact wear. Hobbyists buy it as the **2 Channel 5V SSR G3MB-202P Solid State Relay Module 240V 2A Output with Resistive Fuse, low level trigger**. This is the black "2 Solid State Relay" board (HCMODU0115). It has a 4-way input terminal on one edge and a 2-way screw terminal per channel on the opposite edge.

The inputs are **low level trigger** (active low): CH low = SSR on.

## Pinout (input terminal order)
| Pin | Function |
|---|---|
| DC+ | Module supply, 5 V |
| DC- | Ground (share with the microcontroller) |
| CH1 | SSR 1 control: low (0–0.5 V) = on, high (3.3–5 V) = off |
| CH2 | SSR 2 control: low (0–0.5 V) = on, high (3.3–5 V) = off |

Output screw terminals (mains side): one 2-way terminal per channel. Each is the SSR's switched contact and goes in series with that load's live wire.

## Electrical limits
- SSR input (5 VDC version): operating range 4–6 VDC, input impedance 440 Ω ±20 %, must-drop voltage 1 V. Module: supply 5 V, about 22.5 mA with both channels on (vendor), trigger current about 2 mA per channel, 0 mA quiescent.
- Vendor input thresholds: 0–0.5 V = on, 0.5–3.3 V = undefined, 3.3–5 V = off.
- Output: 100–240 VAC rated (75–264 VAC range), 0.1–2 A per channel, surge 30 A for one 60 Hz cycle. Leakage when off: up to 1 mA at 100 VAC, 1.5 mA at 200 VAC.
- Operate and release time: 1/2 mains cycle + 1 ms max (zero-cross).
- The SSR input has no reverse-polarity protection, so connect DC+ and DC- the right way round.

## Interface details
- Plain digital inputs, so no driver is needed, just `machine.Pin`. CH1 and CH2 are independent.
- Active low: `value(0)` = SSR on, `value(1)` = off. Always create the pins with `value=1`.
- Zero-cross: each change takes effect at the next mains zero crossing. The module cannot dim lamps or follow PWM.

## Wiring
- ESP32: DC+ → 5V (VIN), DC- → GND, CH1 → D25, CH2 → D26.
- Pico: DC+ → VBUS (5 V from USB), DC- → GND, CH1 → GP2, CH2 → GP3.
- Raspberry Pi 4: DC+ → pin 2 (5 V), DC- → pin 6, CH1 → pin 11 (GPIO17), CH2 → pin 13 (GPIO27).
- Loads: mains live → one terminal of channel N, other terminal → load N → mains neutral. Mains work must be done only by an adult or qualified person, inside a closed insulated enclosure.
- The input side is a screw terminal, so use jumper leads. The board does not plug into a breadboard.

## Using it
```python
from machine import Pin
import time
ch1 = Pin(25, Pin.OUT, value=1)  # value=1 = off
ch2 = Pin(26, Pin.OUT, value=1)
ch1.value(0)   # load 1 on
time.sleep(2)
ch1.value(1)   # load 1 off
```

## Gotchas
- **Active low.** A GPIO that is low at boot, or set up without `value=1`, switches its load on.
- **3.3 V boards:** a 3.3 V high sits at the very edge of the "off" band, so it usually works. If a load stays on or glows, drive each CH through an NPN transistor: GPIO → 1 kΩ → base, emitter → GND, collector → CH. The logic then inverts (GPIO high = on).
- **AC only.** On a DC load the triac latches on and never turns off.
- Loads under 0.1 A (small LED bulbs, phone chargers) may glow or not switch off, because the snubber leaks a little current.
- Without AC across the output, a multimeter on the output terminals shows nothing useful.
- Halve the load current when the board is hot or poorly ventilated (Omron derating).

## Datasheet
https://people.ece.cornell.edu/land/courses/ece4760/FinalProjects/s2004/daw33/RemoteOutlet/datasheets/D20G3MB0503.pdf
