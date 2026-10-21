---
name: part-tsop38238
description: Pinout, electrical limits, wiring and MicroPython driver for the Vishay TSOP38238 38 kHz IR remote-control receiver (Adafruit product 157). Use when designing, wiring, simulating or writing code for a TSOP38238 / TSOP382xx IR receiver in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build, e.g. to read buttons from a TV-style remote.
---

# TSOP38238 38 kHz IR receiver (TSOP38238)

## Overview
The **Vishay TSOP38238** packs a PIN photodiode, AGC, a 38 kHz band-pass filter and a demodulator into one 3-lead Minicast package. When it sees IR light flashing at 38 kHz its **OUT pin goes LOW**; otherwise OUT idles HIGH through an internal 30 kΩ pull-up. The microcontroller times those low/high pulses to decode the remote's code (NEC, Sharp, Mitsubishi and other long-burst codes). Hobbyists buy the bare part, e.g. **Adafruit IR (Infrared) Receiver Sensor - TSOP38238 (product 157)**.

## Pinout (dome facing you, leads down, left to right)
| Pin | Function |
|---|---|
| OUT (1) | Demodulated output, active low, internal 30 kΩ pull-up to VS |
| GND (2) | Ground |
| VS (3) | Supply, 2.0–5.5 V |

## Electrical limits
- Supply: 2.0–5.5 V (absolute max 6 V).
- Current: 0.25–0.45 mA (0.35 mA typical at 3.3 V); absolute max 3 mA.
- OUT: sinks at most 5 mA; low level ≤ 100 mV at 0.5 mA. OUT is pulled up to VS, so VS sets the high level.
- Carrier 38 kHz; typical range 30 m; ±45° half-angle.

## Interface details
- Output pulse width matches the IR burst within ±5/f0 (about ±130 µs), delayed by 7–13 carrier periods.
- NEC frame (most cheap remotes): 9 ms low, 4.5 ms high, then 32 bits LSB first: address, ~address (or a 16-bit extended address), command, ~command. Each bit is a 562.5 µs low mark followed by a 562.5 µs (0) or 1687.5 µs (1) high space, then a final mark. While a button is held the remote sends a repeat code (9 ms low, 2.25 ms high, mark) every 108 ms.
- The driver (`ir_rx.py`, Peter Hinch's MIT micropython_ir NEC decoder) records every edge in a pin interrupt and decodes 80 ms after the first edge. `NEC_16` accepts both standard and extended addresses; `NEC_8` rejects frames whose address check byte does not match.

## Wiring
- ESP32: VS → 3V3, GND → GND, OUT → GPIO 15 (any input-capable GPIO).
- Pico: VS → 3V3(OUT), GND → GND, OUT → GP16.
- Raspberry Pi 4: VS → pin 1 (3.3 V), GND → pin 6, OUT → pin 11 (GPIO17).
- Optional: 100 Ω in series with VS and 0.1 µF from VS to GND close to the part if the supply is noisy (datasheet application circuit).

## Using the driver
```python
from machine import Pin
from ir_rx import NEC_16
import time

def cb(data, addr, ctrl):
    if data == NEC_16.REPEAT:
        print('repeat')
    elif data >= 0:
        print('addr %04x cmd %02x' % (addr, data))

ir = NEC_16(Pin(15, Pin.IN), cb)
while True:
    time.sleep_ms(100)
```

## Gotchas
- Powering VS from 5 V puts 5 V on OUT (internal pull-up to VS) — use 3.3 V with an ESP32 or Pico.
- The lead order differs from KY-022 modules (S, VCC, GND); getting VS and GND swapped can destroy the part.
- Only 38 kHz remotes work well; RC-5/RC-6 (36 kHz) remotes work at reduced range.
- Sunlight and fluorescent/LED lamps reduce range; shade the dome.
- Decoding in a pin IRQ needs a free-running main loop; long blocking calls are fine but keep the callback short.

## Datasheet
https://www.vishay.com/docs/82491/tsop382.pdf
