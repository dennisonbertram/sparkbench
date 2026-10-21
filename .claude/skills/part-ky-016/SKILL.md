---
name: part-ky-016
description: Pinout, electrical limits, wiring and MicroPython code for the KY-016 RGB LED module (common-cathode 5 mm RGB LED, also sold as HW-479). Use when designing, wiring, simulating or writing code for a KY-016 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# KY-016 RGB LED module (KY-016)

## Overview
The **KY-016** is a 5 mm **common-cathode** RGB LED on a small 4-pin board. Each colour has its own anode pin with a series resistor already on the board (150 Ω on most boards). Drive a pin high to light that colour; PWM the three pins to mix colours. Hobbyists buy it as the **KY-016 / HW-479 RGB LED module** from 37-in-1 sensor kits.

## Pinout (KY-016 / HW-479, header order)
| Pin | Function |
|---|---|
| - | Common cathode: GND |
| R | Red anode (via onboard resistor) |
| G | Green anode (via onboard resistor) |
| B | Blue anode (via onboard resistor) |

## Electrical limits
- Drive level 3.3–5 V on R/G/B.
- Forward voltage: red about 1.8 V, green/blue about 2.8 V; 20 mA rated per colour (Joy-IT sensor kit data).
- With 150 Ω onboard: at 3.3 V red is about 10 mA, green/blue about 3 mA; at 5 V red about 21 mA, green/blue about 15 mA.

## Interface details
- Plain GPIO or PWM, no driver needed. High = on (common cathode).
- Colour mixing: `PWM(Pin(n), freq=1000, duty_u16=...)` per channel.

## Wiring
- ESP32: R → D25, G → D26, B → D27, - → GND.
- Pico: R → GP2, G → GP3, B → GP6, - → GND.
- Raspberry Pi 4: R → GPIO25 (pin 22), G → GPIO24 (pin 18), B → GPIO23 (pin 16), - → pin 6.

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
- At 3.3 V green and blue are much dimmer than red (higher forward voltage); scale red down to get white.
- Some boards use 1 kΩ resistors (marked 102) and are dim; that is normal.
- The Joy-IT version is documented without resistors: if your board has no SMD resistors, add 180 Ω (red) and 100 Ω (green, blue) in series.
- Some clones print - G R B. Check the silkscreen; swap pins in code if colours are wrong.
- Not a common-anode LED: high turns it on, not off.

## Datasheet
https://sensorkit.joy-it.net/en/sensors/ky-016
