---
name: part-ky-009
description: Pinout, electrical limits, wiring and MicroPython code for the KY-009 RGB LED module (common-cathode SMD 5050 RGB LED, no onboard resistors). Use when designing, wiring, simulating or writing code for a KY-009 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# KY-009 RGB LED module (KY-009)

## Overview
The **KY-009** is an SMD 5050 **common-cathode** RGB LED on a small 4-pin board. Each colour has its own anode pin. Unlike the KY-016, there are **no series resistors on the board**: you must add one per colour. Drive a pin high to light that colour, or PWM the three pins to mix colours. Hobbyists buy it as the **Keyes KY-009 RGB full-colour LED SMD module** from 37-in-1 sensor kits (Joy-IT SEN-KY009RGB and clones).

## Pinout (KY-009, header order)
| Pin | Function |
|---|---|
| - | Common cathode: GND |
| R | Red anode (add series resistor) |
| G | Green anode (add series resistor) |
| B | Blue anode (add series resistor) |

## Electrical limits
- Forward voltage: red 1.8-2.4 V, green/blue 2.8-3.6 V; 20 mA per colour (Joy-IT / arduinomodules data).
- Series resistors at 5 V: red 180 Ohm, green/blue 100 Ohm.
- Series resistors from a 3.3 V GPIO: red 150 Ohm (~10 mA), green/blue 47 Ohm (~10 mA). Keep Pico / Raspberry Pi pins under ~12 mA.

## Interface details
- Plain GPIO or PWM, no driver needed. High = on (common cathode).
- Colour mixing: `PWM(Pin(n), freq=1000, duty_u16=...)` per channel.

## Wiring
- ESP32: R -> 150 Ohm -> D25, G -> 47 Ohm -> D26, B -> 47 Ohm -> D27, - -> GND.
- Pico: R -> 150 Ohm -> GP2, G -> 47 Ohm -> GP3, B -> 47 Ohm -> GP6, - -> GND.
- Raspberry Pi 4: R -> 150 Ohm -> GPIO25 (pin 22), G -> 47 Ohm -> GPIO24 (pin 18), B -> 47 Ohm -> GPIO23 (pin 16), - -> pin 6.

## Using it
```python
from machine import Pin, PWM
r = PWM(Pin(25), freq=1000, duty_u16=0)
g = PWM(Pin(26), freq=1000, duty_u16=0)
b = PWM(Pin(27), freq=1000, duty_u16=0)
def colour(rr, gg, bb):  # 0-255 each
    r.duty_u16(rr * 257); g.duty_u16(gg * 257); b.duty_u16(bb * 257)
colour(255, 80, 0)  # orange
```

## Gotchas
- No resistors on the board: never wire a GPIO straight to R/G/B.
- At 3.3 V green and blue can be dim (Vf up to 3.6 V); scale red down for white.
- Some clones are printed - R G B but wired - G R B (green next to -). Test first with 220 Ohm on every pin; swap pins in code if colours are wrong.
- Not common anode: high turns it on, not off.

## Datasheet
https://sensorkit.joy-it.net/en/sensors/ky-009
