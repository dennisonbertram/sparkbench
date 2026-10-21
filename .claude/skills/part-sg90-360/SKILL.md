---
name: part-sg90-360
description: Pinout, electrical limits, wiring and MicroPython driver for the SG90 360-degree continuous-rotation micro servo (ProtoSupplies "Servo Motor Micro SG90 360 Degree Continuous Rotation" and identical clones). Use when designing, wiring, simulating or writing code for an SG90 360 / continuous SG90 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build, e.g. small robot wheels.
---

# SG90 360° continuous-rotation micro servo (SG90 360)

## Overview
The **SG90 360** is a 9 g SG90-size servo with no end stop and no position feedback, so it spins all the way round like a geared motor. The control pulse sets **speed and direction**, not angle. About 110–120 RPM at 4.8–5 V and 1.3–1.7 kgf·cm stall torque. Hobbyists buy it as, for example, the ProtoSupplies "Servo Motor Micro SG90 360 Degree Continuous Rotation": the bare servo with a 25 cm 3-wire lead ending in a female 2.54 mm JR/Futaba plug, plus horns and screws.

## Pinout (3-wire lead, connector order)
| Pin | Wire | Function |
|---|---|---|
| GND | Brown | Ground |
| V+ | Red | Supply 4.8–6 V (5 V typical) |
| PWM | Orange | Control pulse, 50 Hz |

## Electrical limits
- Supply: 4.8–6 V. Do not run it from the 3.3 V pin.
- Current: about 10 mA idle, 110–250 mA moving, up to 300 mA stalled.
- Signal: 3.3 V logic from an ESP32 or Pico works.

## Interface details
- 50 Hz frame (20 ms period). duty_u16 = pulse_us × 65535 / 20000.
- ~1500 µs = stop (stop zone roughly 1420–1580 µs per ProtoSupplies; it varies per unit).
- 1000 µs = full speed clockwise, 2000 µs = full speed anticlockwise (Smarthon table); speed rises with distance from 1500 µs.
- No pulses = stopped and idle.

## Wiring
- ESP32: V+ → VIN (5 V from USB) or a separate 5 V supply, GND → GND, PWM → D13.
- Pico: V+ → VBUS (pin 40) or a separate 5 V supply, GND → GND, PWM → GP15.
- Raspberry Pi 4: V+ → pin 2 (5 V), GND → pin 6, PWM → pin 12 (GPIO18).
- With an external supply, always join its GND to the board's GND.

## Using the driver
```python
from sg90_360 import SG90_360
import time
m = SG90_360(13)
m.speed(-100)   # full speed clockwise (1000 us)
time.sleep(2)
m.speed(50)     # half speed anticlockwise (1750 us)
time.sleep(2)
m.stop()        # 1500 us
m.off()         # no pulses
```

## Gotchas
- It looks the same as the 180° SG90; angle code just makes it spin. Check the sticker.
- If it creeps when "stopped", calibrate: SG90_360(13, stop_us=1490) etc., or call off().
- Direction can be reversed on some clones; test before building a robot around it.
- Add a 470 µF capacitor across V+ and GND if the board resets when the motor starts.

## Datasheet
https://www.electrokit.com/upload/quick/af/0f/1324_41013137-tds.pdf
