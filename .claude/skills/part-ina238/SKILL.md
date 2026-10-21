---
name: part-ina238
description: Pinout, electrical limits, wiring and MicroPython driver for the INA238 85 V 16-bit current, voltage & power monitor (TI INA238, Adafruit #6349). Use when designing, wiring, simulating or writing code for an INA238 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# INA238 85 V 16-bit power monitor (INA238)

## Overview
The **INA238** from Texas Instruments measures a bus voltage of 0–85 V (3.125 mV steps), the voltage across an external shunt (±163.84 mV at 5 µV steps, or ±40.96 mV at 1.25 µV) and its own die temperature (0.125 °C steps), with 16-bit ADCs. Once you write its SHUNT_CAL register it also reports current in amperes and power. It talks I2C. Hobbyists buy it as the **Adafruit INA238 DC Current Voltage Power Monitor (#6349)**: a 15 mΩ shunt (up to about 10 A), 10 kΩ pull-ups on SDA/SCL, A0/A1 address jumpers, two STEMMA QT connectors and a 3.5 mm 3-pin screw terminal. The Adafruit INA237 board is the same hardware and code.

## Pinout (Adafruit INA238 #6349, header order)
| Pin | Function |
|---|---|
| VIN | Logic supply, 3–5 V (same as your microcontroller) |
| GND | Ground, shared with the measured circuit |
| SCL | I2C clock |
| SDA | I2C data |
| VBUS | Bus-voltage sense, 0–85 V (back jumper ties it to VIN+ by default) |
| VIN- | Shunt low side (to the load) |
| VIN+ | Shunt high side (from the supply) |
| ALRT | Alert output, open-drain, active low (optional) |

The screw terminal on the opposite edge carries V- (VIN-), VBus and V+ (VIN+), so the board is wired with jumper leads rather than plugged into a breadboard.

## Electrical limits
- Supply: 2.7–5.5 V (chip); the board is marked 3–5 V. About 640 µA typical, 750 µA max.
- Measured circuit: −0.3 to 85 V common mode, bus voltage 0–85 V. DC only.
- Shunt: ±163.84 mV full scale (ADCRANGE = 0) = about ±10.9 A through 15 mΩ; Adafruit rates it to 10 A.
- I2C up to 2.94 MHz; 400 kHz is typical.

## Interface details
- **I2C address 0x40** (default); A0 bridged = 0x41, A1 bridged = 0x44, both = 0x45.
- Write the register pointer, then read 2 bytes, MSB first. All registers are 16-bit except POWER (08h, 24-bit).
- **Bus voltage = VBUS (05h) × 3.125 mV.** Shunt voltage = VSHUNT (04h, signed) × 5 µV (ADCRANGE = 0). Die temperature = DIETEMP (06h, signed, bits 15-4) × 0.125 °C.
- **SHUNT_CAL = 819.2 × 10⁶ × CURRENT_LSB × R_SHUNT** (×4 when ADCRANGE = 1), with CURRENT_LSB ≥ max current / 2¹⁵. On the Adafruit board (0.015 Ω, 10 A) the driver uses CURRENT_LSB = 500 µA, so SHUNT_CAL = 6144. **Current = CURRENT (07h, signed) × CURRENT_LSB.** Power [W] = 0.2 × CURRENT_LSB × POWER.
- ADC_CONFIG resets to FB68h (continuous bus, shunt and temperature, 1052 µs each, no averaging). The driver sets 16-sample averaging (FB6Ah): a new result about every 50 ms.
- MANUFACTURER_ID (3Eh) = 5449h, DEVICE_ID (3Fh) = 2381h (DIEID 238h in bits 15-4).

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.
- Measured circuit (high side, default jumper): supply + → V+ (VIN+), V- (VIN-) → load +, load − → supply −, supply − joined to GND.

## Using the driver
```python
from machine import I2C, Pin
from ina238 import INA238
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
s = INA238(i2c)  # 0x40, shunt_ohms=0.015, max_amps=10
v, i = s.read()
print('V=%.3fV I=%.1fmA P=%.0fmW T=%.1fC' % (v, i, s.power_mw(), s.die_temperature()))
```

## Gotchas
- CURRENT reads 0 until SHUNT_CAL is written; the driver does it, but a chip reset (CONFIG bit 15) restores the default 1000h.
- Resolution is 500 µA per count with the driver defaults; pass a smaller max_amps (e.g. 2.0) for finer steps if your load is small.
- For low-side sensing cut the VBUS jumper and wire VBUS to the supply rail, or the bus voltage reads the shunt's bottom (about 0 V).
- Join the measured circuit's ground to the board's GND. Never take VIN+, VIN- or VBUS (up to 85 V) to a GPIO.
- Carry big currents through the screw terminal with thick wire, never through breadboard rows or the header pins.
- Negative current means it flows from VIN- to VIN+ (wires swapped, or a battery charging).
- In the Sparkbench simulator VSHUNT, VBUS, DIETEMP and CURRENT are modelled (not POWER or the alert limits); CURRENT does not follow the SHUNT_CAL you write, it assumes the driver's 6144.

## Datasheet
https://www.ti.com/lit/ds/symlink/ina238.pdf
