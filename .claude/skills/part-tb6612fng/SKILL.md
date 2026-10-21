---
name: part-tb6612fng
description: Pinout, electrical limits, wiring and MicroPython driver for the TB6612FNG dual DC motor driver (Toshiba TB6612FNG). Use when designing, wiring, simulating or writing code for a TB6612FNG in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# TB6612FNG dual DC motor driver (TB6612FNG)

## Overview
The **TB6612FNG** from Toshiba is a dual H-bridge with low-resistance MOSFET outputs (0.5 Ω upper + lower): two independent channels, each running a DC motor clockwise, counter-clockwise, short-braked or coasting, at 1.2 A average (3.2 A peak) per channel, with PWM speed control up to 100 kHz. It wastes far less power than an L298N and works from 3.3 V logic. Hobbyists buy it as the **SparkFun Motor Driver - Dual TB6612FNG (1A)**, ROB-14450 (ROB-14451 with headers), and as purple/red clone modules with the same labels.

## Pinout (SparkFun ROB-14450, header order)
| Pin | Function |
|---|---|
| GND | Ground (all three GND pins are joined) |
| B01, B02 | Motor B outputs |
| A02, A01 | Motor A outputs |
| GND (GND2 in Sparkbench) | Ground |
| VCC | Logic supply, 2.7–5.5 V |
| VM | Motor supply, 2.5–13.5 V |
| PWMA | Channel A speed (PWM) |
| AIN2, AIN1 | Channel A direction |
| STBY | Standby: low = all off, high = run (shared) |
| BIN1, BIN2 | Channel B direction |
| PWMB | Channel B speed (PWM) |
| GND (GND3 in Sparkbench) | Ground |

The two 8-pin rows are GND B01 B02 A02 A01 GND VCC VM and PWMA AIN2 AIN1 STBY BIN1 BIN2 PWMB GND.

## Electrical limits
- VCC: 2.7–5.5 V (absolute max 6 V), 1.1–1.8 mA running, < 1 µA in standby.
- VM: 2.5–13.5 V operating (absolute max 15 V).
- Inputs: high ≥ 0.7 × VCC, low ≤ 0.3 × VCC, −0.2 to 6 V absolute. Each has a 200 kΩ pull-down inside.
- Output current per channel: 1.2 A average (VM ≥ 4.5 V), 0.4 A when VM is 2.5–4.5 V, 2 A for 20 ms at ≤ 20 % duty, 3.2 A for a single 10 ms pulse.
- PWM up to 100 kHz. Thermal shutdown at about 175 °C, under-voltage lockout at about 1.9 V.

## Interface details (datasheet H-SW control function)
| IN1 | IN2 | PWM | STBY | OUT1 / OUT2 | Mode |
|---|---|---|---|---|---|
| H | H | X | H | L / L | Short brake |
| L | H | H | H | L / H | CCW |
| H | L | H | H | H / L | CW |
| H or L (one high) | | L | H | L / L | Short brake |
| L | L | H | H | off (Hi-Z) | Stop (coast) |
| X | X | X | L | off (Hi-Z) | Standby |

Speed control: set the direction on IN1/IN2 and PWM the PWM pin; each low phase is a short brake.

## Wiring
- Power: VCC → board 3V3, VM → motor battery + (or 5 V USB for tiny motors), every GND → board GND and battery −.
- ESP32: AIN1 → D25, AIN2 → D26, PWMA → D27, STBY → D14 (channel B to any other output pins).
- Pico: AIN1 → GP2, AIN2 → GP3, PWMA → GP4, STBY → GP5.
- Raspberry Pi 4: AIN1 → GPIO17 (pin 11), AIN2 → GPIO27 (pin 13), PWMA → GPIO18 (pin 12), STBY → GPIO22 (pin 15).

## Using the driver
```python
from tb6612fng import TB6612FNG
a = TB6612FNG(25, 26, 27, stby=14)   # AIN1, AIN2, PWMA, STBY
b = TB6612FNG(32, 33, 13, stby=14)   # BIN1, BIN2, PWMB share STBY
a.forward(75); b.reverse(40)         # speed in %
a.brake(); b.stop()                  # short brake / coast
a.standby()                          # both channels off
```

## Gotchas
- STBY and PWMx are pulled low inside: leave either unconnected and the motor never moves.
- Power VCC from 3.3 V when the microcontroller is 3.3 V: on 5 V VCC a 3.3 V high (needs ≥ 3.5 V) is out of spec.
- No common ground = motors twitch or do nothing.
- Motor start-up current from USB 5 V can brown out and reset the board; use a separate battery for VM.
- The chip is tiny with no heatsink: keep each channel at 1.2 A or less; it shuts down when hot and restarts after cooling.
- VM over 13.5 V (e.g. a 4S LiPo or 12 V lead-acid on charge) is out of range.

## Datasheet
https://toshiba.semicon-storage.com/info/docget.jsp?did=10660&prodName=TB6612FNG
