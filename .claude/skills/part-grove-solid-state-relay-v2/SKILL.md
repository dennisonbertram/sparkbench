---
name: part-grove-solid-state-relay-v2
description: Pinout, electrical limits, wiring and MicroPython code for the Seeed Grove - Solid State Relay V2 (SKU 103020137; Omron G3MC-202P zero-cross SSR, 2 A at 100-240 VAC, BC817 low-side driver, Grove CTR/NC/VCC/GND, active-high, VCC 5 V). Use when designing, wiring, simulating or writing code for a Grove solid state relay in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Seeed Grove - Solid State Relay V2

## Overview
A single **Omron G3MC-202P** solid state relay (phototriac output, zero-cross, snubber, 5 VDC input, 2 A at 100-240 VAC) on a Grove board. The SSR input (INT+) sits on VCC through a 0 Ω link and its INT- is switched to GND by a **BC817** NPN transistor. CTR drives the base through 2.2 kΩ with a 10 kΩ pull-down, so a floating CTR keeps the SSR off. A red LED (1 kΩ from VCC) lights when the SSR is on. **CTR high = SSR on.** Hobbyists buy it as **Seeed Grove - Solid State Relay V2, SKU 103020137**.

## Pinout (Grove connector J2, schematic order)
| Pin | Wire | Function |
|---|---|---|
| CTR | yellow | Control input, high = SSR on |
| NC | white | Not connected |
| VCC | red | Supply 5 V (4-6 V) |
| GND | black | Ground |

Load side: 2-way push terminal **LOAD1 / LOAD2** ("SW") on the opposite edge, so the module is wired with a Grove-to-jumper cable, not plugged into the breadboard.

## Electrical limits
- VCC 4-6 V, 5 V nominal (Seeed spec; G3MC-202P 5 VDC input: operating 4-6 VDC, must operate 4 V max, must release 1 V min, input impedance 300 Ω ±20 %). **Do not power it from 3.3 V**: the SSR input then sees less than its 4 V must-operate level. About 17-21 mA SSR input + 3 mA LED = up to ~25 mA while on.
- CTR: 3.3 V or 5 V logic. With 3.3 V, about 1.1 mA base current into the BC817-40 (hFE >= 250), plenty for ~25 mA collector current.
- Load: AC only, 75-264 VAC 50/60 Hz, 0.1-2 A (2 A at 25 °C, derate with temperature: about 1 A at 40 °C per the Omron curve). Inrush 30 A for one cycle. ON voltage drop 1.6 V RMS max.
- Off-state leakage 1.5 mA max at 200 VAC (snubber), enough to make small LED lamps glow.
- Operate / release time: 1/2 mains cycle + 1 ms max (zero-cross switching).

## Interface details
- Plain digital input: no driver, just `machine.Pin`.
- Active high, with an on-board pull-down: the SSR stays off while the microcontroller boots.

## Wiring
- ESP32: CTR -> GPIO26, VCC -> 5V (VIN), GND -> GND.
- Pico: CTR -> GP16, VCC -> VBUS (5 V from USB), GND -> GND.
- Raspberry Pi 4: CTR -> pin 11 (GPIO17), VCC -> pin 2 (5 V), GND -> pin 6.
- Load: cut the live wire of the AC load and put LOAD1 / LOAD2 in series with it. Mains only by an adult or qualified person, in a closed insulated enclosure.

## Using it
```python
from machine import Pin
import time
ssr = Pin(26, Pin.OUT, value=0)  # CTR
ssr.value(1)   # load on
time.sleep(2)
ssr.value(0)   # load off (at the next zero crossing)
```

## Gotchas
- AC loads only: a triac never turns off on DC, so a DC load stays on once triggered.
- Loads under 0.1 A (small LED bulbs, phone chargers) may glow or not switch off because of the 1.5 mA leakage current.
- Zero-cross SSR: it cannot dim a lamp (no phase control) and is too slow for PWM.
- VCC must be 5 V even on a 3.3 V microcontroller; CTR at 3.3 V logic is fine.
- The SSR heats up with load current: derate above 25 °C and keep it ventilated.

## Datasheet
https://files.seeedstudio.com/wiki/Grove-Solid_State_Relay_V2/res/G3MC202p.pdf (Omron G3MC); schematic in https://files.seeedstudio.com/wiki/Grove-Solid_State_Relay_V2/res/Grove-Solid_State_Relay_V2_Eagle.zip
