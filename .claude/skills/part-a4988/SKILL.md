---
name: part-a4988
description: Pinout, electrical limits, wiring and MicroPython driver for the A4988 stepper motor driver carrier (Allegro A4988, STEP/DIR/EN). Use when designing, wiring, simulating or writing code for an A4988 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# A4988 stepper motor driver (A4988)

## Overview
The **A4988** from Allegro drives one bipolar stepper motor (for example a NEMA 17). It has a built-in translator: each pulse on STEP moves the motor one step, and DIR sets the direction. It does full, 1/2, 1/4, 1/8 and 1/16 microstepping, and it limits coil current with a chopper set by a trimpot. It is protected against over-current, short circuits, over-temperature and under-voltage. Hobbyists buy it as the **Pololu A4988 Stepper Motor Driver Carrier (#1182)** or one of the many clones with the same 16-pin layout (common in 3D printers and CNC shields).

## Pinout (Pololu #1182, header order)
Logic side from the top (EN) down, then the power side from the top (VMOT, opposite EN) down, as printed on the board:

| Pin | Function |
|---|---|
| EN | ENABLE, active low. 100 kΩ pull-down on the board, so the outputs are on if it is left open |
| MS1, MS2, MS3 | Microstep select (pull-downs in the chip, so full step if left open) |
| RST | RESET, active low. **Floats on the board**: drive it high or jumper it to SLP |
| SLP | SLEEP, active low. 100 kΩ pull-up to VDD on the board |
| STEP | Each rising edge = one (micro)step |
| DIR | Direction, read on each STEP rising edge |
| VMOT | Motor supply 8–35 V |
| GND | Motor supply ground (next to VMOT) |
| 2B, 2A | Motor coil 2 |
| 1A, 1B | Motor coil 1 |
| VDD | Logic supply 3–5.5 V |
| GND (GND2) | Logic ground (bottom pin, next to VDD) |

## Electrical limits
- VMOT 8–35 V (absolute max 35 V, including spikes). VDD 3–5.5 V. Under-voltage lockout on VDD at about 2.8 V.
- Logic high ≥ 0.7 × VDD, low ≤ 0.3 × VDD, max 5.5 V. With a 3.3 V microcontroller, power VDD from 3.3 V. At VDD = 5 V a 3.3 V high (< 3.5 V) is not guaranteed.
- Coil current: about 1 A per coil without cooling and up to 2 A with a heat sink and airflow. Set it with the trimpot: I_max = VREF / (8 × Rcs). Pololu boards since 2017 have Rcs = 0.068 Ω (1 A → VREF 0.54 V). Many clones use 0.1 Ω (1 A → 0.8 V).
- Logic supply current up to 8 mA. Below 10 µA in sleep.

## Interface details
- STEP: at least 1 µs high and 1 µs low. DIR, MSx and RST need 200 ns of setup and hold around the STEP rising edge.
- Microstep table (MS1 MS2 MS3): L L L full, H L L 1/2, L H L 1/4, H H L 1/8, H H H 1/16. A new mode takes effect on the next STEP edge.
- After SLP goes high, wait 1 ms for the charge pump before you send STEP pulses.
- While RST is low the translator returns to Home, the outputs are off and STEP is ignored.
- EN high turns the outputs off, so the shaft turns freely, but the translator keeps counting.

## Wiring
- Power: VDD → 3V3, GND2 (the bottom GND, next to VDD) → GND. A separate 8–35 V supply goes to VMOT and the GND next to it, with a ≥ 47 µF electrolytic capacitor across them at the board. Join all grounds.
- ESP32: RST → D25, STEP → D26, DIR → D27 (or jumper RST to SLP and save a pin).
- Pico: RST → GP2, STEP → GP3, DIR → GP6.
- Raspberry Pi 4: STEP → GPIO17 (pin 11), DIR → GPIO27 (pin 13), RST → GPIO22 (pin 15).
- Motor: one coil to 1A/1B, the other to 2A/2B. You can find a coil pair with a multimeter: the two wires of a coil show a few ohms between them.

## Using the driver
```python
from a4988 import A4988, vref_for_current
m = A4988(26, 27, rst=25)            # STEP, DIR, RST (ESP32 wiring above)
m.step(200)                          # one turn of a 1.8° motor, full step
m.step(-200, delay_us=2000)          # back, slower
print(vref_for_current(0.8))         # trimpot voltage for 0.8 A (0.068 Ω board)
# With MS pins wired: A4988(26, 27, rst=25, ms=(12, 13, 14)).set_microstep(16)
```

## Gotchas
- Motor only buzzes or does not move? Check that RST is high, VMOT is at least 8 V, and the coil pairs are correct.
- Never plug or unplug the motor while VMOT is on. It destroys the chip.
- Without the bulk capacitor on VMOT, an LC spike when power is switched on can exceed 35 V even from a 12 V supply.
- Turn the trimpot down before the first run. If it is too high, the chip overheats and microsteps get rough.
- STEP and DIR have no pulls on the board. Never leave them floating.
- Steps are lost if you step too fast with no acceleration ramp. Start slow, for example with 2000 µs per step.

## Datasheet
https://www.allegromicro.com/-/media/files/datasheets/a4988-datasheet.pdf
