---
name: part-mg995
description: Pinout, electrical limits, wiring and MicroPython driver for the MG995 high-speed metal-gear servo (TowerPro MG995). Use when designing, wiring, simulating or writing code for an MG995 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MG995 high-speed metal-gear servo (MG995)

## Overview
The **TowerPro MG995** is a standard-size RC servo with metal gears and two ball bearings. Stall torque is 8.5 kgf·cm at 4.8 V (10 kgf·cm at 6 V), and it moves at 0.2 s/60° (4.8 V) or 0.16 s/60° (6 V). A 50 Hz pulse train on the signal wire sets the angle. Hobbyists buy it as the **TowerPro MG995 servo**, which has a 30 cm 3-wire lead ending in a JR/Futaba "S" female plug. TowerPro now sells the MG996R in its place, and many MG995s on sale are clones.

## Pinout (plug order, wire colours)
| Pin | Wire | Function |
|---|---|---|
| GND | brown | Ground |
| V+ | red | Servo supply, 4.8–7.2 V |
| SIG | orange | Control pulses (PWM, 50 Hz) |

## Electrical limits
- Supply: 4.8–7.2 V (datasheet). 5–6 V is the usual choice.
- Current: the datasheet gives no figure. Expect a few hundred mA while moving and up to about 2.5 A when stalled or starting under load, so size the supply for 2.5 A.
- Signal: logic-level pulses. A 3.3 V output from an ESP32 or Pico drives it.
- Temperature: 0–55 °C.

## Interface details
- Pulse every **20 ms (50 Hz)**. **1.5 ms = centre.** Total travel is about 120° (60° each way), so 1.0 ms ≈ 0° and 2.0 ms ≈ 120°.
- Dead band: 5 µs.
- Units vary. You can widen the pulse range slowly, but stop if the servo buzzes or stalls at an end, because that overheats it.
- duty_u16 = pulse_us × 65535 / 20000.

## Wiring
- ESP32: V+ → a separate 5–6 V supply that can give 2.5 A, GND → that supply's GND **and** the ESP32's GND, SIG → GPIO 13.
- Pico: V+ → separate 5 V supply, GND → GND, SIG → GP15.
- Raspberry Pi 4: V+ → a separate 5 V supply, GND → pin 6 (shared ground), SIG → GPIO18 (pin 12, hardware PWM).
- Fit a 470–1000 µF capacitor across V+ and GND close to the servo.

## Using the driver
```python
from mg995 import MG995
servo = MG995(13)    # GPIO wired to SIG
servo.angle(60)      # centre (1.5 ms)
servo.pulse_us(1200) # or set the raw pulse width
servo.off()          # stop pulses, servo goes limp
```

## Gotchas
- If the board resets or browns out when the servo moves, the supply is too weak. Use a separate supply, join the grounds and add the bulk capacitor.
- Never power it from the 3V3 pin.
- Some sellers ship a 360° continuous-rotation version under the same name. On that version the pulse sets speed and direction, not angle.
- MG995 clones are known for jitter and loose centring; a bigger capacitor and a stable 50 Hz signal help.

## Datasheet
https://www.electronicoscaldas.com/datasheet/MG995_Tower-Pro.pdf
