---
name: part-drv8834
description: Pinout, electrical limits, wiring and MicroPython driver for the DRV8834 low-voltage stepper motor driver carrier (TI DRV8834, STEP/DIR/SLP, 2.5-10.8 V). Use when designing, wiring, simulating or writing code for a DRV8834 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# DRV8834 low-voltage stepper motor driver (DRV8834)

## Overview
The **DRV8834** from Texas Instruments drives one bipolar stepper motor from a **low** supply (2.5–10.8 V), for example small steppers run from batteries or 5 V. It has a built-in indexer: each pulse on STEP moves the motor one (micro)step, and DIR sets the direction. It does full, 1/2, 1/4, 1/8, 1/16 and 1/32 microstepping with only two mode pins (M0 is tri-level), and it limits coil current with a chopper set by a trimpot. It is protected against over-current, over-temperature and under-voltage, and reports faults on nFAULT. Hobbyists buy it as the **Pololu DRV8834 Low-Voltage Stepper Motor Driver Carrier (#2134, or #2874 with headers soldered)**, which has the same size and 16-pin layout as the A4988/DRV8825 carriers.

## Pinout (Pololu #2134, header order)
Logic side from the top (EN) down, then the motor side from the top (VMOT, opposite EN) down, as printed on the board:

| Pin | Function |
|---|---|
| EN | nENBL, active low. 200 kΩ pull-down in the chip, so the outputs are on if it is left open |
| M0 | Microstep select, **tri-level** (low, high or floating). Floating by default |
| M1 | Microstep select (200 kΩ pull-down) |
| (CFG) | Not connected unless a solder jumper is bridged (then the chip's CONFIG pin) |
| (REF) | Not connected unless a solder jumper is bridged (then the VREF current-limit voltage) |
| SLP | nSLEEP, active low. **500 kΩ pull-down**: must be driven high |
| STEP | Each rising edge = one (micro)step |
| DIR | Direction, read on each STEP rising edge |
| VMOT | Motor supply 2.5–10.8 V (also powers the chip) |
| GND | Motor supply ground (next to VMOT) |
| B2, B1 | Motor coil B |
| A1, A2 | Motor coil A |
| FLT | nFAULT output (open drain through 1.5 kΩ, 10 kΩ to SLP on the board) |
| GND (GND2) | Logic ground (bottom pin, next to FLT) |

There is **no logic supply pin** and **no RESET pin**.

## Electrical limits
- VMOT 2.5–10.8 V (absolute max 11.8 V, including spikes). Under-voltage lockout below about 2.4 V.
- Logic inputs: high ≥ 2 V (SLP ≥ 2.5 V), low ≤ 0.7 V (SLP ≤ 0.5 V), max 5.75 V. 3.3 V and 5 V microcontrollers both work directly.
- Coil current: 1.5 A RMS per coil continuous, about 2 A peak (over-current trip from 2 A). ITRIP = VREF / (5 × Rsense). With the board's 0.100 Ω sense resistors: current limit = 2 × VREF (1 A → VREF 0.5 V).
- VMOT current with the motor idle: up to 4 mA. A few µA in sleep.

## Interface details
- STEP: at least 1.9 µs high and 1.9 µs low, up to 250 kHz. DIR, M0 and M1 need 200 ns setup and 1 µs hold around the STEP rising edge (they are latched on it).
- Microstep table (M1 M0): 0 0 full, 0 1 1/2, 0 Z 1/4, 1 0 1/8, 1 1 1/16, 1 Z 1/32 (Z = M0 floating; on a microcontroller set M0's GPIO as an input with no pull). Left open the board is in **1/4 step**: 800 STEP pulses per turn of a 200-step motor.
- After SLP goes high, wait 1 ms before you send STEP pulses. Sleep resets the indexer to its home position (45°).
- EN high turns the output stage off; the indexer still counts STEP pulses.
- Over-current: the bridge turns off and FLT goes low, then it retries after about 1.2 ms on its own.

## Wiring
- Power: a separate 2.5–10.8 V supply to VMOT and the GND next to it, with a ≥ 47 µF electrolytic capacitor across them at the board. Bottom GND (GND2) → microcontroller GND. Join all grounds.
- ESP32: SLP → D26, STEP → D27, DIR → D13 (optional M0 → D14, M1 → D33).
- Pico: SLP → GP3, STEP → GP6, DIR → GP7.
- Raspberry Pi 4: STEP → GPIO17 (pin 11), DIR → GPIO27 (pin 13), SLP → GPIO22 (pin 15).
- Alternative from Pololu's minimal wiring: tie FLT to 3V3; the board's 10 kΩ then pulls SLP high, so only STEP and DIR need GPIOs.
- Motor: one coil to A1/A2, the other to B1/B2. The two wires of a coil show a few ohms between them on a multimeter.

## Using the driver
```python
from drv8834 import DRV8834, vref_for_current
m = DRV8834(27, 13, slp=26)            # STEP, DIR, SLP (ESP32 wiring above)
m.step(800)                            # one turn of a 1.8° motor at the default 1/4 step
m.step(-800, delay_us=2000)            # back, slower
print(vref_for_current(1.0))           # 0.5 V trimpot voltage for 1 A (0.1 Ω board)
# With mode pins wired: DRV8834(27, 13, slp=26, m0=14, m1=33).set_microstep(32)
```

## Gotchas
- Motor does nothing? SLP must be high (it is pulled low in the chip, unlike the A4988 carrier), and VMOT must be on: the logic is powered from it.
- Not for 12 V systems: 12 V exceeds the 11.8 V absolute maximum. Use a DRV8825 or A4988 for 12–24 V.
- Microstep modes 1/4 and 1/32 need M0 **floating**, not low. Driving M0 low from a GPIO gives full or 1/8 step instead.
- Dropping it into an A4988 socket: the bottom-right pin is FLT, not VDD (safe thanks to the 1.5 kΩ, and it then pulls SLP up). The pins in the A4988's MS3 and RESET positions are unconnected.
- Never plug or unplug the motor while VMOT is on. It destroys the chip.
- Without the bulk capacitor on VMOT, an LC spike at power-on can exceed 11.8 V even from a 9 V supply.
- Turn the trimpot down before the first run. In full step the coil current is about 71 % of the limit.

## Datasheet
https://www.ti.com/lit/ds/symlink/drv8834.pdf
