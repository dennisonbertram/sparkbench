---
name: part-cytron-md10c
description: Pinout, electrical limits, wiring and MicroPython driver for the Cytron MD10C R3.0 13 A DC motor driver (single H-bridge, PWM + DIR inputs). Use when designing, wiring, simulating or writing code for an MD10C in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Cytron MD10C 13 A DC motor driver (MD10C)

## Overview
The **Cytron MD10C R3.0** is a single-channel driver for one brushed DC motor: a full NMOS H-bridge (no heatsink needed) controlled by two logic pins, **PWM** (speed) and **DIR** (direction). It runs from the motor supply alone (5–30 V), handles 13 A continuously and 30 A for up to 10 s, and takes 3.3 V or 5 V logic. On board: a power LED, two direction LEDs (A, B) and two test buttons that spin the motor without a controller.

## Pinout (MD10C R3.0)
3-pin control header (numbers printed on the board, pin 1 at the bottom):

| Pin | Name | Function |
|---|---|---|
| 1 | GND | Logic ground |
| 2 | PWM | Speed input, up to 20 kHz (high = drive, low = brake) |
| 3 | DIR | Direction input (low = forward, high = reverse) |

Screw terminals on the opposite edge: **POWER** 1 = + (5–30 V), 2 = − ; **MOTOR** 3 = A, 4 = B.

## Electrical limits
- Motor supply: 5–30 V DC. **No reverse-polarity protection.**
- Current: 13 A continuous (25 °C, no heatsink/airflow), 30 A peak for at most 10 s.
- Logic inputs: high 3–5.5 V, low 0–0.5 V. 3.3 V GPIOs work directly.
- PWM: up to 20 kHz; the output frequency equals the input frequency. Not for RC-receiver pulses.

## Interface details (Cytron truth table)
| PWM | DIR | Output A | Output B | Motor |
|---|---|---|---|---|
| 0 | X | Low | Low | Brake |
| 1 | 0 | High | Low | Forward (A → B) |
| 1 | 1 | Low | High | Reverse (B → A) |

- Sign-magnitude: PWM duty on PWM = speed, DIR = direction (used by the driver).
- Locked-antiphase: PWM held high, PWM signal on DIR; 50 % = stop, below/above 50 % = either direction.
- There is no coast state: PWM low always brakes.

## Wiring
- Power: battery + → POWER 1 (+), battery − → POWER 2 (−), motor → MOTOR A/B. Header GND → board GND.
- ESP32: PWM → D25, DIR → D26, GND → GND.
- Pico: PWM → GP2, DIR → GP3, GND → GND.
- Raspberry Pi 4: PWM → GPIO18 (pin 12), DIR → GPIO23 (pin 16), GND → pin 6.

## Using the driver
```python
from md10c import MD10C
m = MD10C(25, 26)      # PWM pin, DIR pin; 10 kHz by default (max 20 kHz)
m.forward(60)          # 60 %
m.reverse(30)
m.drive(-80)           # -100..100
m.brake()
```

## Gotchas
- Never power the motor from the microcontroller; the board takes its power from POWER + only.
- Swapped battery leads destroy the board (no polarity protection).
- No common ground = the inputs float relative to the driver and the motor twitches.
- If the motor turns the "wrong" way, swap the MOTOR A/B wires or invert DIR in code.
- Change direction at low speed or after braking to spare the motor and supply.

## Datasheet
https://robu.in/wp-content/uploads/2014/12/MD10C-Rev3.0-Users-Manual.pdf
