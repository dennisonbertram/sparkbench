---
name: part-uln2803
description: Pinout, electrical limits, wiring and MicroPython driver for the ULN2803 8-channel Darlington sink driver (TI ULN2803AN, DIP-18). Use when designing, wiring, simulating or writing code for a ULN2803 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build, e.g. to switch relays, solenoids, lamps or a unipolar stepper from 3.3 V GPIOs.
---

# ULN2803 8-channel Darlington driver (ULN2803AN)

## Overview
The **ULN2803A** from TI is eight NPN Darlington low-side switches (open collector, 50 V, 500 mA per channel). Each input has a 2.7 kΩ series base resistor, so TTL, 5 V CMOS and 3.3 V GPIOs drive it directly. Built-in common-cathode clamp diodes (to COM) absorb flyback from inductive loads. Input **nB high = output nC sinks current to GND**. There is no logic supply, register or protocol. Hobbyists buy the bare **Texas Instruments ULN2803AN in a DIP-18 package** and plug it straight into a breadboard.

## Pinout (DIP-18, pin 1 next to the notch)
| Pin | Name | Function |
|---|---|---|
| 1-8 | 1B-8B | Inputs 1-8 (high = that output on) |
| 9 | GND | Common emitter / ground, carries all the load current |
| 10 | COM | Clamp-diode common: connect to the load supply (+) |
| 11-18 | 8C-1C | Open-collector outputs 8 down to 1 (output nC is opposite input nB) |

## Electrical limits
- Outputs: 50 V max (VCE), 500 mA max continuous per channel. With several channels on at once the package power limits the current, so check the datasheet's duty-cycle curves and keep the total well under 1 A.
- VCE(sat): 0.9 V typ. at 100 mA, 1.0 V typ. at 200 mA (1.3 V max), 1.3 V typ. at 350 mA (1.6 V max). A 5 V load sees about 4 V.
- Inputs: 30 V max. VI(on) is at most 2.4 V for 200 mA, 2.7 V for 250 mA and 3.0 V for 300 mA (VCE = 2 V). II(on) is 0.93 mA typ. at 3.85 V.
- Clamp diodes: 50 V reverse, 500 mA max, VF 1.7 V typ. at 350 mA.
- Switching: tPHL 20 ns, tPLH 130 ns typ.

## Interface details
Plain logic levels, nothing else: drive nB high and output nC turns on; drive it low (or leave it open: internal 7.2 kΩ + 3 kΩ to GND) and nC turns off. Channels are independent and can be paralleled for more current. PWM on an input dims a lamp or sets a DC motor's speed (low-side switching).

## Wiring
- Load: load supply (+) → load → nC. Load supply (−) → GND (pin 9). COM (pin 10) → load supply (+) for relays, solenoids and motors.
- ESP32: 1B-8B → D25, D26, D27, D13, D23, D19, D18, D17; GND → GND.
- Pico: 1B-8B → GP2-GP9; GND → GND.
- Raspberry Pi 4: 1B-8B → GPIO17, 18, 27, 22, 23, 24, 25, 5; GND → pin 6.
- Always share GND between the microcontroller, the chip and the load supply.
- LEDs: supply (+) → resistor → LED anode, LED cathode → nC (the chip sinks; size the resistor for the ~1 V drop).

## Using the driver
```python
from uln2803 import ULN2803
drv = ULN2803([25, 26, 27, 13, 23, 19, 18, 17])   # GPIOs for 1B..8B
drv.on(1)               # channel 1 sinks current
drv.write(0b10000010)   # channels 2 and 8 on, the rest off
drv.all_off()
```

## Gotchas
- It only switches the low side: the load goes between + and the output, never between the output and GND.
- Forgetting COM on an inductive load lets the flyback spike exceed 50 V and destroy the output.
- Missing common ground means nothing switches.
- Eight channels at 500 mA each at once will overheat the package; the 500 mA rating is for one channel.
- The ~1 V saturation drop matters for low-voltage loads; for 3.3 V loads or very high currents use a logic-level MOSFET instead.
- The ULN2804A looks the same but has a 10.5 kΩ input resistor and needs 6-15 V CMOS levels; it will not switch reliably from 3.3 V.

## Datasheet
https://www.ti.com/lit/ds/symlink/uln2803a.pdf
