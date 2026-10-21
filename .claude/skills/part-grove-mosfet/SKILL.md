---
name: part-grove-mosfet
description: Pinout, electrical limits, wiring and MicroPython code for the Seeed Grove - MOSFET (SKU 103020008; CJQ4435 P-channel high-side switch driven by an SS9013 transistor, Grove SIG/NC/VCC/GND, VIN 5-15 V screw terminal, OUT terminal, active-high). Use when designing, wiring, simulating or writing code for a Grove MOSFET in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Seeed Grove - MOSFET (CJQ4435)

## Overview
The **Seeed Grove - MOSFET v1.0 (SKU 103020008)** switches a separate DC load (motor, LED strip, pump, fan) from a GPIO. It is a **high-side switch**: a **CJQ4435** P-channel MOSFET (JCET, -30 V, -9.1 A, RDS(on) 24 mΩ at VGS = -10 V, 35 mΩ at -4.5 V) sits between the VIN rail and the OUT terminal. Its gate is pulled up to VIN by 10 kΩ (R1) and pulled down by an **SS9013** NPN transistor whose base is fed from SIG through 1 kΩ (R2, with a 100 kΩ pull-down R3). **SIG high = MOSFET on = OUT connected to VIN.** A 1N4148 flyback diode sits across OUT-GND. The VIN rail is fed from the VIN screw terminal through an SS54B Schottky (D3), and from Grove VCC through an SS0520 Schottky (D2), so with no external supply a small load (under about 300 mA) can run from the Grove 5 V. No driver is needed: it is a plain GPIO or PWM output.

## Pinout (Grove connector J2, schematic / silkscreen order)
| Pin | Wire | Function |
|---|---|---|
| SIG | yellow | Control input, high = load on (PWM OK) |
| NC | white | Not connected |
| VCC | red | 5 V (only feeds the VIN rail through a diode when no external supply is used) |
| GND | black | Ground |

Screw terminals on the other edge: **J3 VIN (+) / GND (-)** = load supply input 5-15 V, under 2 A. **J1 OUT / GND** = load (OUT is the switched +, GND the load's return). All grounds are common.

## Electrical limits
- CJQ4435: VDS -30 V, VGS ±20 V, ID -9.1 A (10 s, 1 in² FR4), PD 1.4 W, VGS(th) -1 to -3 V.
- Board (Seeed wiki): working voltage 5 V, VIN 5-15 V, under 2 A. The VIN diode (SS54B) drops about 0.5 V and the gate swings the full VIN, so the MOSFET is fully on at VGS ≈ -VIN.
- Without an external supply the load is fed from Grove VCC through a small SS0520 Schottky: keep it under about 300 mA (Seeed's figure).
- SIG: 3.3 V or 5 V logic, about 2.6 mA from a 3.3 V pin (1 kΩ into the SS9013 base).

## Wiring
- ESP32: SIG → GPIO25, VCC → 5V (VIN pin), GND → GND, NC unconnected.
- Pico: SIG → GP15, VCC → VBUS, GND → GND.
- Raspberry Pi 4: SIG → pin 12 (GPIO18, PWM), VCC → pin 2 (5 V), GND → pin 6.
- Load supply + → VIN terminal, supply - → its GND terminal; load + → OUT, load - → the OUT-side GND terminal.

## Using it
```python
from machine import Pin, PWM
mosfet = Pin(25, Pin.OUT, value=0)  # SIG
mosfet.value(1)   # load on
mosfet.value(0)   # load off
pwm = PWM(Pin(25), freq=1000)
pwm.duty_u16(32768)  # about half power (motor speed / LED dimming)
```

## Gotchas
- It switches the **positive** side: OUT sits at VIN when on and floats (pulled to GND through the load) when off. Do not wire the load between VIN and OUT.
- Keep VIN at 15 V or less (Seeed's rating): the gate swings the full VIN (CJQ4435 VGS max ±20 V) and D2 (SS0520, 20 V) is reverse biased by VIN minus VCC, so there is little margin above that.
- The 10 kΩ gate pull-up makes turn-off slow (microseconds): PWM at about 1 kHz is fine, much faster PWM heats the MOSFET despite Seeed's "5 MHz" claim.
- The on-board 1N4148 flyback diode is small; for big motors or solenoids add a 1N5819/1N4007 across the load (stripe to OUT).
- Never feed a big load from the Grove 5 V: connect a separate supply to VIN for anything over about 300 mA.

## Datasheet
https://files.seeedstudio.com/wiki/Grove-MOSFET/res/CJQ4435.pdf ; schematic https://files.seeedstudio.com/wiki/Grove-MOSFET/res/Grove%20-%20MOSFET%20.pdf
