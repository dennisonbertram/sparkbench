---
name: part-4-channel-line-tracker
description: Pinout, electrical limits, wiring and MicroPython driver for the 4-channel TCRT5000 IR line tracking module (four Vishay TCRT5000 probes on an LM339 comparator control board, outputs IN1-IN4). Use when designing, wiring, simulating or writing code for a 4-way line tracker / line follower sensor in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# 4-channel TCRT5000 IR line tracking module (4-channel line tracker)

## Overview
Four **Vishay TCRT5000** reflective sensors (950 nm IR LED plus phototransistor, best at **2.5 mm**, usable 0.2-15 mm) on small probe boards, cabled to a red **control board** with an **LM339 quad comparator**, one sensitivity trimmer and one indicator LED per channel. Hobbyists buy it as the "4-channel infrared tracing / line tracking module" kit for robot cars.
- **Each output goes LOW over a white / reflective surface** (its LED D1-D4 lights), **HIGH over a black line** or with nothing in range
- Outputs are LM339 open collector with a **10 kΩ pull-up to VCC** (R1-R4)
- Supply: **3.3-5 V**

## Pinout (6-pin right-angle header to the microcontroller, as printed)
| Pin | Name | Function |
|---|---|---|
| 1 | VCC | Supply, 3.3-5 V (also feeds the probes) |
| 2 | GND | Ground |
| 3 | IN1 | Channel 1 output: 0 = white, 1 = black line / nothing |
| 4 | IN2 | Channel 2 output |
| 5 | IN3 | Channel 3 output |
| 6 | IN4 | Channel 4 output |

The silkscreen says IN1-IN4 but they are **outputs** (the vendor datasheet calls them OUT1-OUT4). The opposite edge has four 3-pin probe connectors (VCC, GND, INn) that take the TCRT5000 probe boards (VCC, GND, OUT). Because the board has connectors on two edges it is wired with jumper leads, not plugged into a breadboard.

## Board circuit
- Probe: TCRT5000 IR LED lit continuously; phototransistor collector pulled up on the probe, giving an analog level that falls as more IR is reflected.
- Control board: each probe signal goes to one LM339 comparator; the trimmer sets the threshold.
- LM339 outputs: open collector, 10 kΩ pull-up (R1-R4, "103") to VCC; LEDs D1-D4 with 2.2 kΩ (R5-R8, "222") light when the output is low. D5 is the power LED (1 kΩ, R13).

## Electrical limits
- Supply 3.3-5 V (LM339 itself 2-36 V). Outputs swing to VCC: **power from 3V3 on an ESP32 or Pico**.
- Current: roughly 100 mA at 5 V, mostly the four IR LEDs; less at 3.3 V.
- LM339 output sink max 25 mA (absolute); here only the pull-up and LED current flows.
- TCRT5000: IR LED max 60 mA, ambient −25 to +85 °C; module rated −10 to +50 °C.

## Interface details
Four plain digital inputs, no protocol, no pull-ups needed (the board has them):
```
INn = 0  -> probe n over a white / light surface
INn = 1  -> probe n over the black line, or lifted off the floor
```

## Wiring
| Module | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| VCC | 3V3 | 3V3(OUT) (pin 36) | 3V3 (pin 1) |
| GND | GND | GND | GND (pin 6) |
| IN1 | GPIO32 | GP10 | GPIO17 (pin 11) |
| IN2 | GPIO33 | GP11 | GPIO27 (pin 13) |
| IN3 | GPIO25 | GP12 | GPIO22 (pin 15) |
| IN4 | GPIO26 | GP13 | GPIO23 (pin 16) |

## Using the driver
```python
from line_tracker4 import LineTracker4
import time
tracker = LineTracker4(32, 33, 25, 26)   # GPIOs wired to IN1..IN4
while True:
    print('Line: %d %d %d %d' % tracker.line())   # 1 = probe over the black line
    time.sleep(0.3)
```
`line()` gives 1 per probe over the line, `white()` the opposite, `raw()` the pin levels, `on_line(n)` one probe, `position()` a weighted line position from −1.5 (probe 1) to +1.5 (probe 4) or None, and `irq(n, handler)` fires when probe n moves onto the line.

## Gotchas
- **Height matters**: 2-10 mm above the floor. Too high and every channel reads "black" (high).
- **Adjust each trimmer** so its LED is on over white and off over the line; channels differ.
- "Black" also means "nothing there", e.g. the car is lifted.
- **Powered from 5 V the outputs are 5 V** through the pull-ups: too much for a 3.3 V GPIO.
- Sunlight contains IR and upsets the probes; glossy black tape can look white.
- Some kits ship the same control board with 5 mm IR LED/photodiode probes (longer range obstacle sensing); wiring and logic are identical.

## Datasheet
https://www.vishay.com/docs/83760/tcrt5000.pdf (sensor), https://www.ti.com/lit/ds/symlink/lm339.pdf (comparator)
Module pin order and output logic: https://cdn.shopify.com/s/files/1/1509/1638/files/4chIR_datasheet.pdf (pins 1-6: VCC, GND, OUT1-OUT4).
