---
name: part-mg996r
description: Pinout, electrical limits, wiring and MicroPython driver for the MG996R high-torque metal-gear servo (TowerPro MG996R). Use when designing, wiring, simulating or writing code for an MG996R in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MG996R high-torque metal-gear servo (MG996R)

## Overview
The **TowerPro MG996R** is a standard-size RC servo with metal gears and two ball bearings. Stall torque is 9.4 kgf·cm at 4.8 V (11 kgf·cm at 6 V), and it moves at 0.17 s/60° (4.8 V). A 50 Hz pulse train on the signal wire sets the angle. Hobbyists buy it as the **TowerPro MG996R servo**, which has a 30 cm 3-wire lead ending in a JR/Futaba "S" female plug.

## Pinout (plug order, wire colours)
| Pin | Wire | Function |
|---|---|---|
| GND | brown | Ground |
| V+ | red | Servo supply, 4.8–6.6 V |
| SIG | orange | Control pulses (PWM, 50 Hz) |

## Electrical limits
- Supply: 4.8–6.6 V (TowerPro). The distributor's datasheet allows up to 7.2 V, but stay at or below 6.6 V.
- Current: about 10 mA idle and 170 mA moving with no load (TowerPro). Under load it draws 500–900 mA, and the stall current is 1.4–2.5 A.
- Signal: logic-level pulses. A 3.3 V output from an ESP32 or Pico drives it.
- Temperature: 0–55 °C.

## Interface details
- Pulse every **20 ms (50 Hz)**. **1.5 ms = centre.** Total travel is about 120° (60° each way), so 1.0 ms ≈ 0° and 2.0 ms ≈ 120°.
- Dead band: 5 µs (datasheet; TowerPro quotes 1 µs).
- Units vary. TowerPro says its own unit turns 0–159°, and measured units have accepted roughly 0.77–2.19 ms. You can widen the range slowly, but stop if the servo buzzes or stalls at an end, because that overheats it.
- duty_u16 = pulse_us × 65535 / 20000.

## Wiring
- ESP32: V+ → a separate 5–6 V supply that can give 2.5 A, GND → that supply's GND **and** the ESP32's GND, SIG → GPIO 13.
- Pico: V+ → separate 5 V supply (VBUS only for a light load), GND → GND, SIG → GP15.
- Raspberry Pi 4: V+ → a separate 5 V supply, GND → pin 6 (shared ground), SIG → GPIO18 (pin 12, hardware PWM).
- Fit a 470–1000 µF capacitor across V+ and GND close to the servo.

## Using the driver
```python
from mg996r import MG996R
servo = MG996R(13)   # GPIO wired to SIG
servo.angle(60)      # centre (1.5 ms)
servo.pulse_us(1200) # or set the raw pulse width
servo.off()          # stop pulses, servo goes limp
```

## Gotchas
- If the board resets or browns out when the servo moves, the supply is too weak. Use a separate supply, join the grounds and add the bulk capacitor.
- Never power it from the 3V3 pin.
- Some sellers ship a 360° continuous-rotation version under the same name. On that version the pulse sets speed and direction, not angle.
- Many clones exist, so the real travel and end-stop pulse widths vary from unit to unit.

## Datasheet
https://www.electronicoscaldas.com/datasheet/MG996R_Tower-Pro.pdf (manufacturer page: https://www.towerpro.com.tw/product/mg996r/)
