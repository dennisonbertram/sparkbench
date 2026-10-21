---
name: part-cytron-mdd10a
description: Pinout, electrical limits, wiring and MicroPython driver for the Cytron MDD10A dual-channel 10 A DC motor driver (Rev2.0, 5-30 V, PWM/DIR inputs per motor). Use when designing, wiring, simulating or writing code for an MDD10A in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Cytron MDD10A dual 10 A DC motor driver (MDD10A)

## Overview
The **Cytron MDD10A** is the dual-channel version of the MD10C: two full-NMOS H-bridges, each driving one brushed DC motor at up to **10 A continuous, 30 A peak (max 10 s)**, from a **5–30 V** supply (Rev2.0, shipped since Jan 2017; Rev1.0 was 5–25 V). Each motor is controlled by two logic inputs, **PWMn** (speed) and **DIRn** (direction). No heat sink needed, no logic supply pin (the board makes its own from the motor supply), two test buttons and two direction LEDs per channel, green power LED. Board 84.5 × 62 mm.

## Pinout (header by header, as printed)
5-way 2510 input header (connector included):

| Pin | Name | Function |
|---|---|---|
| 1 | GND | Ground (common with POWER −) |
| 2 | PWM2 | Motor 2 speed (PWM, ≤ 20 kHz) |
| 3 | DIR2 | Motor 2 direction |
| 4 | PWM1 | Motor 1 speed (PWM, ≤ 20 kHz) |
| 5 | DIR1 | Motor 1 direction |

6-way screw terminal:

| Pin | Name | Function |
|---|---|---|
| 1 | M1B | Motor 1 output B |
| 2 | M1A | Motor 1 output A |
| 3 | POWER+ | Motor supply + (5–30 V battery) |
| 4 | POWER− | Motor supply − |
| 5 | M2A | Motor 2 output A |
| 6 | M2B | Motor 2 output B |

## Electrical limits (manual V2.0, absolute maximum ratings)
- Power input: 5–30 V (Rev2.0). No reverse-polarity protection.
- Motor current: 10 A continuous, 30 A peak (≤ 10 s) per channel.
- Logic input high: 3–5.5 V; low: 0–0.5 V. 3.3 V GPIOs (ESP32, Pico, Raspberry Pi) drive it directly.
- PWM: up to 20 kHz; output frequency equals input frequency. TTL PWM only — **not** RC-receiver servo pulses.
- Use a battery for the motor supply: switching PSUs often shut down on the motor's regenerative current (or put a battery of the same voltage in parallel).

## Interface details
Truth table (per channel):

| PWM | DIR | Output A | Output B | Motor |
|---|---|---|---|---|
| Low | X | Low | Low | Brake (stop) |
| High | Low | High | Low | One way (A → B) |
| High | High | Low | High | Other way (B → A) |

- **Sign-magnitude** (default): PWM duty = speed, DIR = direction.
- **Locked-antiphase**: hold PWM high, feed PWM to DIR: 50 % = stop, < 50 % one way, > 50 % the other.
- There is no coast state: PWM low shorts the motor (both outputs low).

## Wiring
- Battery + → POWER+, battery − → POWER−; motor 1 → M1A/M1B, motor 2 → M2A/M2B.
- Header GND → board GND (always — common ground).
- ESP32: PWM1 → GPIO25, DIR1 → GPIO26, PWM2 → GPIO27, DIR2 → GPIO14.
- Pico: PWM1 → GP2, DIR1 → GP3, PWM2 → GP4, DIR2 → GP5.
- Raspberry Pi: PWM1 → GPIO12 (pin 32), PWM2 → GPIO13 (pin 33), DIR1/DIR2 → any GPIO.

## Using the driver
```python
from mdd10a import MDD10A
d = MDD10A(25, 26, 27, 14)   # pwm1, dir1, pwm2, dir2; 20 kHz
d.m1.speed(60)               # 60 %, A -> B
d.m2.speed(-40)              # 40 %, B -> A
d.drive(100, -100)           # spin in place
d.brake()
```

## Gotchas
- No common ground = motors twitch or ignore commands.
- Don't drive PWM above 20 kHz, and don't feed it RC servo signals.
- Reversing at full speed causes big current spikes: ramp the speed down first.
- Swap M1A/M1B if "forward" goes the wrong way.
- Never power the motors from the microcontroller board.

## Datasheet
https://docs.google.com/document/d/1ol8nICCTTw5dAHHE_hju08cCVH2GN5_Y3cGC6B4Gbas/edit (Cytron MDD10A User's Manual V2.0)
