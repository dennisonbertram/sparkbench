---
name: part-mx1508
description: Pinout, electrical limits, wiring and MicroPython driver for the MX1508 dual DC motor driver module (Mixic MX1508). Use when designing, wiring, simulating or writing code for an MX1508 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MX1508 dual DC motor driver (MX1508)

## Overview
The **MX1508** (Mixic) has two H-bridges built from P- and N-channel MOSFETs. Each bridge drives one small brushed DC motor forwards, backwards, braked or coasting. Both bridges together can drive one bipolar stepper. The chip has thermal shutdown and internal input pull-downs. Hobbyists buy the **red MX1508 2-channel module** (24.7 × 21 mm, two 100 µF capacitors). It has one supply and pads on two edges: `+ - IN1 IN2 IN3 IN4` on one edge and `MOTOR-A`, `MOTOR-B` on the other. Boards sold as MX1508 sometimes carry a TC1508A clone, which uses the same pins and the same truth table.

## Pinout (red module, pad order)
| Pin | Function |
|---|---|
| + | Supply, 2.4–7.2 V. It feeds the motor bridges directly and the logic through R1/D1 |
| - | Ground (common with the microcontroller) |
| IN1 | Motor A input A (INA1) |
| IN2 | Motor A input B (INB1) |
| IN3 | Motor B input A (INA2) |
| IN4 | Motor B input B (INB2) |
| MOTOR-A (2 pads) | Motor A terminals |
| MOTOR-B (2 pads) | Motor B terminals |

## Electrical limits
- Chip: motor supply VDD 2–9.6 V (10 V absolute max) and logic supply VCC 1.8–5 V recommended (7 V absolute max). The module joins both to `+`, so keep `+` at 2.4–7.2 V.
- Output current: about 1.35–1.5 A continuous per channel, 2 A peak. On-resistance is about 0.36 Ω (channel 1) and 0.47 Ω (channel 2).
- Inputs: high ≥ 0.6 × VCC and low ≤ 0.6 V, with about a 15 kΩ internal pull-down. An input must never be higher than VCC.
- Standby current < 0.1 µA. Thermal shutdown at about 150 °C, with hysteresis.

## Interface details
Truth table (datasheet):

| INA (IN1/IN3) | INB (IN2/IN4) | OUTA | OUTB | Motor |
|---|---|---|---|---|
| L | L | Z | Z | standby / coast |
| H | L | H | L | forward |
| L | H | L | H | reverse |
| H | H | L | L | brake |

Speed: PWM mode B is recommended. Hold one input high and PWM the other at 10–50 kHz. The motor runs while the PWM pin is low, so the duty is 100 − speed %. Mode A (PWM one input with the other low) also works, but speed follows the duty cycle less well.

## Wiring
- ESP32: + → 5 V supply or battery (≤ 5 V for 3.3 V logic), - → battery − and ESP32 GND, IN1 → GPIO25, IN2 → GPIO26 (IN3 → 27, IN4 → 14).
- Pico: + → VBUS (5 V) or battery, - → Pico GND, IN1 → GP14, IN2 → GP15 (IN3 → GP16, IN4 → GP17).
- Raspberry Pi 4: + → 5 V supply or battery, - → pin 6, IN1 → GPIO17 (pin 11), IN2 → GPIO27 (pin 13).

## Using the driver
```python
from mx1508 import MX1508
motor_a = MX1508(25, 26)   # IN1, IN2
motor_a.forward(70)        # 70 % speed (slow-decay PWM, 20 kHz)
motor_a.reverse()          # full speed backwards
motor_a.brake()            # stop hard
motor_a.coast()            # let it spin down
```

## Gotchas
- 3.3 V logic: input high needs 0.6 × VCC, so with `+` above about 5.5 V a 3.3 V GPIO may not switch the inputs. Run the module from 5 V or less in that case.
- Never take `+` above 7.2 V on this module: the chip's logic supply hangs off the same rail.
- Join `-` to the microcontroller GND. Don't power motors from the 3V3 pin.
- Small toy and gear motors only. A stalled motor trips the thermal shutdown.
- If a motor spins the wrong way, swap its two wires at the MOTOR pads.

## Datasheet
https://cdn.hackaday.io/files/1960798389043936/MX1508_Datasheet.pdf
