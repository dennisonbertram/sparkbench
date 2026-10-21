---
name: part-ina226
description: Pinout, electrical limits, wiring and MicroPython driver for the INA226 current & power monitor (TI INA226). Use when designing, wiring, simulating or writing code for an INA226 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# INA226 current & power monitor (INA226)

## Overview
The **INA226** from Texas Instruments measures the voltage across a shunt resistor (±81.92 mV, 2.5 µV per count) and a bus voltage of 0–36 V (1.25 mV per count), and can compute current and power. It talks I2C. Hobbyists buy it on the **CJMCU-226 module** with a 0.1 Ω (R100) shunt, which gives about ±0.8 A full scale, and pull-ups on SDA/SCL.

## Pinout (CJMCU-226 module, header order)
| Pin | Function |
|---|---|
| VCC | Chip supply, 2.7–5.5 V (3.3 V recommended) |
| GND | Ground (shared with the microcontroller and the measured circuit) |
| SDA | I2C data |
| SCL | I2C clock |
| ALE | Alert output, open-drain, active low (optional) |
| VBS | Bus voltage sense input, 0–36 V (link to IN- to measure the load voltage) |
| IN- | Shunt low side, to the load's + lead |
| IN+ | Shunt high side, from the supply being measured |

## Electrical limits
- Supply (VCC): 2.7–5.5 V; 330 µA typical, 420 µA max.
- IN+, IN-, VBS: 0–36 V (absolute max 40 V). Never connect them to a GPIO.
- Shunt voltage full scale ±81.92 mV → ±819 mA with the 0.1 Ω shunt.
- I2C up to 2.94 MHz (400 kHz is plenty).

## Interface details
- **I2C address 0x40** (A0, A1 to GND on the module). A0/A1 can select 16 addresses (0x40–0x4F) on boards that expose them.
- 16-bit registers, MSB first: 00h config (POR 4127h), 01h shunt voltage, 02h bus voltage, 03h power, 04h current, 05h calibration, 06h mask/enable, 07h alert limit, FEh manufacturer ID (5449h), FFh die ID (2260h).
- Shunt voltage: signed two's complement × 2.5 µV. Bus voltage: raw × 1.25 mV.
- Current = shunt voltage / R_shunt. (Registers 03h/04h only work after writing the calibration register, CAL = 0.00512 / (Current_LSB × R_shunt); the driver doesn't need them.)
- The driver writes config 4527h: 16 averages, 1.1 ms shunt and bus conversion, continuous mode (about 35 ms per result).

## Wiring
- ESP32: VCC → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VCC → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.
- Measured circuit: supply + → IN+, IN- → load +, link VBS to IN-, supply − → GND.

## Using the driver
```python
from machine import I2C, Pin
from ina226 import INA226
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
v, i = INA226(i2c).read()   # volts, milliamps (0.1 ohm shunt)
print('V=%.3fV I=%.1fmA' % (v, i))
```

## Gotchas
- Bus voltage reads 0 V: VBS is not linked to the shunt on the module; wire it to IN-.
- `INA226 not found`: the manufacturer ID (FEh) didn't read 5449h; check SDA/SCL and power.
- Carry the load current through the big pads/terminal, not thin header pins or breadboard jumpers.
- Boards with an R010 (0.01 Ω) shunt: pass `shunt_ohms=0.01` (about ±8 A full scale).

## Datasheet
https://www.ti.com/lit/ds/symlink/ina226.pdf
