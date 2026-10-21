---
name: part-mpl3115a2
description: Pinout, electrical limits, wiring and MicroPython driver for the MPL3115A2 pressure / altitude / temperature sensor (NXP MPL3115A2). Use when designing, wiring, simulating or writing code for an MPL3115A2 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MPL3115A2 altimeter / pressure sensor (MPL3115A2)

## Overview
The **MPL3115A2** from NXP measures absolute air pressure (calibrated 50–110 kPa, works 20–110 kPa, ±0.4 kPa absolute, 1.5 Pa RMS noise at 128× oversampling) and temperature (−40 to 85 °C, ±1 °C at 25 °C). It can also convert pressure to altitude by itself (altimeter mode). It talks I2C at the fixed address **0x60**. Hobbyists buy it on the **Adafruit MPL3115A2 I2C Barometric Pressure/Altitude/Temperature Sensor breakout (#1893)**, which has a 3.3 V regulator and level shifting on SCL/SDA with pull-ups.

## Pinout (Adafruit MPL3115A2 #1893, header order)
| Pin | Function |
|---|---|
| VIN | Supply, 3–5 V into the on-board 3.3 V regulator |
| GND | Ground |
| 3VO | 3.3 V output of the regulator (leave unconnected) |
| INT2 | Interrupt 2 output (optional) |
| INT1 | Interrupt 1 output (optional) |
| SCL | I2C clock (level shifted, pull-up on board) |
| SDA | I2C data (level shifted, pull-up on board) |

## Electrical limits
- Chip VDD 1.95–3.6 V (absolute max 3.6 V); the breakout's regulator takes 3–5 V on VIN.
- Current: up to 2 mA while converting, a few µA idle in standby.
- I2C up to 400 kHz; the address 0x60 cannot be changed (only one per bus).

## Interface details
- **WHO_AM_I** (0x0C) reads **0xC4**.
- Setup (in standby): CTRL_REG1 (0x26) = 0x38 (barometer, 128× oversampling); PT_DATA_CFG (0x13) = 0x07 (data-ready flags).
- One-shot: write 0x3A to CTRL_REG1 (sets OST), poll STATUS (0x00) bit 3 PTDR, up to 512 ms at 128×.
- Read 5 bytes from 0x01: OUT_P (3 bytes) then OUT_T (2 bytes). Use a repeated-start read (MicroPython's readfrom_mem does).
- Pressure: 20-bit unsigned Q18.2, left-justified: P = (raw24 >> 4) / 4 Pa (0.25 Pa per LSB).
- Temperature: 12-bit signed Q8.4, left-justified: T = (raw16 >> 4, two's complement) / 16 °C.
- Altimeter mode (CTRL_REG1 bit 7 ALT = 1) puts altitude in OUT_P instead (signed Q16.4 metres, referenced to BAR_IN 0x14/0x15, default 101 326 Pa). The driver stays in barometer mode and computes altitude itself: h = 44330.77 × (1 − (P / 101326)^0.1902632) m.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from mpl3115a2 import MPL3115A2
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
sensor = MPL3115A2(i2c)
p, t = sensor.read()
print('P=%.2fPa T=%.2fC A=%.1fm' % (p, t, sensor.altitude(p)))
```

## Gotchas
- CTRL_REG1 settings other than OST/SBYB/RST can only be changed in standby (SBYB = 0).
- The chip needs repeated-start reads; a STOP between register address and read returns wrong data on some hosts.
- Altitude is only as good as the sea-level reference: set `sea_level_pa` to your local QNH for absolute height.
- Keep the vent hole uncovered and out of drafts and sunlight.

## Datasheet
https://www.nxp.com/docs/en/data-sheet/MPL3115A2.pdf
