---
name: part-tlv493d
description: Pinout, electrical limits, wiring and MicroPython driver for the TLV493D 3D magnetic sensor (Infineon TLV493D-A1B6, Adafruit TLV493D Triple-Axis Magnetometer 4366). Use when designing, wiring, simulating or writing code for a TLV493D in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# TLV493D 3D magnetic sensor (TLV493D-A1B6)

## Overview
The **TLV493D-A1B6** from Infineon measures the magnetic field in X, Y and Z (±130 mT, 12-bit, 0.098 mT/LSB) and has a rough on-chip thermometer. It talks I2C. It is built to track nearby magnets (joysticks, rotary knobs, lid sensors), not the Earth's field. Hobbyists buy it as the **Adafruit TLV493D Triple-Axis Magnetometer - STEMMA QT / Qwiic (product 4366)**, which adds a 3.3 V regulator, level shifters and 10 kΩ pull-ups.

## Pinout (Adafruit 4366, header order)
| Pin | Function |
|---|---|
| VIN | Supply in, 3.3–5 V |
| 3Vo | 3.3 V output of the on-board regulator: leave unconnected |
| GND | Ground |
| SCL | I2C clock |
| SDA | I2C data |

## Electrical limits
- Chip supply 2.8–3.5 V (absolute max 3.5 V): never wire a bare chip to 5 V. The breakout's regulator takes 3.3–5 V on VIN.
- Current: well under 1 mA in low-power mode (7 nA in power-down).
- I2C up to 1 MHz.

## Interface details
- **I2C address 0x5E** (SDA high at power-up, as on the Adafruit board); 0x1F if SDA is low at power-up/reset.
- No register pointer: a read always starts at read register 0; a write is a raw stream into write registers 0–3.
- Powers up in **power-down mode**. To start: read 10 bytes, copy factory bits (read reg 7 bits 4:3 → write reg 1, read reg 8 → write reg 2, read reg 9 bits 4:0 → write reg 3), set the mode (low-power: MOD1 LOW = 1; MOD2 0x40 = 12 ms period, 0x20 = parity check), set MOD1 bit 7 so all 32 written bits have odd parity, write the 4 bytes.
- Read 7 bytes: Bx = r0<<4 | r4>>4, By = r1<<4 | r4&0x0F, Bz = r2<<4 | r5&0x0F (12-bit two's complement × 0.098 mT).
- Temperature raw = (r3&0xF0)<<4 | r6; T = (raw − 340) × 1.1 + 25 °C (±10 °C).
- r3 bits 1:0 (channel) must be 0, otherwise the frame was read mid-conversion.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from tlv493d import TLV493D
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
bx, by, bz, t = TLV493D(i2c).read()
print('X=%.1f Y=%.1f Z=%.1f T=%.1f' % (bx, by, bz, t))
```

## Gotchas
- Without the start-up configuration it stays in power-down and returns stale/zero data.
- A wrong parity bit makes the chip ignore the configuration (parity check enabled).
- If SDA is held low while the board powers up the address becomes 0x1F; the driver's general-call reset (0x00, data 0xFF) re-selects 0x5E.
- Fast and master-controlled modes can hang on some parts; the driver uses low-power mode (~100 Hz).
- It saturates at ±130 mT; a strong neodymium magnet right on top of it will clip.

## Datasheet
https://www.infineon.com/assets/row/public/documents/24/49/infineon-tlv493d-a1b6-datasheet-en.pdf
