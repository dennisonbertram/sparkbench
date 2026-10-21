---
name: part-led-bar-graph-10
description: Pinout, electrical limits, wiring and MicroPython helper for the 10-segment LED bar graph (Kingbright DC10EWA, DIP-20) with a bussed resistor network. Use when designing, wiring, simulating or writing code for an LED bar graph in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# 10-segment LED bar graph with resistor network (DC10EWA)

## Overview
The **Kingbright DC10EWA** is ten separate high-efficiency red LEDs (627 nm) in one DIP-20 block, the classic "LED bar graph" sold by SparkFun, Adafruit and kit makers. There is no chip: each segment is a plain LED with its own anode and cathode pin. Hobbyists pair it with an **11-pin bussed resistor network** (Bourns 4611X-101-331LF, 10 × 330 Ω with one common pin) on the cathode side, so ten GPIOs drive the ten segments and one wire goes to GND.

## Pinout (as modelled: 11 nets)
| Pin | Bar graph pin | Function |
|---|---|---|
| A1 | 1 (anode mark) | Anode of segment 1; cathode is pin 20 |
| A2 … A10 | 2 … 10 | Anode of segment n; cathode is pin 21 − n |
| GND | network pin 1 (dot) | Common bus of the resistor network → GND |

Bar graph DIP-20: pins 1–10 along the marked side are anodes, pins 11–20 on the other side are cathodes, numbered so segment n = pins n and 21 − n (datasheet schematic).

## Electrical limits
- Forward voltage 1.9 V typ, 2.3 V max at 10 mA; DC forward current 30 mA max per segment; reverse voltage 5 V max; 75 mW per segment.
- With 330 Ω: about 4 mA per segment from 3.3 V (≈ 42 mA for all ten), about 9 mA from 5 V logic.
- Drive voltage 3.3–5 V. No supply pin.

## Wiring
- Bar graph across the breadboard centre gap, anodes towards the microcontroller. Network pins 2–11 on the cathode pins 20–11, network pin 1 to GND.
- ESP32: A1..A10 → any ten output GPIOs (e.g. 25, 26, 27, 13, 23, 19, 18, 17, 16, 4), GND → GND.
- Pico: A1..A10 → GP2, GP3, GP6–GP13, GND → GND.
- Raspberry Pi 4: ten GPIOs through the same resistors (3.3 V logic), GND → pin 6.

## Using the helper
```python
from bargraph import BarGraph
bar = BarGraph([25, 26, 27, 13, 23, 19, 18, 17, 16, 4])  # A1..A10
bar.level(6)        # segments 1-6 on
bar.dot(3)          # only segment 3
bar.show_value(1.65, 3.3)  # half-scale bar
```

## Gotchas
- Never connect a segment without its resistor: a GPIO straight into the LED far exceeds 30 mA.
- If nothing lights, the bar is probably in backwards: rotate it 180° (the anode mark is pin 1).
- A 9-pin bussed network only has 8 resistors; you need the 11-pin (10-resistor) version, or ten single 330 Ω resistors.
- Some no-name bar graphs are common-anode or have a different pin side; check with a coin cell before wiring.

## Datasheet
https://www.kingbrightusa.com/images/catalog/spec/DC10EWA.pdf
Resistor network: https://www.bourns.com/docs/Product-Datasheets/4600x.pdf
