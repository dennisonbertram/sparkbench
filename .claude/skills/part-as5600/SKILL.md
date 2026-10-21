---
name: part-as5600
description: Pinout, electrical limits, wiring and MicroPython driver for the AS5600 magnetic angle sensor / rotary encoder (ams AS5600). Use when designing, wiring, simulating or writing code for an AS5600 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# AS5600 magnetic angle sensor (AS5600)

## Overview
The **AS5600** from ams is a contactless 12-bit rotary position sensor. A diametrically magnetised magnet spins above the chip, and the chip reports the shaft angle (4096 counts per turn, about 0.088° per count) over I2C. It also has an analog/PWM angle output. This part is modelled on the **Adafruit AS5600 Magnetic Angle Sensor - STEMMA QT (#6357)**. That board has an AP2127K-3.3 regulator (the chip runs in 3.3 V mode), BSS138 I2C level shifting, 10K pull-ups and two STEMMA QT connectors.

## Pinout (Adafruit #6357, header order)
| Pin | Function |
|---|---|
| VIN | Supply, 3-5 V (same as your board's logic level) |
| 3Vo | 3.3 V regulator output (up to 100 mA). This is an output, so leave it unconnected |
| GND | Ground |
| SCL | I2C clock, 3-5 V logic, 10K pull-up |
| SDA | I2C data, 3-5 V logic, 10K pull-up |
| OUT | Angle output: analog 0-3.3 V ratiometric by default, or PWM (optional) |

The back of the board also has a DIR solder jumper (closed to GND, so the angle rises clockwise; cut it for counter-clockwise) and a PGO test pad (programming option, leave it alone).

## Electrical limits
- Board supply: 3-5 V on VIN. Bare chip: 4.5-5.5 V in 5 V mode, or 3.0-3.6 V in 3.3 V mode (VDD5V tied to VDD3V3, as on this board).
- Current: up to 6.5 mA in normal power mode (1.5-3.4 mA in the low-power modes).
- I2C up to 1 MHz (Fast-mode Plus). Power-up time 10 ms.

## Interface details
- **I2C address 0x36**, fixed. Only one AS5600 fits on each bus.
- RAW ANGLE: **0x0C/0x0D**. ANGLE (scaled by ZPOS/MPOS/MANG, equal to the raw angle on an unprogrammed chip): **0x0E/0x0F**. Read 2 bytes: count = ((b0 & 0x0F) << 8) | b1.
- **Degrees = count × 360 / 4096.**
- STATUS **0x0B**: bit 5 MD = magnet detected, bit 4 ML = magnet too weak, bit 3 MH = magnet too strong.
- AGC **0x1A**: 0-128 in 3.3 V mode, so aim for about the middle. MAGNITUDE **0x1B/0x1C** (12-bit).
- CONF **0x07/0x08**: power mode, hysteresis, output stage (OUTS), PWM frequency, filters, watchdog. Do a read-modify-write.
- **0xFF BURN** permanently programs the chip (ZPOS/MPOS at most 3 times). The driver never writes it.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.
- Optional: OUT → an ADC pin to read the angle as a voltage (0 V = 0°, 3.3 V = 360°).

## Using the driver
```python
from machine import I2C, Pin
from as5600 import AS5600
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
enc = AS5600(i2c)
magnet, weak, strong = enc.status()
print('angle=%.1f deg raw=%d magnet=%s' % (enc.degrees(), enc.raw_angle(), 'yes' if magnet else 'no'))
```

## Gotchas
- Use a **diametric** magnet: N and S on opposite edges, not on the two flat faces. Centre it over the chip, 0.5-3 mm away.
- If MD is 0 or ML/MH is set, the angle is meaningless. Move the magnet closer or further away until AGC sits mid-range.
- The angle wraps from 4095 to 0 each turn. Track the wraps in software if you need multi-turn counting.
- Do not experiment with register 0xFF. Burning OTP is permanent.

## Datasheet
https://files.seeedstudio.com/wiki/Grove-12-bit-Magnetic-Rotary-Position-Sensor-AS5600/res/Magnetic%20Rotary%20Position%20Sensor%20AS5600%20Datasheet.pdf (ams AS5600 v1-06)
