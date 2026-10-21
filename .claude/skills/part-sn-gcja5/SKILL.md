---
name: part-sn-gcja5
description: Pinout, electrical limits, wiring and MicroPython driver for the Panasonic SN-GCJA5 laser particulate matter (PM1.0 / PM2.5 / PM10) sensor with I2C, as sold by SparkFun (Particle Sensor - SN-GCJA5, SPX-17123). Use when designing, wiring, simulating or writing code for an SN-GCJA5 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# SN-GCJA5 laser particulate matter sensor (SN-GCJA5)

## Overview
The **Panasonic SN-GCJA5** pulls air past a laser diode with a small fan. A photodiode picks up the light scattered by particles, and the sensor's own MCU turns that into PM1.0, PM2.5 and PM10 mass density (µg/m³, ±10 % from 35 to 1000 µg/m³) plus particle counts in six size bins. Everything updates once per second over I2C (and a UART TX line). Hobbyists buy the bare sensor from **SparkFun (Particle Sensor - SN-GCJA5, SPX-17123)**. It is a 37 × 37 × 12 mm box with a 5-pin JST GH connector, wired with a GH-to-jumper cable.

## Pinout (JST GH SM05B-GHS-TB, pin 1 to 5)
| Pin | Name | Function |
|---|---|---|
| 1 | TX | UART TX, 9600 baud 8E1, 3.3 V logic (optional; leave open for I2C) |
| 2 | SDA | I2C data, 3.3 V, 10 kΩ pull-up inside to the sensor's 3.3 V |
| 3 | SCL | I2C clock, 3.3 V, 10 kΩ pull-up inside to the sensor's 3.3 V |
| 4 | GND | Ground (the metal shell is tied to GND too) |
| 5 | VDD | Supply 5 V ±10 % |

## Electrical limits
- Supply: 5 V ±10 % (4.5–5.5 V), under 100 mA.
- Logic: I2C and TX are 3.3 V. They connect straight to an ESP32 or Pico. A 5 V host needs a level shifter.
- Operating: −10 to 60 °C, under 95 % RH (non-condensing).

## Interface details
- **I2C address 0x33** (fixed), up to 400 kHz, 8-bit register address, repeated-start reads.
- Multi-byte values are **little-endian** (low byte first).
- 0x00 PM1.0, 0x04 PM2.5, 0x08 PM10: 4 bytes each, **µg/m³ = raw / 1000**.
- Particle counts, 2 bytes each: 0x0C (0.3–0.5 µm), 0x0E (0.5–1.0), 0x10 (1.0–2.5), 0x14 (2.5–5.0), 0x16 (5.0–7.5), 0x18 (7.5–10). Registers 0x12–0x13 are unused.
- 0x26 STATE: bits 7:6 sensor, 5:4 photodiode, 3:2 laser, 1:0 fan (0 = normal; fan 2 = initial calibration, 3 = fan fault).
- First reading about 8 s after power-up, stable after about 28 s.

## Wiring
- ESP32: VDD → 5V (VIN/VBUS), GND → GND, SDA → D21, SCL → D22, TX open.
- Pico: VDD → VBUS (pin 40), GND → GND, SDA → GP4, SCL → GP5, TX open.
- Raspberry Pi 4: VDD → pin 2 (5 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from sn_gcja5 import SNGCJA5
i2c = I2C(0, sda=Pin(21), scl=Pin(22), freq=100000)
s = SNGCJA5(i2c)
pm1, pm25, pm10 = s.pm()
print('PM1=%.1f PM2.5=%.1f PM10=%.1f ug/m3' % (pm1, pm25, pm10))
print(s.counts(), s.status())
```
`pm()` returns the three mass densities in µg/m³. `counts()` returns the six size-bin counts, and `status()` returns the decoded STATE fields.

## Gotchas
- Feed VDD from 5 V. At 3.3 V the fan and laser are out of spec.
- The sensor already pulls SDA/SCL up to 3.3 V. Never add pull-ups to 5 V, because that would put 5 V on the ESP32/Pico pins.
- JST GH cable colours vary between suppliers. Go by the pin numbers: pin 1 (TX) is at one end and pin 5 (VDD) at the other.
- Readings are 0 for the first ~8 s and noisy until ~28 s after power-up.
- Keep the inlet and outlet clear and out of strong drafts, and keep the grounded metal shell away from other circuitry.

## Datasheet
https://cdn.sparkfun.com/assets/e/b/d/4/5/SN-GCJA5_Product_Specification.pdf
(register map: https://cdn.sparkfun.com/assets/d/d/2/a/e/SN-GCJA5_Communication_Specification.pdf)
