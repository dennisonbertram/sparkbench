---
name: part-ina228
description: Pinout, electrical limits, wiring and MicroPython driver for the INA228 85 V 20-bit current, voltage & power monitor (TI INA228). Use when designing, wiring, simulating or writing code for an INA228 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# INA228 85 V 20-bit power monitor (INA228)

## Overview
The **INA228** from Texas Instruments measures a bus voltage of 0–85 V (195.3125 µV steps) and the voltage across an external shunt (±163.84 mV at 312.5 nV steps, or ±40.96 mV at 78.125 nV), with 20-bit ADCs. Once you write its SHUNT_CAL register it also reports current in amperes, plus power, energy and charge. It talks I2C. Hobbyists buy it as the **Adafruit INA228 breakout (#5832)**: a 15 mΩ shunt (up to about 10 A), 10 kΩ pull-ups on SDA/SCL, A0/A1 address jumpers, two STEMMA QT connectors and a 3-pin screw terminal.

## Pinout (Adafruit INA228 #5832, header order)
| Pin | Function |
|---|---|
| VIN | Logic supply, 3–5 V (same as your microcontroller) |
| GND | Ground, shared with the measured circuit |
| SCL | I2C clock |
| SDA | I2C data |
| VBUS | Bus-voltage sense, 0–85 V (back jumper ties it to VIN+) |
| VIN- | Shunt low side (to the load) |
| VIN+ | Shunt high side (from the supply) |
| ALRT | Alert output, open-drain, active low (optional) |

The screw terminal on the opposite edge carries V- (VIN-), VBus and V+ (VIN+), so the board is wired with jumper leads rather than plugged into a breadboard.

## Electrical limits
- Supply: 2.7–5.5 V (chip); the board is marked 3–5 V. About 640 µA typical, 750 µA max.
- Measured circuit: −0.3 to 85 V common mode, bus voltage 0–85 V.
- Shunt: ±163.84 mV full scale (ADCRANGE = 0) = about ±10.9 A through 15 mΩ; Adafruit rates it to 10 A.
- I2C up to 2.94 MHz; 400 kHz is typical.

## Interface details
- **I2C address 0x40** (default); A0 bridged = 0x41, A1 bridged = 0x44, both = 0x45.
- Write the register pointer, then read. Bytes come MSB first. CONFIG (00h), ADC_CONFIG (01h), SHUNT_CAL (02h) and the IDs are 16-bit; **VSHUNT (04h), VBUS (05h), CURRENT (07h) and POWER (08h) are 24-bit: read 3 bytes**. ENERGY and CHARGE are 40-bit.
- VSHUNT, VBUS and CURRENT hold a 20-bit result in bits 23-4 (shift right by 4). VSHUNT and CURRENT are two's complement.
- **Bus voltage = VBUS × 195.3125 µV.** Shunt voltage = VSHUNT × 312.5 nV (ADCRANGE = 0).
- **SHUNT_CAL = 13107.2 × 10⁶ × CURRENT_LSB × R_SHUNT** (×4 when ADCRANGE = 1), with CURRENT_LSB ≥ max current / 2¹⁹. On the Adafruit board (0.015 Ω, 10 A) the driver uses CURRENT_LSB = 20 µA, so SHUNT_CAL = 3932. **Current = CURRENT × CURRENT_LSB.** Power [W] = 3.2 × CURRENT_LSB × POWER.
- ADC_CONFIG resets to FB68h (continuous bus, shunt and temperature, 1052 µs each, no averaging). The driver sets 16-sample averaging (FB6Ah): a new result about every 50 ms.
- MANUFACTURER_ID (3Eh) = 5449h, DEVICE_ID (3Fh) = 2281h (DIEID 228h in bits 15-4).

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.
- Measured circuit (high side): supply + → V+ (VIN+), V- (VIN-) → load +, load − → supply −, supply − joined to GND, and the VBUS jumper bridged (or VBUS wired to the supply rail).

## Using the driver
```python
from machine import I2C, Pin
from ina228 import INA228
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
s = INA228(i2c)  # 0x40, shunt_ohms=0.015, max_amps=10
v, i = s.read()
print('V=%.3fV I=%.1fmA P=%.0fmW' % (v, i, s.power_mw()))
```

## Gotchas
- CURRENT reads 0 until SHUNT_CAL is written; the driver does it, but a chip reset (CONFIG bit 15) clears it again.
- The 24-bit registers must be read as 3 bytes; reading 2 bytes gives a wrong value.
- VBUS is not connected by default (low-side mode): bridge the jumper or wire VBUS, or the voltage reads 0 V.
- Join the measured circuit's ground to the board's GND. Never take VIN+, VIN- or VBUS (up to 85 V) to a GPIO.
- Carry big currents through the screw terminal with thick wire, never through breadboard rows or the header pins.
- Negative current means it flows from VIN- to VIN+ (wires swapped, or a battery charging).
- In the Sparkbench simulator only VBUS and CURRENT are modelled (not VSHUNT, DIETEMP, POWER, ENERGY or CHARGE); the driver's power_mw() multiplies voltage × current.

## Datasheet
https://www.ti.com/lit/ds/symlink/ina228.pdf
