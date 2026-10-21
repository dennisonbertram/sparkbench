---
name: part-tmc2208
description: Pinout, electrical limits, wiring and MicroPython driver for the TMC2208 silent stepper motor driver (Trinamic/ADI TMC2208, STEP/DIR/EN, BIGTREETECH TMC2208 V3.0 / SilentStepStick). Use when designing, wiring, simulating or writing code for a TMC2208 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# TMC2208 silent stepper motor driver (TMC2208)

## Overview
The **TMC2208** from Trinamic (now Analog Devices) drives one bipolar stepper motor, such as a NEMA 17. Each pulse on STEP moves the motor one microstep, and DIR sets the direction. MS1/MS2 select 1/2, 1/4, 1/8 or 1/16 step, and the chip interpolates every step to 1/256. Its **stealthChop2** mode, on by default, makes the motor almost silent. A trimpot sets the coil current, up to 1.2 A RMS (2 A peak). Hobbyists buy it as the **BIGTREETECH TMC2208 V3.0** (STEP/DIR version), which is based on the open Watterott SilentStepStick design and fits the same 16-pin footprint as the A4988 boards.

## Pinout (BIGTREETECH TMC2208 V3.0, header order)
Here is the signal side from EN (the corner pin) to DIR, then the power side from VM (opposite EN) to the far GND, as printed on the board:

| Pin | Function |
|---|---|
| EN | ENN, active low. **Pulled UP to VIO on the board (outputs off)**: drive it low to run |
| MS1, MS2 | Microstep select (pull-downs in the chip: 1/8 step if left open) |
| NC | Unlabelled pin that goes only to one side of solder jumper J2. Leave it unconnected |
| PDN_UART | Single-wire UART, connected only when J2 is bridged (UART version). Leave it unconnected for STEP/DIR |
| CLK | External clock, connected only when J1 is bridged. Leave it unconnected (internal 12 MHz clock) |
| STEP | Each rising edge = one microstep |
| DIR | Direction, read on each STEP edge (internal pull-down) |
| VM | Motor supply 5.5–35 V |
| GND | Motor supply ground (next to VM) |
| OA2, OA1 | Motor coil A |
| OB1, OB2 | Motor coil B |
| VIO | Logic I/O supply 3.0–5.25 V |
| GND (GND2) | Logic ground (next to VIO) |

## Electrical limits
- VM 5.5–36 V for the chip. The board is rated 5.5–35 V, and 12 V or 24 V are typical. VIO is 3.0–5.25 V.
- The chip's logic and charge pump run from an internal 5 V regulator fed by **VM**. With only VIO connected, nothing happens.
- Logic high ≥ 0.7 × VIO, low ≤ 0.3 × VIO. With a 3.3 V microcontroller, power VIO from 3.3 V.
- Coil current: 1.2 A RMS per coil continuous, 2 A peak. In standalone mode the current is IRMS = 0.325 V / (Rsense + 0.02 Ω) × 1/√2 × VREF / 2.5 V. With the board's 0.11 Ω sense resistors that is **IRMS ≈ 0.71 × VREF**, so VREF = 1.0 V gives 0.71 A RMS.
- VIO draws only microamps.

## Interface details
- STEP: at least 100 ns high and 100 ns low. DIR needs 20 ns of setup and hold around the STEP edge. Only the rising edge counts by default.
- Microstep table (MS2 MS1): 00 → 1/8, 01 → 1/2, 10 → 1/4, 11 → 1/16. At the default 1/8, a 200-step motor needs **1600 pulses per turn**.
- EN high turns the power stage off, so all outputs float and the shaft turns freely. It also clears a DIAG error.
- On this board PDN_UART is pulled to GND, which enables automatic standstill current reduction. About 0.5 s after the last step, the hold current drops to roughly half.
- When the outputs switch on, keep the motor still for up to 130 ms before the first move. stealthChop uses that time to tune itself (AT#1).
- All other modes (spreadCycle, current by software, up to 1/256 native) need the UART on PDN_UART. This driver does not cover them.

## Wiring
- Power: VIO → 3V3, GND2 (the GND next to VIO) → GND. A separate 12–24 V supply goes to VM and the GND next to it, with a ≥ 100 µF electrolytic capacitor across them at the board. Join all grounds.
- ESP32: EN → D25, STEP → D26, DIR → D27.
- Pico: EN → GP2, STEP → GP3, DIR → GP6.
- Raspberry Pi 4: STEP → GPIO17 (pin 11), DIR → GPIO27 (pin 13), EN → GPIO22 (pin 15).
- Motor: one coil to OA1/OA2, the other to OB1/OB2. The two wires of a coil read a few ohms on a multimeter.

## Using the driver
```python
from tmc2208 import TMC2208, vref_for_current, irms_from_vref
m = TMC2208(26, 27, en=25)           # STEP, DIR, EN (ESP32 wiring above)
m.enable()                           # EN low, waits 130 ms for stealthChop tuning
m.step(1600)                         # one turn of a 1.8° motor at 1/8 step
m.step(-1600, delay_us=1000)         # back, slower
m.disable()                          # EN high: shaft free
print(vref_for_current(0.8))         # trimpot voltage for 0.8 A RMS (0.11 Ω board): about 1.13 V
# With MS pins wired: TMC2208(26, 27, en=25, ms=(12, 13)).set_microstep(16)
```

## Gotchas
- If the motor doesn't move at all, check that EN is low (the board pulls it high), that VM is powered, and that the coil pairs are right.
- You can only measure VREF with VM powered: the trimpot is fed from the chip's 5 V regulator.
- Never plug or unplug the motor while VM is on. It destroys the driver.
- Check the orientation before powering: EN sits opposite VM. A board plugged in backwards is destroyed.
- Turn the trimpot down before the first run. Too much current overheats the chip, and it shuts down.
- STEP has no pull on the board. Never leave it floating.
- stealthChop loses torque at high speed, and steps get lost if you start too fast. Ramp up the speed, for example from 1000 µs per microstep.
- Leave CLK, PDN_UART and NC unconnected unless you have bridged J1 or J2 on purpose.

## Datasheet
https://www.analog.com/media/en/technical-documentation/data-sheets/TMC2202_TMC2208_TMC2224_datasheet_rev1.14.pdf
