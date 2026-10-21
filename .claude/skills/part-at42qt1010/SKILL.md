---
name: part-at42qt1010
description: Pinout, electrical limits, wiring and MicroPython driver for the AT42QT1010 single-key capacitive touch sensor (Microchip AT42QT1010, SparkFun SEN-12041 breakout). Use when designing, wiring, simulating or writing code for an AT42QT1010 touch breakout in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# AT42QT1010 capacitive touch breakout (AT42QT1010)

## Overview
The **AT42QT1010** (Microchip, formerly Atmel QTouch) is a one-key capacitive touch sensor with a single digital output. Hobbyists buy it on the **SparkFun Capacitive Touch Breakout - AT42QT1010 (SEN-12041)**: a small red board with an on-board round touch electrode, a green LED that lights while touched, a 4-hole header, and a PAD hole for an external electrode.

## Pinout (4-pin header, J1 pins 1–4: GND, OUT, VDD, LED)
| Pin | Function |
|---|---|
| GND | Ground |
| OUT | Touch output, push-pull, active HIGH while touched |
| VDD | Supply, 1.8–5.5 V |
| LED | Base drive of the LED transistor; tied to OUT by jumper JP7 (closed). Leave unconnected |

PAD (separate hole, corner of the board) connects an external electrode in parallel with the on-board one.

## Electrical limits
- Supply 1.8–5.5 V (abs. max: any pin −0.6 V to Vdd+0.6 V). **OUT swings to VDD, so power it from 3.3 V** on an ESP32 or Pico.
- Chip current: ~200–750 µA in Fast mode, ~15–75 µA in Low Power mode; the green LED adds a few mA while touched.
- OUT sinks/sources up to 2 mA (VOL ≤ 0.5 V at 4 mA, VOH ≥ 2.3 V at 1 mA).

## Interface details
- Plain digital output: read OUT as a GPIO input, no pull resistor needed.
- Power-up: OUT is invalid for ~100 ms while the chip calibrates; keep fingers off the electrode.
- Max On-duration: a touch held for ~60 s (3 V, LP mode) triggers a recalibration and OUT goes low (AT42QT1011 has no timeout).
- Response time up to ~100 ms; detect integrator needs several successive detections.
- Mode jumper JP8 (SYNC/MODE): 1 = Fast (SYNC high), 2 = Low Power (SYNC low, 80 ms sleep between bursts).
- HeartBeat: OUT tri-states for 15 µs before each burst; harmless for a CMOS GPIO input.
- JP7: cut it to disconnect the LED from OUT, then drive the LED pin yourself.

## Wiring
- ESP32: VDD → 3V3, GND → GND, OUT → GPIO4.
- Pico: VDD → 3V3(OUT), GND → GND, OUT → GP15.
- Raspberry Pi 4: VDD → pin 1 (3.3 V), GND → pin 6, OUT → GPIO17 (pin 11).

## Using the driver
```python
from at42qt1010 import AT42QT1010
import time
pad = AT42QT1010(4)       # GPIO wired to OUT; waits 100 ms for power-up
while True:
    print('TOUCH=%d' % pad.touched())
    time.sleep(0.2)
```
`irq(handler)` calls `handler` when a touch starts (`on_touch=False` for release).

## Gotchas
- **At 5 V the OUT pin is 5 V** – too much for ESP32/Pico GPIO. Use 3.3 V.
- A held touch is released after ~60 s by the Max On-duration recalibration.
- Supply noise causes false detections; give it a clean 3.3 V and keep leads short.
- Larger electrodes or thick panels need tuning of the sense capacitor (Cs, 10 nF on the board).

## Datasheet
https://cdn.sparkfun.com/assets/5/2/e/d/d/40001946A.pdf
