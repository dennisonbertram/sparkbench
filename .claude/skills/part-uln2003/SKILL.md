---
name: part-uln2003
description: Pinout, electrical limits, wiring and MicroPython driver for the ULN2003 stepper motor driver board with the 28BYJ-48 stepper (TI ULN2003A). Use when designing, wiring, simulating or writing code for a ULN2003 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# ULN2003 stepper motor driver board (ULN2003A)

## Overview
The **ULN2003A** from TI is seven Darlington low-side switches (50 V, 500 mA per channel) with built-in flyback diodes. Input high = that output sinks current. Hobbyists buy it on the small green/blue **ULN2003 stepper motor driver board** that comes with the **28BYJ-48** 5 V unipolar stepper. Four channels drive the four motor coils, and each channel has an LED (A-D).

## Pinout (board header order)
| Pin | Function |
|---|---|
| IN1 | Coil 1 (LED A), high = on |
| IN2 | Coil 2 (LED B) |
| IN3 | Coil 3 (LED C) |
| IN4 | Coil 4 (LED D) |
| GND | Power header "-": ground, shared with the microcontroller |
| VCC | Power header "+" (marked 5-12V): motor supply to the red common wire and the COM clamp pin |
The motor plugs into the 5-pin white JST-XH socket. The ON/OFF jumper connects VCC to the motor.

## Electrical limits
- VCC: 5-12 V on the board. Match the motor: **5 V for the 5 V 28BYJ-48** (12 V versions exist).
- Per channel: up to 500 mA, 50 V. VCE(sat) is about 1 V at 200 mA.
- Inputs: 2.7 kΩ series resistor on chip. ON needs at least 2.7 V at 250 mA, so 3.3 V GPIOs work.
- 28BYJ-48 (5 V): about 240 mA with two coils on. 64:1 gearbox (63.68:1 actual), so about 4096 half-steps per output turn. Idle in-traction frequency is above 600 Hz.

## Interface details
Drive IN1..IN4 with the 8-step half-step sequence: 1000, 1100, 0100, 0110, 0010, 0011, 0001, 1001. Run the table backwards to turn the other way. Full-step (two coils on at a time) is 1100, 0110, 0011, 1001: it gives more torque but half the resolution. Coils stay on after the last step, which holds the shaft in place. All inputs low = the motor is free and draws no current.

## Wiring
- Power: 5 V supply + → VCC, − → GND, and GND → board GND. A Pico/ESP32 VBUS/5V pin can run one 28BYJ-48 from a good USB supply, but a separate 5 V source is safer.
- ESP32: IN1 → D25, IN2 → D26, IN3 → D27, IN4 → D13.
- Pico: IN1 → GP2, IN2 → GP3, IN3 → GP6, IN4 → GP7.
- Raspberry Pi 4: IN1 → GPIO17 (pin 11), IN2 → GPIO18 (pin 12), IN3 → GPIO27 (pin 13), IN4 → GPIO22 (pin 15).

## Using the driver
```python
from uln2003 import ULN2003Stepper
m = ULN2003Stepper(25, 26, 27, 13)   # IN1, IN2, IN3, IN4 in order
m.step(512)        # half-steps; negative = reverse
m.rotate(-90)      # output shaft degrees
m.release()        # coils off when idle
```

## Gotchas
- Arduino's `Stepper` library needs the pins as IN1, IN3, IN2, IN4. This driver takes them as IN1, IN2, IN3, IN4, because it uses the sequence above.
- Steps faster than about 2 ms make the motor buzz or skip steps.
- Holding current heats the motor. Call `release()` when nothing has to hold position.
- No shared GND means the motor does not move.
- Feeding 12 V into a 5 V 28BYJ-48 overheats it, even though the board says 5-12V.

## Datasheet
https://www.ti.com/lit/ds/symlink/uln2003a.pdf
