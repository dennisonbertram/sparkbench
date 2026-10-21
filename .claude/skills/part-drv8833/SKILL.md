---
name: part-drv8833
description: Pinout, electrical limits, wiring and MicroPython driver for the DRV8833 dual H-bridge motor driver breakout (TI DRV8833). Use when designing, wiring, simulating or writing code for a DRV8833 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# DRV8833 dual H-bridge motor driver (DRV8833)

## Overview
The **DRV8833** from TI is a dual H-bridge with low-resistance MOSFETs (360 mΩ high + low side): two small DC motors forwards, backwards, braked or coasting, or one bipolar stepper. It has over-current, over-temperature and under-voltage protection, a fault output and a sleep pin. The chip runs from the motor supply alone and takes 3.3 V logic directly. Hobbyists buy it as the **Adafruit DRV8833 DC/Stepper Motor Driver Breakout Board (#3297)**. It has 0.2 Ω sense resistors (1 A limit per bridge) and a VMotor screw terminal with reverse-polarity protection.

## Pinout (Adafruit #3297)
Logic header (top to bottom), then the opposite edge from the bottom up:

| Pin | Function |
|---|---|
| VM | Motor supply 2.7–10.8 V (not polarity-protected; the VMotor terminal is) |
| GND | Ground: motor supply and microcontroller |
| FLT | nFAULT, open-drain, low on a fault (needs a pull-up) |
| BIN1, BIN2 | Bridge B inputs |
| SLP | nSLEEP: high = run. 500 kΩ pull-down, so the chip sleeps if this is left open |
| AIN2, AIN1 | Bridge A inputs |
| AOUT1, AOUT2 | Motor A |
| BOUT2, BOUT1 | Motor B |
| AS, BS | Current-sense nodes (0.2 Ω to GND fitted). Leave them open |

## Electrical limits
- VM: 2.7–10.8 V recommended (absolute max 11.8 V). Under-voltage lockout at about 2.6 V. Below 5 V the bridges have more resistance and give less current.
- Logic inputs: high ≥ 2 V, low ≤ 0.7 V, max 5.75 V. nSLEEP high ≥ 2.5 V. 3.3 V GPIOs are fine.
- Current: 1.5 A RMS / 2 A peak per bridge (HTSSOP). The board's 0.2 Ω sense resistors chop at 0.2 V / R = 1 A.
- Supply current: 1.7 mA typical (3 mA max) running, 1.6 µA asleep.
- Wake-up time after SLP goes high: up to 1 ms.

## Interface details (datasheet Table 1 / Table 2)
| xIN1 | xIN2 | Outputs | Motor |
|---|---|---|---|
| 0 | 0 | Hi-Z | Coast (fast decay) |
| 0 | 1 | L / H | Reverse |
| 1 | 0 | H / L | Forward |
| 1 | 1 | L / L | Brake (slow decay) |

Speed control with PWM: forward slow decay = IN1 high, PWM IN2 (the motor drives while IN2 is low). Forward fast decay = PWM IN1, IN2 low. Reverse is the same with the pins swapped.

## Wiring
- Power: battery + → VMotor terminal + (or VM), battery − → GND, and GND → board GND.
- ESP32: SLP → D25, AIN2 → D26, AIN1 → D27 (BIN1/BIN2 to any other output pins).
- Pico: SLP → GP2, AIN2 → GP3, AIN1 → GP6.
- Raspberry Pi 4: SLP → GPIO17 (pin 11), AIN1 → GPIO27 (pin 13), AIN2 → GPIO22 (pin 15).
- If you have no spare GPIO, wire SLP to 3V3. If you tie SLP to VM above 6.5 V, put a 20–75 kΩ resistor in series.

## Using the driver
```python
from drv8833 import DRV8833
a = DRV8833(27, 26, slp=25)   # AIN1, AIN2, SLP (wakes the chip)
b = DRV8833(14, 12)           # BIN1, BIN2 (SLP is shared, already high)
a.forward(); b.reverse(60)    # speed in %, slow-decay PWM
a.brake(); b.coast()
a.sleep()                     # both bridges off, about 1.6 µA
```

## Gotchas
- Nothing happens? SLP is low or floating. The chip ships asleep because of its pull-down.
- If the grounds are not connected, the motors behave erratically.
- Motor start-up current from USB 5 V can brown out the microcontroller. Use a separate battery.
- Never put VM (up to 10.8 V) on an input pin: inputs take at most 5.75 V.
- FLT going low means overcurrent, overheating or a sagging supply. The chip retries by itself.

## Datasheet
https://www.ti.com/lit/ds/symlink/drv8833.pdf
