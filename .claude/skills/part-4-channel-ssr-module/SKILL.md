---
name: part-4-channel-ssr-module
description: Pinout, electrical limits, wiring and MicroPython code for the 4-channel 5 V solid state relay module, low level trigger (4x Omron G3MB-202P, DC+/DC-/CH1-CH4). Use when designing, wiring, simulating or writing code for a 4-channel SSR module in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# 4-channel SSR module, low level trigger (G3MB-202P x4)

## Overview
Four **Omron G3MB-202P** solid state relays on one board. Each is a phototriac with zero-cross switching, a built-in input resistor and a snubber. Each channel also has a 2 A resistive fuse and a status LED. The relays switch **AC loads only**, 0.1–2 A at 75–264 VAC, silently and without contact wear. Hobbyists buy it as the **5V 4 Channel SSR G3MB-202P Solid State Relay Module 240V 2A Output with Resistive Fuse, low level trigger**. It has a 6-way input header on one edge and a 2-way screw terminal per channel on the opposite edge.

The inputs are **low level trigger** (active low): CH low = SSR on. A high-level-trigger version that looks the same is also sold, so check the listing or silkscreen.

## Pinout (input header order)
| Pin | Function |
|---|---|
| DC+ | Module supply, 5 V |
| DC- | Ground (share with the microcontroller) |
| CH1 | SSR 1 control: low (0–0.5 V) = on, high (3.3–5 V) = off |
| CH2 | SSR 2 control: low = on, high = off |
| CH3 | SSR 3 control: low = on, high = off |
| CH4 | SSR 4 control: low = on, high = off |

Output screw terminals (mains side): one 2-way terminal per channel. Each is the SSR's switched contact and goes in series with that load's live wire.

## Electrical limits
- SSR input (5 VDC version): operating range 4–6 VDC, input impedance 440 Ω ±20 %, must-drop voltage 1 V. Module: supply 5 V, about 11–12.5 mA per SSR that is on plus its LED (about 60 mA with all four on), trigger current about 2 mA per channel.
- Vendor input thresholds: 0–0.5 V = on, 3.3–5 V = off (some listings quote 0–2.5 V as the trigger range).
- Output: 100–240 VAC rated (75–264 VAC range), 0.1–2 A per channel, surge 30 A for one 60 Hz cycle. Leakage when off: up to 1 mA at 100 VAC, 1.5 mA at 200 VAC.
- Operate and release time: 1/2 mains cycle + 1 ms max (zero-cross).
- The SSR input has no reverse-polarity protection, so connect DC+ and DC- the right way round.

## Interface details
- Plain digital inputs, so no driver is needed, just `machine.Pin`. The four channels are independent.
- Active low: `value(0)` = SSR on, `value(1)` = off. Always create the pins with `value=1`.
- Zero-cross: each change takes effect at the next mains zero crossing. The module cannot dim lamps or follow PWM.

## Wiring
- ESP32: DC+ → 5V (VIN), DC- → GND, CH1 → D25, CH2 → D26, CH3 → D27, CH4 → D13.
- Pico: DC+ → VBUS (5 V from USB), DC- → GND, CH1 → GP2, CH2 → GP3, CH3 → GP4, CH4 → GP5.
- Raspberry Pi 4: DC+ → pin 2 (5 V), DC- → pin 6, CH1 → pin 11 (GPIO17), CH2 → pin 13 (GPIO27), CH3 → pin 15 (GPIO22), CH4 → pin 16 (GPIO23).
- Loads: mains live → one terminal of channel N, other terminal → load N → mains neutral. Mains work must be done only by an adult or qualified person, inside a closed insulated enclosure.
- The input header and the mains terminals are on opposite edges, so use jumper leads. The board does not plug into a breadboard.

## Using it
```python
from machine import Pin
import time
ssr = [Pin(n, Pin.OUT, value=1) for n in (25, 26, 27, 13)]  # value=1 = off
ssr[0].value(0)   # load 1 on
time.sleep(2)
ssr[0].value(1)   # load 1 off
```

## Gotchas
- **Active low.** A GPIO that is low at boot, or set up without `value=1`, switches its load on.
- **3.3 V boards:** a 3.3 V high sits at the very edge of the "off" band, so it usually works. If a load stays on or glows, drive each CH through an NPN transistor: GPIO → 1 kΩ → base, emitter → GND, collector → CH. The logic then inverts (GPIO high = on).
- **AC only.** On a DC load the triac latches on and never turns off.
- Loads under 0.1 A (small LED bulbs, phone chargers) may glow or not switch off, because the snubber leaks a little current.
- Halve the load current when the board is hot or poorly ventilated (Omron derating); four SSRs side by side heat each other.

## Datasheet
https://people.ece.cornell.edu/land/courses/ece4760/FinalProjects/s2004/daw33/RemoteOutlet/datasheets/D20G3MB0503.pdf
