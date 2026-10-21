---
name: part-tmc2209
description: Pinout, electrical limits, wiring and MicroPython driver for the TMC2209 silent stepper motor driver (Trinamic/ADI TMC2209, STEP/DIR/EN, BIGTREETECH TMC2209 V1.2 StepStick module). Use when designing, wiring, simulating or writing code for a TMC2209 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# TMC2209 silent stepper motor driver (TMC2209)

## Overview
The **TMC2209** from Trinamic (now Analog Devices) drives one bipolar stepper motor, such as a NEMA 17. Each pulse on STEP moves the motor one microstep, and DIR sets the direction. MS1/MS2 select 1/8, 1/16, 1/32 or 1/64 step, and the chip interpolates every step to 1/256. Its **stealthChop2** mode, on by default, makes the motor almost silent. Over its single-wire UART it also offers spreadCycle, stallGuard4 (sensorless homing) and coolStep. A trimpot sets the coil current. Hobbyists buy it as the **BIGTREETECH TMC2209 V1.2**, which fits the same 16-pin StepStick footprint as the A4988 boards.

## Pinout (BIGTREETECH TMC2209 V1.2, header order)
Here is the signal side from EN (the corner pin) to DIR, then the power side from VM (opposite EN) to the far GND, as printed on the board:

| Pin | Function |
|---|---|
| EN | ENN, active low. **Pulled UP to VDD on the board (outputs off)**: drive it low to run |
| MS1, MS2 | Microstep select (pull-downs in the chip: 1/8 step if left open); UART address in UART mode |
| PDN | PDN_UART (factory jumper T1). Pulled to GND on the board. Leave it unconnected for STEP/DIR |
| PDN (PDN2) | Second PDN pin, connected only if jumper T1 is moved. Leave it unconnected |
| CLK | External clock, pulled to GND on the board (internal 12 MHz clock). Leave it unconnected |
| STEP | Each rising edge = one microstep |
| DIR | Direction, read on each STEP edge (internal pull-down) |
| VM | Motor supply 5.5–28 V |
| GND | Motor supply ground (next to VM) |
| A2, A1 | Motor coil A |
| B1, B2 | Motor coil B |
| VDD | Logic I/O supply (VCC_IO) 3.0–5.25 V |
| GND (GND2) | Logic ground (next to VDD) |

The top edge also has VREF, INDEX and DIAG pads (optional; DIAG goes high on a driver error or a stallGuard stall).

## Electrical limits
- VM 5.5–28 V when using the chip's internal 5 V regulator (absolute maximum 29 V). 12 V or 24 V are typical. VDD is 3.0–5.25 V.
- The chip's logic and charge pump run from the internal regulator fed by **VM**. With only VDD connected, nothing happens.
- Coil current: 1.4 A RMS per coil continuous (2.0 A RMS with a duty-cycle limit), 2.8 A peak. In standalone mode the current is IRMS = 0.325 V / (Rsense + 0.02 Ω) × 1/√2 × VREF / 2.5 V. With the board's 0.11 Ω sense resistors that is **IRMS ≈ 0.71 × VREF**. The factory VREF of about 1.2 V gives about 0.85 A RMS.
- VDD draws only microamps.

## Interface details
- STEP: at least 100 ns high and 100 ns low. DIR needs 20 ns of setup and hold around the STEP edge. Only the rising edge counts by default.
- Microstep table (MS2 MS1): 00 → 1/8, 01 → **1/32**, 10 → **1/64**, 11 → 1/16. This is **different from the TMC2208** (which gives 1/2 and 1/4). At the default 1/8, a 200-step motor needs **1600 pulses per turn**.
- EN high turns the power stage off, so all outputs float and the shaft turns freely. It also clears a DIAG error.
- PDN_UART is pulled to GND on this board, which enables automatic standstill current reduction.
- When the outputs switch on, keep the motor still for up to 130 ms before the first move. stealthChop uses that time to tune itself (AT#1).
- spreadCycle by pin is chosen with the SPREAD jumper on the board (factory: stealthChop). Everything else needs the UART, which this driver does not cover.

## Wiring
- Power: VDD → 3V3, GND2 (the GND next to VDD) → GND. A separate 12–24 V supply goes to VM and the GND next to it, with a ≥ 100 µF electrolytic capacitor across them at the board. Join all grounds.
- ESP32: EN → D25, STEP → D26, DIR → D27.
- Pico: EN → GP2, STEP → GP3, DIR → GP6.
- Raspberry Pi 4: STEP → GPIO17 (pin 11), DIR → GPIO27 (pin 13), EN → GPIO22 (pin 15).
- Motor: one coil to A1/A2, the other to B1/B2. The two wires of a coil read a few ohms on a multimeter.

## Using the driver
```python
from tmc2209 import TMC2209, vref_for_current, irms_from_vref
m = TMC2209(26, 27, en=25)           # STEP, DIR, EN (ESP32 wiring above)
m.enable()                           # EN low, waits 130 ms for stealthChop tuning
m.step(1600)                         # one turn of a 1.8° motor at 1/8 step
m.step(-1600, delay_us=1000)         # back, slower
m.disable()                          # EN high: shaft free
print(vref_for_current(1.0))         # trimpot voltage for 1.0 A RMS (0.11 Ω board): about 1.41 V
# With MS pins wired: TMC2209(26, 27, en=25, ms=(12, 13)).set_microstep(16)
```

## Gotchas
- If the motor doesn't move at all, check that EN is low (the board pulls it high), that VM is powered, and that the coil pairs are right.
- You can only measure VREF with VM powered: the trimpot is fed from the chip's 5 V regulator.
- Never plug or unplug the motor while VM is on. It destroys the driver.
- Check the orientation before powering: EN sits opposite VM. A board plugged in backwards is destroyed.
- Code written for a TMC2208 with MS1/MS2 set gets 1/32 or 1/64 instead of 1/2 or 1/4 here, so the motor turns 16× slower than expected.
- Turn the trimpot down before the first run. Too much current overheats the chip, and it shuts down.
- STEP has no pull on the board. Never leave it floating.
- stealthChop loses torque at high speed, and steps get lost if you start too fast. Ramp up the speed.
- Leave CLK and both PDN pins unconnected unless you are using the UART.

## Datasheet
https://www.analog.com/media/en/technical-documentation/data-sheets/TMC2209_datasheet_rev1.09.pdf
