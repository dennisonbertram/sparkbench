---
name: part-drv8825
description: Pinout, electrical limits, wiring and MicroPython driver for the DRV8825 stepper motor driver carrier (TI DRV8825, STEP/DIR/EN). Use when designing, wiring, simulating or writing code for a DRV8825 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# DRV8825 stepper motor driver (DRV8825)

## Overview
The **DRV8825** from Texas Instruments drives one bipolar stepper motor (for example a NEMA 17). It has a built-in indexer: each pulse on STEP moves the motor one step, and DIR sets the direction. It does full, 1/2, 1/4, 1/8, 1/16 and 1/32 microstepping, and it limits coil current with a chopper set by a trimpot. It is protected against over-current, over-temperature and under-voltage, and reports faults on nFAULT. Hobbyists buy it as the **Pololu DRV8825 Stepper Motor Driver Carrier, High Current (#2133)** or one of the many purple clones with the same 16-pin layout (common in 3D printers and CNC shields).

## Pinout (Pololu #2133, header order)
Logic side from the top (EN) down, then the motor side from the top (VMOT, opposite EN) down, as printed on the board:

| Pin | Function |
|---|---|
| EN | nENBL, active low. 100 kΩ pull-down in the chip, so the outputs are on if it is left open |
| M0, M1, M2 | Microstep select (100 kΩ pull-downs, so full step if left open) |
| RST | nRESET, active low. **100 kΩ pull-down**: must be driven high |
| SLP | nSLEEP, active low. **1 MΩ pull-down**: must be driven high |
| STEP | Each rising edge = one (micro)step |
| DIR | Direction, read on each STEP rising edge |
| VMOT | Motor supply 8.2–45 V (also powers the chip) |
| GND | Motor supply ground (next to VMOT) |
| B2, B1 | Motor coil B |
| A1, A2 | Motor coil A |
| FLT | nFAULT output (open drain through 1.5 kΩ, 10 kΩ pull-up to SLP on the board) |
| GND (GND2) | Logic ground (bottom pin, next to FLT) |

There is **no logic supply pin**: the chip makes its own 3.3 V from VMOT.

## Electrical limits
- VMOT 8.2–45 V (absolute max 47 V, including spikes). Under-voltage lockout at about 7.8–8.2 V.
- Logic inputs: high ≥ 2.2 V, low ≤ 0.7 V, max 5.25 V. 3.3 V and 5 V microcontrollers both work directly.
- Coil current: about 1.5 A per coil without cooling, up to 2.2 A with a heat sink and airflow. ICHOP = VREF / (5 × Rsense). With the board's 0.100 Ω sense resistors: current limit = 2 × VREF (1 A → VREF 0.5 V).
- VMOT current with the motor idle: up to 8 mA. About 10 µA in sleep.

## Interface details
- STEP: at least 1.9 µs high and 1.9 µs low. DIR and M0–M2 need 650 ns setup and hold around the STEP rising edge.
- Microstep table (M0 M1 M2): 0 0 0 full, 1 0 0 1/2, 0 1 0 1/4, 1 1 0 1/8, 0 0 1 1/16, 1 0 1 / 0 1 1 / 1 1 1 1/32.
- After SLP goes high, wait 1.7 ms before you send STEP pulses.
- While RST is low the indexer returns to Home, the outputs are off and STEP is ignored. A latched over-current fault is cleared by pulsing RST (or cycling VMOT).
- EN high turns the outputs off and STEP is ignored. After EN goes low, wait 650 ns before stepping.

## Wiring
- Power: a separate 8.2–45 V supply to VMOT and the GND next to it, with a ≥ 47 µF electrolytic capacitor across them at the board. Bottom GND (GND2) → microcontroller GND. Join all grounds.
- ESP32: RST → D25, SLP → D26, STEP → D27, DIR → D13 (or tie RST and SLP together to one GPIO or 3V3).
- Pico: RST → GP2, SLP → GP3, STEP → GP6, DIR → GP7.
- Raspberry Pi 4: STEP → GPIO17 (pin 11), DIR → GPIO27 (pin 13), RST and SLP → GPIO22 (pin 15).
- Motor: one coil to A1/A2, the other to B1/B2. The two wires of a coil show a few ohms between them on a multimeter.

## Using the driver
```python
from drv8825 import DRV8825, vref_for_current
m = DRV8825(27, 13, rst=25, slp=26)    # STEP, DIR, RST, SLP (ESP32 wiring above)
m.step(200)                            # one turn of a 1.8° motor, full step
m.step(-200, delay_us=2000)            # back, slower
print(vref_for_current(1.0))           # 0.5 V trimpot voltage for 1 A (0.1 Ω board)
# With mode pins wired: DRV8825(27, 13, rst=25, slp=26, mode=(12, 14, 15)).set_microstep(32)
```

## Gotchas
- Motor does nothing? RST and SLP must both be high (they are pulled low in the chip, unlike the A4988 carrier), and VMOT must be on: the logic is powered from it.
- Dropping it into an A4988 socket: the bottom-right pin is FLT, not VDD. The board's 1.5 kΩ resistor makes feeding logic voltage into FLT safe, and the 10 kΩ to SLP then pulls SLP up.
- Never plug or unplug the motor while VMOT is on. It destroys the chip.
- Without the bulk capacitor on VMOT, an LC spike at power-on can exceed 45 V even from a 12 V supply.
- Turn the trimpot down before the first run. In full step the coil current is 71 % of the limit.
- Steps are lost if you step too fast with no acceleration ramp. Start slow, for example with 2000 µs per step.

## Datasheet
https://www.ti.com/lit/ds/symlink/drv8825.pdf
