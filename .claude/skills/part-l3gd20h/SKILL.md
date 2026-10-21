---
name: part-l3gd20h
description: Pinout, electrical limits, wiring and MicroPython driver for the L3GD20H 3-axis gyroscope (STMicroelectronics L3GD20H angular rate sensor). Use when designing, wiring, simulating or writing code for an L3GD20H in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# L3GD20H 3-axis gyroscope (L3GD20H)

## Overview
The **L3GD20H** from STMicroelectronics is a 3-axis digital gyroscope. It measures how fast it is rotating around X, Y and Z, with a selectable range of ±245, ±500 or ±2000 degrees per second and 16-bit output. It talks I2C (or SPI). This part models the **Adafruit L3GD20H Triple-Axis Gyro Breakout Board (#1032)**. That board has a 3.3 V regulator, level shifting and 10 kΩ pull-ups on SDA/SCL, so it works from 3–5 V. SA0 is pulled high, which gives I2C address 0x6B.

## Pinout (Adafruit #1032, one 9-pin header, left to right as printed)
| Pin | Function |
|---|---|
| SCL | I2C clock (SPI clock) |
| SDA | I2C data (SPI data in) |
| SA0 | I2C address bit (pulled high = 0x6B, GND = 0x6A) / SPI data out |
| CS | Pulled high = I2C; low = SPI. Leave unconnected for I2C |
| DRDY | Data-ready / INT2 output (optional) |
| INT1 | Interrupt 1 output (optional) |
| GND | Ground |
| 3Vo | 3.3 V regulator output (leave unconnected) |
| Vin | Supply, 3–5 V |

## Electrical limits
- Board supply (Vin): 3–5 V. The chip itself runs at 2.2–3.6 V (absolute max 4.8 V), and the board's regulator handles that.
- Current: about 5 mA in normal mode, 2.5 mA in sleep, 1 µA powered down.
- I2C up to 400 kHz.

## Interface details
- **I2C address 0x6B** (SA0 high, board default) or 0x6A (SA0 to GND). WHO_AM_I (0x0F) = **0xD7**.
- The chip powers up in power-down mode (CTRL1 = 0x07, PD = 0). Write CTRL4 (0x23) = 0x80 (block data update, ±245 dps), then CTRL1 (0x20) = 0x0F (100 Hz, normal mode, X/Y/Z on). Allow 50 ms turn-on time.
- CTRL4 FS bits [5:4]: 00 = ±245 dps, 01 = ±500 dps, 1x = ±2000 dps.
- STATUS (0x27) bit 3 ZYXDA = new X/Y/Z data.
- Outputs OUT_X_L..OUT_Z_H (0x28–0x2D): 16-bit two's complement, **low byte first**. For a burst read, set the MSB of the register address (read from **0xA8**) to auto-increment.
- Sensitivity: **8.75 / 17.5 / 70 mdps per digit** at ±245 / 500 / 2000 dps.
- OUT_TEMP (0x26) is a relative temperature (−1 LSB/°C, no absolute offset given), so it is not modelled.

## Wiring
- ESP32: Vin → 3V3, GND → GND, SDA → D21, SCL → D22. Leave SA0, CS, DRDY, INT1 and 3Vo unconnected.
- Pico: Vin → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: Vin → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from l3gd20h import L3GD20H
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
gyro = L3GD20H(i2c)          # addr=0x6A if SA0 is tied to GND; fs=245/500/2000
print(gyro.read())           # (x, y, z) in degrees per second
print(gyro.read_rads())      # (x, y, z) in radians per second
```

## Gotchas
- WHO_AM_I 0xD4 means you have the older L3GD20 (or L3G4200D). Its registers are close but not identical, and early Adafruit #1032 boards shipped with it.
- Reading all zeros means CTRL1 PD is still 0, so the chip is powered down.
- Without the 0x80 auto-increment bit, a 6-byte read returns the same register six times.
- A gyro at rest still reads a few dps (zero-rate level up to ±25 dps at 2000 dps full scale). Average some still readings and subtract them.
- If CS is pulled low, the chip switches to SPI and stops answering on I2C.

## Datasheet
https://www.st.com/resource/en/datasheet/l3gd20h.pdf
