---
name: part-fs90r
description: Pinout, electrical limits, wiring and MicroPython driver for the FS90R continuous-rotation micro servo (FEETECH FS90R, Adafruit 2442 / Pololu 2820). Use when designing, wiring, simulating or writing code for an FS90R in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# FS90R continuous-rotation micro servo (FEETECH FS90R)

## Overview
The **FEETECH FS90R** is a 9 g micro servo built for continuous 360° rotation. Its pulse sets **speed and direction**, not an angle, so it suits small robot wheels. No load it runs at about 100 RPM at 4.8 V (Pololu measured about 130 RPM at 6 V). Stall torque is 1.3 kgf·cm at 4.8 V and 1.5 kgf·cm at 6 V. Hobbyists buy it as the bare servo (Adafruit #2442, Pololu #2820) with a 3-wire lead ending in a JR-style female 2.54 mm plug, plus horns and screws.

## Pinout (3-wire lead, connector order)
| Pin | Wire | Function |
|---|---|---|
| GND | Brown | Ground |
| V+ | Red | Supply, 4.8–6.0 V |
| SIG | Orange | Control pulse, 50 Hz |

## Electrical limits
- Supply: 4.8–6.0 V. Do not run it from 3.3 V.
- Current: 5–6 mA when stopped, 110–130 mA running with no load, 700–800 mA when stalled.
- Signal: 3.3 V logic from an ESP32 or Pico works.

## Interface details (datasheet section 5)
- Pulse width range 700–2300 µs, sent in a 50 Hz frame (20 ms period).
- Stop at 1500 µs, with a 90 µs dead band: it stays stopped for roughly 1455–1545 µs.
- 1500 → 700 µs turns it **clockwise** and 1500 → 2300 µs **counter-clockwise** (looking at the horn). It goes faster the further the pulse is from 1500 µs.
- Driver: `speed(pct)` with pct from -100 to 100. Negative values turn it clockwise: pulse = 1500 + 8 × pct µs, so -100 gives 700 µs and +100 gives 2300 µs. duty_u16 = pulse_us × 65535 / 20000.

## Wiring
- ESP32: V+ → VIN (5 V from USB) or an external 5 V supply, GND → GND, SIG → D13.
- Pico: V+ → VBUS (pin 40) or an external 5 V supply, GND → GND, SIG → GP15.
- Raspberry Pi 4: V+ → external 5 V supply, GND → pin 6 (shared with the supply ground), SIG → pin 12 (GPIO18).
- For two wheel servos, use a separate 5–6 V supply that can give at least 1.6 A, and join its GND to the board's GND.

## Using the driver
```python
from fs90r import FS90R
import time
wheel = FS90R(13)
wheel.cw(50)     # clockwise, half speed (1100 us)
time.sleep(2)
wheel.ccw(100)   # counter-clockwise, full speed (2300 us)
time.sleep(2)
wheel.stop()     # 1500 us
```

## Gotchas
- If it creeps while you send 1500 µs, turn the trim pot in the recess on the case with a small screwdriver until it stops, or pass `stop_us=` to the driver.
- Speed is not linear. Most of the speed change happens within a few hundred µs of 1500, so it reaches close to full speed well before 700 or 2300 µs.
- On a robot the two wheel servos face opposite ways, so to drive forward one turns cw and the other ccw.
- Don't stall it or turn it by hand for long, because that can damage it. `off()` stops the pulses completely.
- If the board resets when the servo starts, power it from its own supply or add a 470 µF capacitor across V+ and GND.

## Datasheet
https://www.pololu.com/file/0J1867/FS90R.pdf
