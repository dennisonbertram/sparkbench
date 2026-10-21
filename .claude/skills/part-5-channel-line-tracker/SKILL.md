---
name: part-5-channel-line-tracker
description: Pinout, electrical limits, wiring and MicroPython driver for the 5-channel TCRT5000 IR line tracking sensor board (five Vishay TCRT5000 reflective sensors + 74HC14D Schmitt inverter, GND/5V/OUT1-OUT5 header). Use when designing, wiring, simulating or writing code for a 5-channel line tracker / line follower array in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# 5-channel TCRT5000 IR line tracker

## Overview
Five **Vishay TCRT5000** reflective sensors (950 nm IR LED + phototransistor) sit 15 mm apart on a **95 x 20 mm** blue board. One **74HC14D** hex Schmitt-trigger inverter squares up each channel, so each output is a clean digital level. There are **no trimmers**.
- **OUTn goes LOW over a black line** (or with nothing in range), **HIGH over a white / reflective surface**
- A per-channel LED lights over white and goes out over black
- Supply: **3.3-5 V** (the pin is printed "5V"), up to about 100 mA

## Pinout (7-pin header, as printed on the board)
| Pin | Name | Function |
|---|---|---|
| 1 | GND | Ground |
| 2 | 5V | Supply, 3.3-5 V |
| 3 | OUT1 | Sensor 1 (one end of the row) |
| 4 | OUT2 | Sensor 2 |
| 5 | OUT3 | Sensor 3 (centre) |
| 6 | OUT4 | Sensor 4 |
| 7 | OUT5 | Sensor 5 (other end) |

## Board circuit
- Each IR LED is lit all the time through a series resistor.
- Each phototransistor collector is pulled up to VCC; that node drives one 74HC14 input.
- 74HC14 output = **OUTn** (push-pull, 0 V to VCC). The 74HC14 inverts: no reflection (black) → input high → OUT low.
- The 74HC14 runs from 2 to 6 V (TI SN74HC14), so the board works at 3.3 V as well as 5 V.

## Electrical limits
- Supply 3.3-5 V. **Outputs swing to the supply**, so power it from **3V3 on an ESP32 or Pico**.
- About 100 mA (five IR LEDs plus indicator LEDs).
- TCRT5000: IR LED max 60 mA / reverse 5 V; phototransistor VCEO 70 V; peak sensing distance 2.5 mm. The board's useful range is about 1-15 mm.

## Interface details
Five plain digital inputs, no protocol, no pull-ups needed:
```
OUTn = 0  -> black line under sensor n, or nothing in range
OUTn = 1  -> white / light surface under sensor n
```

## Wiring
| Board | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| GND | GND | GND | GND (pin 6) |
| 5V | 3V3 | 3V3(OUT) (pin 36) | 3V3 (pin 1) |
| OUT1 | GPIO13 | GP10 | GPIO5 (pin 29) |
| OUT2 | GPIO14 | GP11 | GPIO6 (pin 31) |
| OUT3 | GPIO27 | GP12 | GPIO13 (pin 33) |
| OUT4 | GPIO26 | GP13 | GPIO19 (pin 35) |
| OUT5 | GPIO25 | GP14 | GPIO26 (pin 37) |

## Using the driver
```python
from line_tracker5 import LineTracker5
import time
tracker = LineTracker5(13, 14, 27, 26, 25)   # GPIOs wired to OUT1..OUT5
while True:
    print('Line: %s' % tracker.pattern())   # e.g. '00100' = line under the centre sensor
    time.sleep(0.5)
```
`pattern()` gives a 5-character string with '1' where a sensor sees black; `black()` the same as booleans; `raw()` the pin levels (1 = white); `position()` returns -2 (under OUT1) to +2 (under OUT5), or None when no sensor, or all five, see black.

## Gotchas
- **Polarity is the opposite of what many expect**: black = LOW. Some other 5-channel boards (with an LM339 and trimmers) differ; check with a strip of black tape first.
- **All five LOW** usually means the board is lifted too high, not a crossing line.
- No sensitivity adjustment: get the height right (about 5-15 mm) and use matte black tape on a light floor.
- Sunlight contains IR and can make sensors read white.

## Datasheet
TCRT5000: https://www.vishay.com/docs/83760/tcrt5000.pdf
74HC14: https://www.ti.com/lit/ds/symlink/sn74hc14.pdf
Board (74HC14D, output levels, header GND/5V/OUT1-OUT5): https://m.dzsc.com/product/8148-2017718145059511.html
