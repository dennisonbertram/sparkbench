---
name: part-vs1838b
description: Pinout, electrical limits, wiring and MicroPython NEC decoder for the VS1838B 38 kHz infrared remote-control receiver (bare 3-pin, sold with a 21-key NEC remote). Use when designing, wiring, simulating or writing code for a VS1838B IR receiver in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# VS1838B 38 kHz IR receiver (VS1838B)

## Overview
The **VS1838B** is a 3-pin IR remote-control receiver: photodiode, amplifier, band-pass filter, demodulator and output transistor in one epoxy package. It turns 38 kHz IR bursts from a remote into a clean digital signal. Hobbyists buy it **bare, with a 21-key NEC "Car MP3" remote**. Each button press sends one NEC frame (an address and a command), followed by repeat codes while the button is held.

## Pinout (bare VS1838B, facing the dome, left to right)
| Pin | Function |
|---|---|
| OUT | Demodulated output, active low (low while a 38 kHz burst is received), internal pull-up to VCC |
| GND | Ground |
| VCC | Supply, 2.7–5.5 V |

## Electrical limits
- Supply: 2.7–5.5 V (absolute max 6 V). Current 0.4 mA typical, 1.5 mA max.
- Carrier 38 kHz, reception angle ±45°, range about 18–20 m.
- Output low ≤ 0.4 V; high ≈ VCC through the internal pull-up.
- Operating temperature −20 to 85 °C.

## Interface details
- OUT idles **high** and is **low during each IR burst**.
- NEC frame: 9 ms mark, 4.5 ms space, 32 bits LSB first (address, ~address, command, ~command), and a final mark. Each bit is a 562.5 µs mark, then a 562.5 µs space for 0 or a 1687.5 µs space for 1.
- Repeat code while held: 9 ms mark, 2.25 ms space, 562.5 µs mark, every 108 ms.
- The datasheet's output pulse widths are 500–700 µs for a 600 µs burst. Decode with a threshold of about 1120 µs on the spaces, not exact timings.

## Wiring
- ESP32: VCC → 3V3, GND → GND, OUT → any input GPIO (e.g. D25).
- Pico: VCC → 3V3(OUT), GND → GND, OUT → GP2.
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, OUT → GPIO17 (pin 11).
- Use 3.3 V on 3.3 V boards. OUT is pulled up to VCC, so at 5 V it would drive a GPIO that is not 5 V tolerant.
- Optional (datasheet application circuit): 100 Ω in series with VCC, plus 100 µF and 100 nF from VCC to GND.

## Using the driver
`nec_ir.py` records the time of every edge with a pin interrupt. `read()` decodes a burst once the line has been quiet for 12 ms. Call it every 10–20 ms.
```python
from machine import Pin
import time
from nec_ir import NEC
ir = NEC(Pin(25, Pin.IN))          # NEC(pin, extended=True) for 16-bit-address remotes
while True:
    r = ir.read()
    if r and r[1] >= 0:
        print('addr %02x cmd %02x' % r)
    elif r and r[1] == NEC.REPEAT:
        print('repeat')
    time.sleep_ms(10)
```

## Gotchas
- Swapping VCC and GND kills the part. Check the order (OUT, GND, VCC facing the dome) before you power it.
- Some breakout modules (KY-022 style) put the pins in a different order. This entry is the bare part.
- Sunlight, CFL lamps and LCD backlights cause noise bursts; the decoder reports them as `NEC.ERROR`.
- Remotes from other brands may use a different protocol (RC5, Sony SIRC), which this decoder does not handle.

## Datasheet
https://www.datasheetcafe.com/wp-content/uploads/2015/11/VS1838B.pdf
