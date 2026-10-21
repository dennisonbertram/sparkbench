---
name: part-solenoid-mosfet-module
description: Pinout, electrical limits, wiring and MicroPython example for a 5 V push-pull solenoid on the Adafruit STEMMA MOSFET+Diode Driver (product 5648, AO3406 MOSFET with flyback diode; Out/In/V+/GND). Use when designing, wiring, simulating or writing code for a solenoid MOSFET driver module in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Solenoid MOSFET driver (Adafruit 5648) with 5 V solenoid

## Overview
The **Adafruit STEMMA MOSFET+Diode Driver (5648)** is a low-side switch for inductive loads. The In signal drives the gate of an **AO3406** 30 V N-channel MOSFET directly (VGS(th) 1.5-2.5 V, RDS(on) < 70 mOhm at 4.5 V), with a 10 kOhm pull-down so the load stays off while the GPIO floats. A **1N400x / SM4002 flyback diode** sits across the + / - terminal block, so the solenoid's turn-off spike is clamped on the board. The usual load is the **Adafruit 2776 mini push-pull solenoid** (5 V, 4.5 Ohm, 1.1 A, 3 mm stroke).

## Pinout (0.1" header, order printed on the back)
| Pin | Function |
|---|---|
| Out | Switched output (MOSFET drain) = terminal block `-` |
| In | Signal input, active high, 2.5-20 V |
| V+ | Load power 3-30 V = terminal block `+` (separate supply) |
| GND | Common ground (load supply and microcontroller) |

The JST PH STEMMA socket carries V+, GND and In; the 2-way terminal block carries `+` (V+) and `-` (Out).

## Electrical limits
- V+: 3-30 V (AO3406 VDS max 30 V). Match it to the solenoid: 5 V for the 2776.
- Load current: 1.5 A continuous, 3 A peak. JST PH connector only 2 A.
- In: 2.5-20 V logic (VGS max ±20 V); draws well under 1 mA (10 kOhm pull-down + 10 kOhm LED).
- Solenoid 2776: 1.1 A at 5 V, 5.5 W. Not for continuous duty.

## Interface details
- Plain digital output: In high = MOSFET on = solenoid pulls in; low = spring returns the plunger.
- PWM on In (e.g. 1 kHz) can hold the plunger at reduced power after a full-power pull-in.
- No driver needed: `machine.Pin` / `machine.PWM`.

## Wiring
- ESP32: In → GPIO25, GND → GND. Pico: In → GP15, GND → GND. Raspberry Pi: In → GPIO18 (pin 12), GND → pin 6.
- Separate 5 V supply (≥ 1.5 A): + → V+ (or terminal `+`), - → GND, and join that GND to the microcontroller GND.
- Solenoid leads: one on `+`, one on `-` (polarity does not matter; the diode is on the board).

## Using it
```python
from machine import Pin
import time
sol = Pin(25, Pin.OUT, value=0)
sol.value(1)        # fire
time.sleep_ms(200)
sol.value(0)        # release
```
Hold at lower power: `from machine import PWM; p = PWM(Pin(25), freq=1000, duty_u16=65535); time.sleep_ms(100); p.duty_u16(22000)`.

## Gotchas
- **Never power the solenoid from the microcontroller's 5V/3V3 pin**: 1.1 A inrush resets the board.
- **Pulse, don't hold**: the small solenoid overheats if left on; use short pulses or reduced-duty PWM to hold.
- A 5 V solenoid on a 12 V V+ burns out; V+ must match the solenoid rating.
- Common ground is required between the solenoid supply and the microcontroller.

## Datasheet
https://cdn-shop.adafruit.com/product-files/5648/5648_ds_AO3406.pdf (AO3406 MOSFET). Board pinout and schematic: https://learn.adafruit.com/adafruit-mosfet-driver/pinouts
