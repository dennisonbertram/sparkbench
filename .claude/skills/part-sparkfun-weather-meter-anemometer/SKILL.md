---
name: part-sparkfun-weather-meter-anemometer
description: Pinout, electrical limits, wiring and MicroPython driver for the SparkFun Weather Meter Kit (SEN-15901) cup anemometer (reed switch, one closure per second = 2.4 km/h / 1.492 mph, on RJ11 pins 2 and 3 of the cable shared with the wind vane). Use when designing, wiring, simulating or writing code for a reed-switch wind speed sensor / anemometer in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# SparkFun Weather Meter anemometer (SEN-15901 kit)

## Overview
The cup anemometer from the **SparkFun Weather Meter Kit (SEN-15901)** spins a magnet past a sealed **reed switch**. A wind speed of **2.4 km/h (1.492 mph) closes the switch once per second**, so wind speed is just a frequency. There are no electronics in it: count the closures with a GPIO interrupt.
- Wind speed (km/h) = closures per second x 2.4; mph = Hz x 1.492; m/s = km/h / 3.6
- Passive, not polarised, no supply pin. It needs a pull-up so the closures can be seen.
- Its short cable plugs into the wind vane; the vane's RJ11 cable carries the anemometer on the **inner two conductors (pins 2 and 3)** and the vane on the outer pair (pins 1 and 4).

## Pinout (inner pair of the shared RJ11 plug, not polarised)
| Sparkbench pin | Wire | Function |
|---|---|---|
| WIND | RJ11 pin 2 (inner conductor) | Switch lead: to a GPIO with the internal pull-up on |
| GND | RJ11 pin 3 (inner conductor) | Other switch lead: to ground |

Either inner wire can be GND. Use an RJ11 breakout / jack (SparkFun BOB-14021 or a weather carrier board) or cut the plug off; it is wired with jumper leads, not plugged into the breadboard.

## Electrical limits
- Just a reed switch: with a 3.3 V GPIO pull-up only microamps flow. Pull up to 3.3 V, never 5 V, on an ESP32 / Pico.
- No supply needed. The ESP32 / Pico internal pull-up (about 50 kOhm) is enough on a short cable; on a long cable add a 10 kOhm pull-up to 3.3 V (and optionally a small capacitor to GND) against noise.

## Interface details
- Pulled up: WIND reads 1 while the switch is open, 0 while it is closed; one falling edge per closure.
- 1 Hz = 2.4 km/h, so even a gale (100 km/h) is only about 42 Hz: easy for `Pin.irq`.
- The driver times the interval between the first and last closure inside a window (default 2 s), so the result has no +/-1 pulse error. Below 2 closures in the window (under about 1.2 km/h for 2 s) it reports 0.
- Contact bounce is ignored with a 4 ms lockout (good up to 250 Hz = 600 km/h).

## Wiring
| Anemometer | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| WIND | GPIO4 (pull-up on) | GP14 (pull-up on) | GPIO27 (pull-up on) |
| GND | GND | GND | GND |

## Using the driver
```python
from anemometer import Anemometer
wind = Anemometer(4)                  # GPIO the WIND wire is on, internal pull-up enabled
while True:
    print('Wind=%d km/h' % round(wind.speed_kmh(2000)))   # blocks for the 2 s window
```
`speed_mph()`, `speed_ms()` and `frequency()` use the same window; `closures()` is the running total (wind run = closures x 2.4 km/h x 1 s / 3600 = km).

## Gotchas
- The anemometer has no cable to your board of its own: plug it into the wind vane and take the combined RJ11 from the vane. Pins 2/3 are wind speed, pins 1/4 are wind direction.
- Gusts: a short window (1-3 s) shows gusts, average over minutes for mean wind speed (weather services use 10 min).
- Mount it above roof turbulence and away from obstructions; tighten the set screw so the cups don't slip.

## Datasheet
https://cdn.sparkfun.com/assets/d/1/e/0/6/DS-15901-Weather_Meter.pdf and https://learn.sparkfun.com/tutorials/weather-meter-hookup-guide
