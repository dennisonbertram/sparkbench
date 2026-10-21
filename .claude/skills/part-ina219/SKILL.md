---
name: part-ina219
description: Pinout, electrical limits, wiring and MicroPython driver for the INA219 current & voltage sensor (TI INA219). Use when designing, wiring, simulating or writing code for an INA219 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# INA219 current & voltage sensor (INA219)

## Overview
The **INA219** from Texas Instruments is a high-side current and power monitor. It measures the voltage of a supply rail (0–26 V, 4 mV steps) and the voltage across a small shunt resistor in series with the load (±320 mV, 10 µV steps), and reports both over I2C. Hobbyists buy it on an **INA219 breakout** with a 0.1 Ω shunt ("R100"), so it reads up to ±3.2 A with 0.1 mA resolution.

## Pinout (INA219 breakout, header order)
| Pin | Function |
|---|---|
| VIN | Logic supply, 3–5.5 V (3.3 V recommended) |
| GND | Ground (shared by the logic and the measured circuit) |
| SCL | I2C clock |
| SDA | I2C data |
| VIN- | Current-sense input, load side (to the load's + lead) |
| VIN+ | Current-sense input, supply side (to the supply's +) |

VIN+ and VIN- are also on a screw terminal. A0/A1 are solder jumpers, not header pins.

## Electrical limits
- Supply: 3.0–5.5 V (chip and breakout); about 0.7 mA, 1 mA max.
- VIN+/VIN- common mode: 0–26 V. Shunt: ±320 mV full scale (±3.2 A with 0.1 Ω).
- I2C up to 400 kHz (fast mode), 2.56 MHz in high-speed mode.

## Interface details
- **I2C address 0x40**; A0 bridged 0x41, A1 bridged 0x44, both 0x45.
- 16-bit registers, MSB first: write the register pointer, then read 2 bytes.
- Configuration 00h: power-on default **0x399F** (32 V range, PGA /8, 12-bit, continuous shunt + bus). 12-bit conversion: 532 µs each.
- Shunt voltage 01h: signed two's complement, LSB **10 µV**. Current = V_shunt / R_shunt (0.1 Ω → 0.1 mA per count).
- Bus voltage 02h: value in bits 15–3, LSB **4 mV**: V = (reg >> 3) × 0.004. Bit 1 = CNVR, bit 0 = OVF.
- Current 04h / power 03h only read non-zero after a calibration value is written to 05h; the driver avoids that by computing current from the shunt voltage.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.
- Measured circuit: supply + → VIN+, VIN- → load +, load − and supply − → GND.

## Using the driver
```python
from machine import I2C, Pin
from ina219 import INA219
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
v, i = INA219(i2c).read()   # volts, milliamps
print('V=%.2fV I=%.1fmA' % (v, i))
```
Pass `shunt_ohms=` if your board has a different shunt resistor.

## Gotchas
- The load's ground must be joined to the INA219/microcontroller GND, or the bus voltage reads nonsense.
- Never connect VIN+/VIN- to a GPIO: they can carry up to 26 V.
- Negative current means VIN+ and VIN- are swapped.
- Bus voltage is measured at VIN- (the load side), so it is slightly below the supply voltage under load.

## Datasheet
https://www.ti.com/lit/ds/symlink/ina219.pdf
