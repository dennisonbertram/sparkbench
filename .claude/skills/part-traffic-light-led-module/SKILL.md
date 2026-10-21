---
name: part-traffic-light-led-module
description: Pinout, electrical limits, wiring and MicroPython code for the traffic light LED module (Keyestudio KS0310 and look-alikes, header R, Y, G, GND). Use when designing, wiring, simulating or writing code for a traffic light LED module in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Traffic light LED module (Keyestudio KS0310)

## Overview
Three LEDs (red, yellow, green) laid out like a traffic light, each with its own current-limiting resistor on the board (marked 221 / 471, i.e. 220 Ω / 470 Ω) and a shared ground (common cathode). There is no chip and no supply pin: a GPIO driven high lights its LED. Hobbyists buy it as the **Keyestudio KS0310 Traffic Light Module** or one of the many look-alikes with the same R/Y/G/GND header.

## Pinout (header order)
| Pin | Function |
|---|---|
| R | Red LED (through on-board resistor): high = on |
| Y | Yellow LED: high = on |
| G | Green LED: high = on |
| GND | Common cathode, to the microcontroller's GND |

## Electrical limits
- Logic level 3.3–5 V (Keyestudio rating); never more than 5 V on R/Y/G.
- A few mA per LED from 3.3 V, up to about 15 mA per LED from 5 V; fine for ESP32 / Pico / Pi GPIOs.

## Interface details
- Plain digital inputs: no driver needed, just `machine.Pin`. Each colour is independent.
- Active high: `Pin.value(1)` = LED on.

## Wiring
- ESP32: R → D25, Y → D26, G → D27, GND → GND.
- Pico: R → GP2, Y → GP3, G → GP6, GND → GND.
- Raspberry Pi 4: R → pin 11 (GPIO17), Y → pin 13 (GPIO27), G → pin 15 (GPIO22), GND → pin 6.

## Using it
```python
from machine import Pin
import time
red = Pin(25, Pin.OUT, value=0)
yellow = Pin(26, Pin.OUT, value=0)
green = Pin(27, Pin.OUT, value=0)
green.value(1); time.sleep(2); green.value(0)
yellow.value(1); time.sleep(1); yellow.value(0)
red.value(1)
```

## Gotchas
- No VCC pin: don't look for one, and don't add extra resistors; they are already on the board.
- Wiring R/Y/G straight to 3V3 or 5V just keeps that LED on permanently.
- From 3.3 V the LEDs are a bit dimmer than from 5 V; that is normal.
- Initialise pins with `value=0` so all lights start off.

## Datasheet
https://docs.keyestudio.com/projects/KS0310/en/latest/docs/KS0310.html
