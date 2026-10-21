---
name: part-mmc5603
description: Pinout, electrical limits, wiring and MicroPython driver for the MMC5603 3-axis magnetometer (MEMSIC MMC5603NJ). Use when designing, wiring, simulating or writing code for an MMC5603 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MMC5603 3-axis magnetometer (MMC5603NJ)

## Overview
The **MMC5603NJ** from MEMSIC is a 3-axis AMR magnetic sensor: ±30 G on each axis, 20-bit output (16384 counts/G, 0.0625 mG), about 2 mG RMS noise, on-chip SET/RESET degaussing and a die temperature sensor. It talks I2C (fast mode, 400 kHz) at fixed address **0x30**. Hobbyists buy it on the **Adafruit Triple-axis Magnetometer - MMC5603 [STEMMA QT / Qwiic] (#5579)**, which has a 3.3 V regulator, 10k I2C pull-ups and two STEMMA QT connectors.

## Pinout (Adafruit #5579, header order)
| Pin | Function |
|---|---|
| VIN | Supply, 3–5 V (regulated down to 3.3 V on the board) |
| 3Vo | 3.3 V regulator output, up to 100 mA (optional) |
| GND | Ground |
| SCL | I2C clock (pull-up on board) |
| SDA | I2C data (pull-up on board) |

## Electrical limits
- Chip VDD 1.62–3.6 V (absolute max 5 V); the board's VIN takes 3–5 V.
- Current: 0.75–3.4 mA while measuring continuously at 100 Hz (depends on bandwidth), about 1 µA powered down.
- Field range ±30 G per axis; a field above about 32 G needs a SET/RESET to recover.
- I2C up to 400 kHz.

## Interface details
- **I2C address 0x30**, Product ID register 0x39 = 0x10.
- One-shot measurement: write 0x21 (Take_meas_M + Auto_SR_en) to **0x1B**, poll **0x18** bit 6 (Meas_m_done), read 9 bytes from **0x00**.
- Each axis is 20-bit unsigned: 0x00/0x01 = X[19:12], X[11:4]; 0x02/0x03 = Y; 0x04/0x05 = Z; top nibble of 0x06/0x07/0x08 = X/Y/Z[3:0].
- Field in gauss = (raw20 − 524288) / 16384 (16-bit mode: (raw16 − 32768) / 1024).
- Temperature: write 0x02 to 0x1B, poll 0x18 bit 7, T = −75 + 0.8 × reg 0x09 °C.
- Measurement time 6.6 / 3.5 / 2.0 / 1.2 ms for bandwidth 0–3 (0x1C bits 1..0). Software reset: 0x80 to 0x1C, then wait 20 ms.
- SET = 0x08 to 0x1B, RESET = 0x10 to 0x1B, at least 1 ms before the next operation.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.
- Or use a STEMMA QT / Qwiic cable.

## Using the driver
```python
from machine import I2C, Pin
from mmc5603 import MMC5603
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
mag = MMC5603(i2c)
x, y, z = mag.read()          # gauss
print('X=%.4fG Y=%.4fG Z=%.4fG T=%.1fC' % (x, y, z, mag.temperature()))
```

## Gotchas
- The outputs are unsigned with an offset (524288 = zero field), not two's complement.
- Status bit 6 of 0x18 is the magnetic data-ready flag (the datasheet text says "bit 1", but its register table and working drivers use bit 6).
- Earth's field is only 0.25–0.65 G: keep the board away from magnets, motors, speakers and steel screws, and calibrate offsets before computing a heading.
- In the Sparkbench simulator the readings have 1/1024 G resolution (the low nibble registers read 0); the real chip gives the full 20 bits.

## Datasheet
https://www.memsic.com/Public/Uploads/uploadfile/files/20220119/MMC5603NJDatasheetRev.B.pdf
