---
name: part-water-pump-mosfet-module
description: Pinout, electrical limits, wiring and MicroPython example for the D4184 opto-isolated MOSFET switch module used to run a DC water pump, solenoid valve, fan or LED strip (AOD4184A MOSFET + PC817). Use when designing, wiring, simulating or writing code for a water pump MOSFET module in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Water pump MOSFET module (D4184)

## Overview
The **D4184 MOSFET control module** is a small (35 x 16 mm) low-side switch for DC loads. A **PC817 optocoupler** (1 kΩ series resistor on the input) turns on a **D4184 / AOD4184A** 40 V N-channel MOSFET (RDS(on) 7.6 mΩ typ at VGS 4.5 V, VGS(th) 1.7–2.6 V). The gate is biased to half the load supply by two 4.7 kΩ resistors and clamped by a Zener. Hobbyists use it to switch a 12 V water pump from a 3.3 V GPIO. Signal and load sides are isolated.

## Pinout (D4184 module, header order)
| Pin | Function |
|---|---|
| PWM | Control input, active high, 2.5–20 V (signal header pin 1) |
| GND | Signal ground, to the microcontroller (signal header pin 2) |
| + | Load supply + (6–36 V) and the pump's + lead (screw terminal) |
| LOAD | Pump's - lead (MOSFET drain) |
| - | Load supply - (MOSFET source); not joined to signal GND |

## Electrical limits
- Load supply: 6–36 V DC (MOSFET VDS max 40 V). Use 9 V or more for loads over a few amps.
- Load current: about 10 A continuous at 12 V on the bare board (the chip's 50 A rating needs a heatsink this board doesn't have).
- Control input: 2.5–20 V high; about 2 mA at 3.3 V, 4 mA at 5 V.
- Gate VGS max ±20 V; the on-board Zener keeps the gate safe up to a 36 V supply.

## Interface details
- Plain digital output: GPIO high = MOSFET on = pump runs; low or unconnected = off.
- PWM works for speed/dimming, but the optocoupler and 4.7 kΩ gate resistors switch slowly: keep it at about 1 kHz or less.
- No driver needed: `machine.Pin` (or `machine.PWM`).

## Wiring
- ESP32: PWM → any output GPIO (e.g. D25), GND → GND.
- Pico: PWM → GP2, GND → GND.
- Raspberry Pi 4: PWM → GPIO18 (pin 12), GND → pin 6.
- Load side: 12 V supply + → `+`, pump + → `+`, pump - → `LOAD`, supply - → `-`. Flyback diode across the pump (stripe to `+`).

## Using it
```python
from machine import Pin
import time
pump = Pin(25, Pin.OUT, value=0)
pump.value(1)   # pump on
time.sleep(5)
pump.value(0)   # pump off
```
Speed control: `from machine import PWM; p = PWM(Pin(25), freq=500, duty_u16=40000)`.

## Gotchas
- **Supply below 6 V does not work**: the gate only gets half the supply. A 5 V USB mini pump won't switch reliably; use a 12 V pump.
- **No flyback diode on the board**: add one (1N4007 / 1N5819) across any pump, solenoid or motor.
- Never power the pump from the microcontroller's 3V3/5V pin; it needs its own supply.
- Keep electronics above the water line and don't run the pump dry.

## Datasheet
https://www.aosmd.com/res/datasheets/AOD4184A.pdf (MOSFET). Module pinout and schematic: https://protosupplies.com/product/d4184-mosfet-control-module/
