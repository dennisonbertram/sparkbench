---
name: part-l9110s
description: Pinout, electrical limits, wiring and MicroPython driver for the L9110S dual-channel DC motor driver module (ASIC L9110). Use when designing, wiring, simulating or writing code for an L9110S in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# L9110S dual-channel motor driver (L9110S)

## Overview
The **L9110** (ASIC) is a two-input push-pull bridge for one DC motor, 800 mA continuous, 1.5–2 A peak, with built-in clamp diodes. Hobbyists buy the **L9110S 2-channel module** (HG7881-style, 29 × 23 mm): two L9110 chips, a 6-pin header and two screw terminals (MOTOR-A, MOTOR-B). It drives two small DC motors or one 4-wire bipolar stepper.

## Pinout (L9110S module, header order)
| Pin | Function |
|---|---|
| B-IA | Motor B input A |
| B-IB | Motor B input B |
| GND | Ground (common with the microcontroller) |
| VCC | Chip and motor supply, 2.5–12 V |
| A-IA | Motor A input A |
| A-IB | Motor A input B |

Some boards print B-1A / B-1B / A-1A / A-1B; same pins, same order.

## Electrical limits
- Supply VCC: 2.5–12 V (6 V typical); it is also the motor supply.
- Output: 800 mA continuous per channel, 1.5–2 A peak.
- Inputs: high ≥ 2.5 V, low ≤ 0.7 V (3.3 V and 5 V logic both work); 200–500 µA input current.
- Quiescent current ≤ 2 µA.

## Interface details
Logic table (datasheet):

| IA | IB | OA | OB | Motor |
|---|---|---|---|---|
| H | L | H | L | forward |
| L | H | L | H | reverse |
| L | L | L | L | stopped |
| H | H | L | L | stopped |

No enable pin: PWM the input that is high (other input low) for speed.

## Wiring
- ESP32: VCC → motor battery +, GND → battery − and ESP32 GND, A-IA → GPIO25, A-IB → GPIO26 (B-IA → 27, B-IB → 14).
- Pico: VCC → battery +, GND → battery − and Pico GND, A-IA → GP14, A-IB → GP15.
- Raspberry Pi 4: VCC → battery +, GND → pin 6 and battery −, A-IA → GPIO17 (pin 11), A-IB → GPIO27 (pin 13).

## Using the driver
```python
from l9110s import L9110S
motor_a = L9110S(25, 26)   # A-IA, A-IB
motor_a.forward(70)        # 70 % speed
motor_a.reverse()          # full speed backwards
motor_a.stop()
```

## Gotchas
- Join the motor supply GND to the microcontroller GND, or the inputs have no reference.
- Don't power motors from the board's 3V3 pin: use a battery pack on VCC.
- 800 mA per channel: small gear/toy motors only; a stalled motor can overheat the chip.
- If a motor spins the wrong way, swap its two wires at the screw terminal.

## Datasheet
https://www.elecrow.com/download/datasheet-l9110.pdf
