---
name: part-ky-011
description: Pinout, electrical limits, wiring and MicroPython code for the KY-011 two-colour (red/green, common-cathode) 5 mm LED module (KY-011). Use when designing, wiring, simulating or writing code for a KY-011 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# KY-011 two-colour LED module (KY-011)

## Overview
The **KY-011** carries one 5 mm bi-colour LED: a red and a green chip in one lens with a **common cathode**. Drive a colour's pin high and that colour lights; both together look yellow/orange, and PWM on each pin mixes shades. Modelled board: **Joy-IT SEN-KY011LED / Keyes KY-011** from the 37-in-1 kits. The board has **no current-limiting resistors** (empty pads), so you add one per colour.

## Pinout (KY-011 module, header order)
| Pin | Function |
|---|---|
| - | Common cathode, to GND |
| (middle, unlabelled) MID | Red LED anode (via series resistor) |
| S | Green LED anode (via series resistor) |

## Electrical limits
- LED forward voltage 2.0-2.5 V, forward current 20 mA max per colour.
- Series resistor per colour (Joy-IT): **120 Ohm at 3.3 V**, **220 Ohm at 5 V**.
- No supply pin: the GPIOs power the LEDs. Keep a Pico / Raspberry Pi pin under about 12 mA (220 Ohm gives about 5 mA at 3.3 V and is still bright).

## Interface details
- Plain digital outputs: high = on, low = off, one pin per colour.
- PWM (e.g. 1 kHz, `PWM(Pin(n)).duty_u16(...)`) for brightness and colour mixing.

## Wiring
- ESP32: - → GND, MID → 120 Ohm → GPIO 25 (red), S → 120 Ohm → GPIO 26 (green).
- Pico: - → GND, MID → 120 Ohm → GP14 (red), S → 120 Ohm → GP15 (green).
- Raspberry Pi 4: - → pin 6 (GND), MID → 120 Ohm → GPIO 24 (pin 18), S → 120 Ohm → GPIO 23 (pin 16).

## Using it
```python
from machine import Pin
import time
red = Pin(25, Pin.OUT, value=0)    # middle pin
green = Pin(26, Pin.OUT, value=0)  # S
red.value(1); time.sleep(1); red.value(0)
green.value(1); time.sleep(1); green.value(0)
```

## Gotchas
- Never wire MID or S straight to a GPIO without a resistor: nothing on the board limits the current.
- Some clones fit the LED the other way round; if red and green are swapped, swap the pins in code.
- It is common cathode: switch the anodes high, do not try to sink current through - from a GPIO.

## Datasheet
https://sensorkit.joy-it.net/en/sensors/ky-011
