---
name: part-hmc5883l
description: Pinout, electrical limits, wiring and MicroPython driver for the HMC5883L 3-axis compass / magnetometer (Honeywell HMC5883L, GY-273 module). Use when designing, wiring, simulating or writing code for an HMC5883L in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# HMC5883L 3-axis compass (HMC5883L)

## Overview
The **HMC5883L** from Honeywell is a three-axis anisotropic magnetoresistive (AMR) magnetometer with a 12-bit ADC. It measures the magnetic field on X, Y and Z (ranges ±0.88 to ±8.1 gauss) and talks I2C, so it is used as an electronic compass. Hobbyists buy it on the **GY-273 module**, which has a 3.3 V regulator (3.3–5 V supply) and pull-ups on SDA/SCL.

**Beware clones:** many boards sold as GY-273 / "HMC5883L" now carry a QMC5883L (address 0x0D, different registers). An I2C scan showing 0x1E means a genuine HMC5883L.

## Pinout (GY-273 module, header order)
| Pin | Function |
|---|---|
| VCC | Supply, 3.3–5 V (onboard 3.3 V regulator) |
| GND | Ground |
| SCL | I2C clock |
| SDA | I2C data |
| DRDY | Data-ready output, pulses low 250 µs when new data is ready (optional) |

## Electrical limits
- Chip: VDD 2.16–3.6 V, VDDIO 1.71 V–VDD; absolute max 4.8 V. The GY-273 regulator lets VCC be 3.3–5 V.
- Current: about 100 µA measuring (7.5 Hz), 2 µA idle.
- I2C 100/400 kHz.

## Interface details
- **I2C address 0x1E** (fixed). ID registers 0x0A–0x0C read ASCII "H43".
- Registers: 0x00 CRA (averaging, output rate, bias), 0x01 CRB (gain, bits 7–5), 0x02 mode (0 = continuous, 1 = single, default), 0x03–0x08 data, 0x09 status (bit 0 RDY, bit 1 LOCK).
- **Data order is X, Z, Y**: 0x03/0x04 X MSB/LSB, 0x05/0x06 Z, 0x07/0x08 Y. Each is 16-bit two's complement MSB first, range −2048…2047; **−4096 means overflow** on that axis.
- Datasheet setup: 0x00 = 0x70 (8 samples, 15 Hz), 0x01 = gain, 0x02 = 0x00 (continuous); the first data is ready after 2/fDO (≈134 ms at 15 Hz). Poll RDY, then read all 6 bytes from 0x03.
- Gain (LSB/gauss): CRB 0x00 → 1370 (±0.88 Ga), **0x20 → 1090 (±1.3 Ga, default)**, 0x40 → 820, 0x60 → 660, 0x80 → 440, 0xA0 → 390, 0xC0 → 330, 0xE0 → 230 (±8.1 Ga). Field in gauss = counts / gain. The first measurement after a gain change still uses the old gain.

## Wiring
- ESP32: VCC → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VCC → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from hmc5883l import HMC5883L
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
compass = HMC5883L(i2c)          # +-1.3 Ga, 1090 LSB/gauss
x, y, z = compass.read()          # gauss; an overflowed axis is None
print('X=%.3fG Y=%.3fG Z=%.3fG' % (x, y, z))
```

## Gotchas
- A board answering at 0x0D is a QMC5883L: this driver raises an error; use a QMC5883L driver instead.
- Always read all six data bytes, or the data registers stay locked.
- Earth's field is about 0.25–0.65 G; strong nearby magnets cause −4096 overflow readings: pick a larger range.
- Keep it flat and away from motors, speakers, magnets and steel screws; calibrate (min/max while turning) before trusting atan2(Y, X).

## Datasheet
https://cdn-shop.adafruit.com/datasheets/HMC5883L_3-Axis_Digital_Compass_IC.pdf
