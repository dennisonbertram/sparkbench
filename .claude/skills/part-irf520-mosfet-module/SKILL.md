---
name: part-irf520-mosfet-module
description: Pinout, electrical limits, wiring and MicroPython usage for the IRF520 MOSFET driver module (IRF520 N-channel low-side switch). Use when designing, wiring, simulating or writing code for an IRF520 MOSFET module in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# IRF520 MOSFET driver module (IRF520)

## Overview
The common **IRF520 MOSFET driver module** puts a Vishay/IR **IRF520** N-channel power MOSFET (100 V, 9.2 A, RDS(on) 0.27 Ω at VGS = 10 V) on a small board as a **low-side switch**. A GPIO high on SIG turns it on and grounds the load's V- terminal, so a DC load powered from a separate 0–24 V supply (motor, LED strip, pump, solenoid) switches on. A green LED shows when SIG is high, and a pull-down keeps the load off while the GPIO floats. No driver is needed: it is a plain GPIO or PWM output.

## Pinout (common IRF520 module, 3-pin header order)
| Pin | Function |
|---|---|
| SIG | Gate signal, active high (PWM OK) |
| VCC | Not connected on this board; leave unconnected |
| GND | Ground, shared with the microcontroller |

Screw terminals (not on the header): **VIN / GND** = load supply input (0–24 V), **V+ / V-** = load.

## Electrical limits
- IRF520: VDS 100 V, VGS ±20 V max, ID 9.2 A at VGS = 10 V (25 °C case), RDS(on) ≤ 0.27 Ω at VGS = 10 V, VGS(th) 2.0–4.0 V.
- Module: load supply up to 24 V, up to about 5 A with heatsinking/derating.
- SIG logic: 3.3–5 V from a microcontroller (it tolerates up to 10 V for full saturation). SIG draws a few mA through the pull-down and LED.

## Wiring
- ESP32: SIG → GPIO 23 (any output), GND → GND, VCC unconnected.
- Pico: SIG → GP15, GND → GND, VCC unconnected.
- Raspberry Pi 4: SIG → pin 12 (GPIO18, PWM), GND → pin 6.
- Load supply + → VIN terminal, load supply - → GND terminal, load across V+ and V-.

## Using it
```python
from machine import Pin, PWM
mosfet = Pin(23, Pin.OUT, value=0)
mosfet.value(1)   # load on
mosfet.value(0)   # load off
pwm = PWM(Pin(23), freq=1000)
pwm.duty_u16(32768)  # about half power (LED strip dimming / motor speed)
```

## Gotchas
- **Not a logic-level MOSFET.** The IRF520 is specified at VGS = 10 V; with a threshold of 2–4 V it is only partly on at 5 V and barely on at 3.3 V. At 3.3 V logic (ESP32, Pico, Pi) keep the load to about 1 A, or use a logic-level module (IRLZ44N, AOD4184).
- It switches DC only, on the ground side: V+ always sits at the supply voltage.
- Add a flyback diode across motors, solenoids and relay coils (cathode to V+); the board has none.
- The header's VCC pin does nothing on this board; the MOSFET is powered by the gate signal alone.
- Fit a heatsink above a few amps; it gets hot quickly when not fully enhanced.

## Datasheet
https://www.vishay.com/docs/91017/irf520.pdf
