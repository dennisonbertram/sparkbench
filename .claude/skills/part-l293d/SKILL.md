---
name: part-l293d
description: Pinout, electrical limits, wiring and MicroPython driver for the L293D dual H-bridge motor driver chip (TI L293DNE, quadruple half-H driver, DIP-16). Use when designing, wiring, simulating or writing code for an L293D in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# L293D dual H-bridge motor driver (L293DNE)

## Overview
The **L293D** is four half-H drivers in one chip. Drivers 1 and 2 share the enable 1,2EN and drivers 3 and 4 share 3,4EN, so each pair is a full H-bridge: two small DC motors forwards/backwards (or one bipolar stepper), up to **600 mA per channel** (1.2 A peak for 100 us) at 4.5-36 V. The "D" version has the output clamp diodes built in, so no external flyback diodes are needed. Inputs are TTL, so 3.3 V GPIOs drive it directly. Hobbyists buy the bare **Texas Instruments L293DNE in a DIP-16 package** (ST's L293D has the same pinout) and plug it straight into a breadboard.

## Pinout (DIP-16, pin 1 next to the notch)
| Pin | Name | Function |
|---|---|---|
| 1 | 1,2EN | Enable drivers 1 and 2 (bridge 1), active high; PWM for speed |
| 2 | 1A | Driver 1 input |
| 3 | 1Y | Driver 1 output (motor 1 lead) |
| 4, 5 | GND | Ground and heat sink |
| 6 | 2Y | Driver 2 output (motor 1 other lead) |
| 7 | 2A | Driver 2 input |
| 8 | VCC2 | Motor supply, VCC1 to 36 V |
| 9 | 3,4EN | Enable drivers 3 and 4 (bridge 2), active high |
| 10 | 3A | Driver 3 input |
| 11 | 3Y | Driver 3 output (motor 2 lead) |
| 12, 13 | GND | Ground and heat sink |
| 14 | 4Y | Driver 4 output (motor 2 other lead) |
| 15 | 4A | Driver 4 input |
| 16 | VCC1 | Logic supply, 4.5-7 V (5 V) |

## Electrical limits
- VCC1 (logic): 4.5-7 V recommended (5 V). It is NOT a 3.3 V part: never run VCC1 from 3V3.
- VCC2 (motor): from VCC1 up to 36 V (absolute max 36 V).
- Inputs: high >= 2.3 V, low <= 1.5 V, absolute max 7 V.
- Output current: **600 mA continuous per channel**, 1.2 A peak (non-repetitive, <= 100 us).
- Voltage drop: high side up to 1.8 V, low side up to 1.8 V at 600 mA, so a motor sees about VCC2 - 2.6 V (typ) to VCC2 - 3.6 V (max).
- Logic supply current up to 60 mA, motor supply idle current up to 24 mA. Operating range 0-70 C.

## Interface details (datasheet function table, each driver)
| A | EN | Y |
|---|---|---|
| H | H | H |
| L | H | L |
| X | L | Z (off) |

For one bridge (motor between 1Y and 2Y):
| 1,2EN | 1A | 2A | Motor |
|---|---|---|---|
| H | H | L | Forward |
| H | L | H | Reverse |
| H | 1A = 2A | | Fast stop (brake) |
| L | X | X | Coasts to a stop |
Bridge 2 is the same with 3,4EN, 3A, 4A. In thermal shutdown all outputs go off.

## Wiring
- Power: VCC1 (pin 16) -> 5 V (ESP32 5V/VIN, Pico VBUS). VCC2 (pin 8) -> the motor supply + (VCC1 up to 36 V; Sparkbench adds a separate DC supply for it). All four GND pins (4, 5, 12, 13) -> GND, shared with the battery minus and the microcontroller GND.
- ESP32: 1,2EN -> D25, 1A -> D26, 2A -> D27 (3,4EN, 3A, 4A to any other output pins, or 3,4EN to GND if unused).
- Pico: 1,2EN -> GP2, 1A -> GP3, 2A -> GP4.
- Raspberry Pi 4: 1,2EN -> GPIO18 (pin 12), 1A -> GPIO23 (pin 16), 2A -> GPIO24 (pin 18).
- Motor 1 between 1Y (pin 3) and 2Y (pin 6); motor 2 between 3Y (pin 11) and 4Y (pin 14).
- 100 nF ceramic capacitor from VCC1 to GND and from VCC2 to GND, close to the chip; add a bulk electrolytic (e.g. 100 uF) on VCC2.

## Using the driver
```python
from l293d import L293D
m1 = L293D(26, 27, en=25)    # 1A, 2A, 1,2EN on a PWM pin
m2 = L293D(14, 12)           # 3A, 4A with 3,4EN tied to 5 V (full speed)
m1.forward(); m2.reverse()
m1.forward(60)               # 60 % speed via PWM on the enable
m1.brake(); m1.coast()
```

## Gotchas
- VCC1 needs 5 V; on 3.3 V the chip is out of spec. The inputs still accept 3.3 V logic.
- No common ground = the motor twitches or does nothing.
- The bridge drops about 2.6-3.6 V: a 6 V motor on a 6 V supply runs slowly.
- 600 mA per channel is small: motor stall current often exceeds it, and the chip gets hot. The ground pins are the heat sink; on a PCB give them copper area.
- Motors on a USB 5 V pin can brown out the microcontroller. Use a separate battery on VCC2.
- The plain L293 (no D) has no clamp diodes: add external diodes if you got that one.
- Unused enable pins must not float: tie 3,4EN to GND if bridge 2 is unused.

## Datasheet
https://www.ti.com/lit/ds/symlink/l293d.pdf
