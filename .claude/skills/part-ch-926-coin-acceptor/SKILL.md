---
name: part-ch-926-coin-acceptor
description: Pinout, electrical limits, wiring and MicroPython driver for the CH-926 multi-coin acceptor (12 V, up to 6 coin types, programmable 1-50 pulses per coin on an open-collector COIN output; also sold as JY-926 / Sintron CH-926). Use when designing, wiring, simulating or writing code for a coin acceptor / coin mech in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# CH-926 multi-coin acceptor

## Overview
The **CH-926** is a stand-alone coin selector for vending machines, arcade games and kiosks. It learns up to **6 coin types** from samples (no PC: buttons and an LED display on the back) and, for each accepted coin, sends a **train of P pulses** on its COIN wire, where **P = 1...50** is programmed per coin type. Rejected coins drop out of the return slot.
- Supply: **12 V DC +/-10 %** (10.8-13.2 V), 65 mA working; the coin-gate solenoid adds surges, and the seller recommends a **12 V, 0.8 A** supply.
- Coins 15-32 mm diameter, 1.2-3.8 mm thick, <= 0.6 s per coin, 99.5 % identification.
- Pulse length set by the three-way switch: **FAST 20 ms, MEDIUM 50 ms, SLOW 100 ms**. Two-way switch: output **NO or NC**.

## Pinout (4-pin socket, order from the manual's connection diagram)
| Pin | Wire | Function |
|---|---|---|
| DC+12 | Red | +12 V DC supply, from a separate 12 V adapter |
| COIN | White | Coin pulse output, open collector: pulls to GND for each pulse (NO setting) |
| GND | Black | Ground: join the 12 V supply negative and the microcontroller GND |
| COUNTER | Gray | Output for a 12 V electromechanical counter wired between DC+12 and COUNTER (optional) |

It is a 170 x 130 x 70 mm coin mech on a lead, wired with jumper leads, not plugged into the breadboard.

## Electrical limits
- Never feed DC+12 from the board's 3V3/5V: use its own 12 V supply with a common ground.
- COIN is an open-collector output. Pull it up to **3.3 V only** (GPIO internal pull-up, or 10 kOhm to 3V3); never to 12 V or 5 V on an ESP32 / Pico.
- Units vary between batches. Before connecting COIN to a GPIO, power the acceptor and measure COIN to GND with nothing attached: it should float (near 0 V, no pull-up inside). If it reads 5 V or 12 V, use a divider or an optocoupler (PC817) instead.

## Interface details
- Switch on **NO**: COIN idles high (through your pull-up) and goes **low for each pulse**; count falling edges. On NC the polarity is inverted.
- One coin = P pulses back to back; the coin is complete when no new pulse arrives for a few pulse lengths. The driver waits `gap_ms` = max(200, 4 x pulse length) ms (200 ms on FAST/MEDIUM, 400 ms on SLOW).
- Programming: hold Add + Minus 3 s ("A"), Setup -> "E" number of coin types, "H" number of samples, **"P" pulses for this coin**, "F" accuracy (1-30, 5-10 typical), repeat per coin, then power-cycle. Then sample: Setup -> "A1", insert >= 20 samples, Setup -> "A2" ..., Setup, power-cycle.
- A common scheme: program P = coin value in the smallest unit (e.g. 1 pulse = 0.10, so a 0.50 coin = 5 pulses).

## Wiring
| CH-926 | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| DC+12 (red) | 12 V adapter + | 12 V adapter + | 12 V adapter + |
| GND (black) | GND and adapter - | GND and adapter - | GND and adapter - |
| COIN (white) | GPIO4 + 10 kOhm to 3V3 | GP15 + 10 kOhm to 3V3 | GPIO17 + 10 kOhm to 3V3 |
| COUNTER (gray) | not connected | not connected | not connected |

## Using the driver
```python
from ch926 import CoinAcceptor
import time
coin = CoinAcceptor(4, speed='medium')   # COIN wire on GPIO4; acceptor switch on MEDIUM and NO
credit = 0
while True:
    n = coin.poll()                       # pulses of a finished coin, or 0
    if n:
        credit += n
        print('Coin: %d pulses, credit=%d' % (n, credit))
    time.sleep_ms(20)
```
`speed` must match the acceptor's switch ('fast', 'medium', 'slow'); `nc=True` if the switch is on NC; `total_pulses()` counts every pulse since start-up.

## Gotchas
- Set the driver's `speed` to the same position as the pulse switch, or two coins may merge or one coin split.
- The 12 V supply must share ground with the microcontroller, or no pulses are seen.
- The manual's FAQ lists "pull-up resistor with signal wire (not allowed)" as a cause of missing outputs, without saying to which voltage. Never pull COIN up to 12 V or 5 V; hobbyist builds of this open-collector output use a 3.3 V pull-up (internal or 10 kOhm) at the GPIO. If you see no pulses, check the NO/NC switch and the common ground first.
- Re-sample when coin batches differ; use separate channels for old and new versions of a coin.
- Interrupts: count with `Pin.irq`; polling can miss 20 ms pulses.

## Datasheet
https://www.arcadexpress.com/documentos/Manual%20CH926.pdf (Manual of CH-926: specs, setup, connection diagram, switches)
