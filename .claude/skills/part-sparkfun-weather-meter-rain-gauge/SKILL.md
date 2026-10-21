---
name: part-sparkfun-weather-meter-rain-gauge
description: Pinout, electrical limits, wiring and MicroPython driver for the SparkFun Weather Meter Kit (SEN-15901) tipping-bucket rain gauge (reed switch, one momentary closure per 0.2794 mm / 0.011 in of rain, RJ11 cable). Use when designing, wiring, simulating or writing code for a rain gauge / rainfall sensor in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# SparkFun Weather Meter rain gauge (SEN-15901 kit)

## Overview
The rain gauge from the **SparkFun Weather Meter Kit (SEN-15901)** is a self-emptying **tipping bucket**. Each time **0.2794 mm (0.011 in)** of rain has collected, the bucket tips, empties itself, and a magnet sweeps past a sealed **reed switch**, giving **one momentary contact closure**. There are no electronics in it: count the closures with a GPIO interrupt.
- 1 tip = 0.2794 mm of rain; rainfall (mm) = tips x 0.2794; inches = tips x 0.011
- Passive, not polarised, no supply pin. It needs a pull-up so the closure can be seen.
- Comes on an RJ11-terminated cable; the switch is on the **two centre conductors**.

## Pinout (two centre conductors of the RJ11 plug, not polarised)
| Sparkbench pin | Wire | Function |
|---|---|---|
| RAIN | RJ11 centre conductor (RAIN_COUNT in the datasheet circuit) | Switch lead: to a GPIO with the internal pull-up on |
| GND | The other RJ11 centre conductor | Other switch lead: to ground |

Either centre wire can be GND. Use an RJ11 breakout / jack (SparkFun's weather carrier boards have one) or cut the plug off; it is wired with jumper leads, not plugged into the breadboard.

## Electrical limits
- Just a reed switch: with a 3.3 V GPIO pull-up only microamps flow. Never put 5 V on the RAIN line of an ESP32 / Pico.
- No supply needed. The datasheet's reference circuit is a **100 kOhm pull-up from RAIN_COUNT to VCC plus 10 pF to GND**; on ESP32 / Pico the internal pull-up (about 50 kOhm) does the same job. Use VCC = 3.3 V, never 5 V. On a long cable a stronger external pull-up (10 kOhm to 3.3 V) helps against noise.

## Interface details
- Pulled up: RAIN reads **1 idle, 0 during a tip** (a short pulse, tens of ms).
- Count falling edges with `Pin.irq`. The reed bounces on closing **and** opening, so the driver counts the first falling edge and ignores further edges for `lockout_ms` (500 ms default, i.e. at most 2 tips/s, about 2000 mm/h, well above any real rain).
- Rain rate: count tips over an interval, e.g. tips per hour x 0.2794 = mm/h.
- Polling instead of an interrupt can miss the brief closure; use the IRQ.

## Wiring
| Gauge | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| RAIN | GPIO4 (pull-up on) | GP15 (pull-up on) | GPIO17 (pull-up on) |
| GND | GND | GND | GND |

## Using the driver
```python
from rain_gauge import RainGauge
import time
rain = RainGauge(4)            # GPIO the RAIN wire is on, internal pull-up enabled
while True:
    print('Rain=%.4f mm (%d tips)' % (rain.rainfall_mm(), rain.tips()))
    time.sleep(10)
```
`rain.take()` returns the tips since the last call and clears them (for per-interval rates); `rain.reset()` clears the total; `rainfall_in()` gives inches.

## Gotchas
- Mount it **level** (newer versions have a bubble level) and away from the wind sensors so they don't block or drip into it.
- The RJ11 is a 6P4C-style plug: only the centre pair is used for the rain gauge; the anemometer/vane cable is a separate plug.
- Each tip is 0.2794 mm by design; calibrate by pouring a known volume slowly if accuracy matters (funnel area x depth).
- Debris or insects in the funnel stop the bucket; clean it regularly.

## Datasheet
https://cdn.sparkfun.com/assets/d/1/e/0/6/DS-15901-Weather_Meter.pdf and https://learn.sparkfun.com/tutorials/weather-meter-hookup-guide
