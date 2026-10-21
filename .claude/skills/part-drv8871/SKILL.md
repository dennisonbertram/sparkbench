---
name: part-drv8871
description: Pinout, electrical limits, wiring and MicroPython driver for the DRV8871 3.6 A brushed DC motor driver breakout (TI DRV8871, Adafruit #3190). Use when designing, wiring, simulating or writing code for a DRV8871 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# DRV8871 brushed DC motor driver (DRV8871)

## Overview
The **DRV8871** from TI is a single H-bridge for one brushed DC motor: forwards, backwards, braked or coasting, 6.5–45 V, 3.6 A peak. It senses current inside the chip, so a single resistor sets the current limit. It also has over-current, over-temperature and under-voltage protection. There are only two logic inputs and no sleep pin: holding both inputs low puts the chip to sleep. The chip runs from the motor supply alone and takes 3.3 V logic directly. Hobbyists buy it as the **Adafruit DRV8871 DC Motor Driver Breakout Board - 3.6A Max (#3190)**. The board has a 30 kΩ current-limit resistor (about 2.1 A), a 22 µF bulk capacitor, and two 3.5 mm screw terminals (MOTOR and POWER).

## Pinout (Adafruit #3190)
4-pin header, left to right as printed on the board, then the MOTOR terminal on the opposite edge:

| Pin | Function |
|---|---|
| IN2 | Logic input 2 → OUT2 (100 kΩ pull-down) |
| IN1 | Logic input 1 → OUT1 (100 kΩ pull-down) |
| VM | Motor supply 6.5–45 V (same net as POWER +) |
| GND | Ground (same net as POWER −) |
| OUT2, OUT1 | MOTOR screw terminal (marked 2 / 1) |

Because the header and the screw terminals are on opposite edges, Sparkbench wires this board with jumper leads.

## Electrical limits
- VM: 6.5–45 V recommended (absolute max 50 V). Under-voltage lockout at 6.1–6.4 V, so it will **not** run from 5 V.
- Logic inputs: high ≥ 1.5 V, low ≤ 0.5 V, 0–5.5 V (absolute max 7 V). 3.3 V GPIOs are fine. PWM up to 200 kHz.
- Current: 3.6 A peak, about 2 A RMS continuous. Over-current trip 3.7–6.4 A, then a 3 ms retry.
- Current limit: ITRIP = 64 kV / RILIM (datasheet Eq. 1). The board's 30 kΩ gives about 2.1 A (59–69 kV spread: 1.97–2.3 A).
- Supply current: 3 mA typical (10 mA max) running, under 10 µA asleep.
- Sleep after both inputs are low for about 1 ms. It wakes 50 µs after an input goes high.

## Interface details (datasheet Table 1)
| IN1 | IN2 | OUT1 | OUT2 | Motor |
|---|---|---|---|---|
| 0 | 0 | Hi-Z | Hi-Z | Coast (then sleep) |
| 0 | 1 | L | H | Reverse |
| 1 | 0 | H | L | Forward |
| 1 | 1 | L | L | Brake (slow decay) |

Speed control with PWM: forward drive/brake = IN1 high, PWM on IN2 (the motor drives while IN2 is low). Forward drive/coast = PWM on IN1, IN2 low. Reverse is the same with the pins swapped.

## Wiring
- Power: supply + → POWER + terminal (or VM), supply − → POWER −, and board GND → microcontroller GND.
- Motor → MOTOR terminal (OUT1/OUT2).
- ESP32: IN2 → D25, IN1 → D26.
- Pico: IN2 → GP2, IN1 → GP3.
- Raspberry Pi 4: IN1 → GPIO17 (pin 11), IN2 → GPIO27 (pin 13).

## Using the driver
```python
from drv8871 import DRV8871
m = DRV8871(26, 25)     # IN1, IN2 (ESP32 wiring above)
m.forward()             # full speed
m.reverse(60)           # 60 %, drive/brake PWM at 20 kHz
m.brake(); m.coast()    # coast also lets the chip sleep
m.drive(-30)            # -100..100
```

## Gotchas
- Nothing happens? VM is below 6.5 V (a USB 5 V supply is too low) or the grounds are not joined.
- If you use an external supply, never connect VM to the microcontroller: the supply voltage would reach the microcontroller board.
- Never put VM on an input pin: inputs take at most 5.5 V.
- The motor stops and restarts every few ms under load? It is hitting the 2.1 A current limit or over-current protection. Use a smaller motor or change RILIM (minimum 15 kΩ).
- At full current the chip gets hot. 2 A continuous is the practical limit on this small board.

## Datasheet
https://www.ti.com/lit/ds/symlink/drv8871.pdf
