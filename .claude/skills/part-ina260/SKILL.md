---
name: part-ina260
description: Pinout, electrical limits, wiring and MicroPython driver for the INA260 current, voltage & power sensor with integrated shunt (TI INA260). Use when designing, wiring, simulating or writing code for an INA260 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# INA260 current, voltage & power sensor (INA260)

## Overview
The **INA260** from Texas Instruments measures the current through its built-in 2 mΩ shunt (±15 A, 1.25 mA steps), the bus voltage (0–36 V, 1.25 mV steps) and the power (10 mW steps). It talks I2C. Hobbyists buy it as the **Adafruit INA260 breakout (#4226)**, which has 10 kΩ pull-ups on SDA/SCL, A0/A1 address jumpers and a screw terminal for the measured current.

## Pinout (Adafruit INA260 #4226, header order)
| Pin | Function |
|---|---|
| VCC | Logic supply, 2.7–5.5 V (same as your microcontroller) |
| GND | Ground, shared with the measured circuit |
| SCL | I2C clock |
| SDA | I2C data |
| Alert | Alert / conversion-ready output (optional) |
| VBus | Bus-voltage sense; tied to Vin+ by the VB jumper |
| Vin+ | Current in (from the supply, high side) |
| Vin- | Current out (to the load, high side) |

Vin+ and Vin- are also on the 2-pin screw terminal on the opposite edge, so the board is wired with jumper leads rather than plugged into a breadboard.

## Electrical limits
- Supply (VCC): 2.7–5.5 V; about 310 µA typical, 420 µA max.
- Measured circuit: 0–36 V common mode, up to ±15 A continuous through the shunt.
- I2C up to 2.94 MHz (high-speed mode); 400 kHz is typical.

## Interface details
- **I2C address 0x40** (default); A0 bridged = 0x41, A1 bridged = 0x44, both = 0x45.
- 16-bit registers, sent MSB first; write the register pointer, then read 2 bytes.
- 0x00 Configuration (power-on 0x6127: continuous current + voltage, 1.1 ms conversions, no averaging).
- 0x01 Current: two's complement, **I = raw × 1.25 mA** (positive when current flows Vin+ → Vin-).
- 0x02 Bus voltage: **V = raw × 1.25 mV**.
- 0x03 Power: **P = raw × 10 mW** (always positive).
- 0xFE Manufacturer ID = 0x5449, 0xFF Die ID = 0x2270.

## Wiring
- ESP32: VCC → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VCC → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.
- Measured circuit (high side): supply + → Vin+, Vin- → load +, load − → supply −, and supply − joined to GND.

## Using the driver
```python
from machine import I2C, Pin
from ina260 import INA260
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
s = INA260(i2c)
print('V=%.3fV I=%.1fmA P=%dmW' % (s.voltage(), s.current(), s.power()))
```

## Gotchas
- Join the measured circuit's ground to the board's GND, or the voltage reading floats.
- For low-side sensing (shunt between load and ground) cut the VB jumper and wire VBus to the supply rail, or voltage and power are wrong.
- Carry big currents through the screw terminal with thick wire, never through breadboard rows or the header pins.
- Negative current means the current is flowing from Vin- to Vin+ (wires swapped or a battery charging).
- In the Sparkbench simulator the power register (0x03) is not calculated; multiply voltage() × current() there.

## Datasheet
https://www.ti.com/lit/ds/symlink/ina260.pdf
