---
name: part-vibration-motor-module
description: Pinout, electrical limits, wiring and MicroPython code for the coin vibration motor module (DFRobot Gravity Vibration Motor Module DFR0440). Use when designing, wiring, simulating or writing code for a vibration motor module in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Vibration motor module (DFR0440)

## Overview
A **coin vibration motor** (the kind that buzzes a phone) on a small board with its own transistor driver. Hobbyists buy it as the **DFRobot Gravity Vibration Motor Module (DFR0440)**. Per the DFRobot schematic (V1.0), Signal goes through a **1 kΩ** resistor to the base of an **8050 NPN** transistor (10 kΩ base pull-down to GND). The transistor switches the motor, which runs from **+5 V through a 10 Ω** resistor and has a **1N4148 flyback diode** across it. Control mode: high/low level or PWM.

## Pinout (DFR0440, Gravity connector order)
| Pin | Function |
|---|---|
| Signal | Control input: high = vibrate, low/unconnected = off, PWM = strength |
| VCC | 5 V motor supply |
| GND | Ground |

## Electrical limits
- Supply: 5 V (DFRobot spec "Operating voltage: 5V"). At 3.3 V the motor is weak or fails to start.
- Motor current: tens of mA (about 80 mA at most) from VCC, limited by the 10 Ω series resistor. DFRobot does not give a figure.
- The Signal pin draws only about 2.5 mA at 3.3 V ((3.3 − 0.7 V) / 1 kΩ), so any 3.3 V GPIO can drive it safely.

## Interface details
- Plain digital output: `Pin.value(1)` = vibrate, `Pin.value(0)` = stop. No driver library needed.
- Strength: `machine.PWM(Pin(n), freq=1000, duty_u16=...)`. Very low duty may not overcome the motor's starting friction.

## Wiring
- ESP32: VCC → VIN/5V, GND → GND, Signal → D25.
- Pico: VCC → VBUS (pin 40), GND → GND, Signal → GP2.
- Raspberry Pi 4: VCC → pin 2 (5 V), GND → pin 6, Signal → pin 18 (GPIO24).
- The board has a 2 mm PH2.0 Gravity socket. Use the supplied Gravity-to-Dupont cable (green = Signal, red = VCC, black = GND).

## Using it
```python
from machine import Pin, PWM
import time
motor = Pin(25, Pin.OUT, value=0)  # Signal
motor.value(1); time.sleep(0.5); motor.value(0)   # one buzz
pwm = PWM(Pin(25), freq=1000, duty_u16=40000)     # gentler buzz
```

## Gotchas
- Powering VCC from 3.3 V gives a weak or no buzz. It needs 5 V.
- Motor brushes make electrical noise. Keep the motor away from analog sensor wires, and share GND.
- Do not wire a bare coin motor straight to a GPIO. This module exists because the motor needs far more current than a pin can give.

## Datasheet
https://dfimg.dfrobot.com/wiki/17591/DFR0440_vibration-motor-module_schematics_V1.0.pdf (schematic); product wiki https://wiki.dfrobot.com/dfr0440/
