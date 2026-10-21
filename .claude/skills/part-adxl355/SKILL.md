---
name: part-adxl355
description: Pinout, electrical limits, wiring and MicroPython driver for the ADXL355 low-noise 3-axis accelerometer (Analog Devices ADXL355, EVAL-ADXL355-PMDZ Pmod board wired for I2C). Use when designing, wiring, simulating or writing code for an ADXL355 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# ADXL355 low-noise 3-axis accelerometer (ADXL355)

## Overview
The **ADXL355** from Analog Devices is a low-noise (25 µg/√Hz), low-drift 3-axis MEMS accelerometer with a programmable ±2/±4/±8 g range, 20-bit output (3.9 µg/LSB at ±2 g), an on-chip temperature sensor and a 96-sample FIFO. It is made for tilt/inclination, vibration and structural monitoring. It talks SPI or I2C and picks the bus by itself. The common board is Analog Devices' **EVAL-ADXL355-PMDZ**, a 12-pin Pmod (extended SPI) with no regulator and no I2C pull-ups. Sparkbench uses it wired for I2C.

## Pinout (EVAL-ADXL355-PMDZ, Pmod P1 pins 1–12)
| Pin | Pmod name | In I2C mode |
|---|---|---|
| 1 | CS | SCL (I2C clock), add 4.7 kΩ to 3.3 V |
| 2 | MOSI | SDA (I2C data), add 4.7 kΩ to 3.3 V |
| 3 | MISO | ASEL: GND = 0x1D, 3.3 V = 0x53 |
| 4 | SCLK | Must be tied to GND (VSSIO) for I2C |
| 5 | DGND | Ground |
| 6 | VDD | 3.3 V supply |
| 7 | INT1 | Interrupt 1 (optional) |
| 8 | NC | Not connected |
| 9 | INT2 | Interrupt 2 (optional) |
| 10 | DRDY | Data ready (optional) |
| 11 | DGND | Ground (Sparkbench: DGND2) |
| 12 | VDD | 3.3 V (Sparkbench: VDD2) |

The Pmod is a 2×6 header. Sparkbench lists it as one 12-pin row and wires it with jumper leads.

## Electrical limits
- Supply: 2.25–3.6 V (VSUPPLY and VDDIO). The board has no regulator, so **never use 5 V** and never use 5 V logic.
- Current: about 200 µA measuring, 21 µA in standby.
- I2C: standard, fast (400 kHz), fast-mode plus and high-speed modes.

## Interface details
- **I2C address 0x1D** (ASEL low), 0x53 (ASEL high).
- IDs: 0x00 = 0xAD, 0x01 = 0x1D, 0x02 = 0xED (PARTID).
- It powers up in standby (POWER_CTL 0x2D = 0x01). Configure while in standby, then write 0x00 to start measuring.
- Range 0x2C: bits 1:0 = 01 ±2 g, 10 ±4 g, 11 ±8 g. Bit 7 I2C_HS resets to 1: clear it on a 100/400 kHz bus.
- Filter 0x28: ODR_LPF bits 3:0 (0 = 4 kHz … 5 = 125 Hz … 10 = 3.9 Hz). HPF_CORNER bits 6:4.
- Data: 0x08–0x10 = X3 X2 X1 Y3 Y2 Y1 Z3 Z2 Z1. Each axis is 20-bit twos complement, left justified: raw = (D3<<12)|(D2<<4)|(D1>>4). Read all 9 bytes in one burst; the address auto-increments.
- g = raw / 256000 (±2 g), / 128000 (±4 g), / 64000 (±8 g).
- Temperature: 12-bit raw in TEMP2 0x06 (bits 3:0) and TEMP1 0x07. T = 25 + (raw − 1885) / −9.05 °C. Rev. A of the data sheet gave 1852 LSB; the values are typical.
- Soft reset: write 0x52 to 0x2F.

## Wiring
- ESP32: VDD → 3V3, DGND → GND, SCLK → GND, MISO → GND, MOSI (SDA) → D21, CS (SCL) → D22, 4.7 kΩ from SDA and SCL to 3V3.
- Pico: VDD → 3V3(OUT), DGND → GND, SCLK → GND, MISO → GND, MOSI (SDA) → GP4, CS (SCL) → GP5, 4.7 kΩ pull-ups to 3V3.
- Raspberry Pi 4: VDD → pin 1 (3.3 V), DGND → pin 6, SCLK and MISO → GND, MOSI → pin 3 (SDA), CS → pin 5 (SCL). The Pi already has 1.8 kΩ pull-ups.

## Using the driver
```python
from machine import I2C, Pin
from adxl355 import ADXL355
i2c = I2C(0, sda=Pin(21), scl=Pin(22), freq=400000)
accel = ADXL355(i2c)            # 0x1D, ±2 g, 125 Hz
x, y, z = accel.read()          # g
print('X=%.3f Y=%.3f Z=%.3f g T=%.1fC' % (x, y, z, accel.temperature()))
```

## Gotchas
- If SCLK is left floating, the chip may stay in SPI mode and not answer on I2C.
- If MISO/ASEL floats, the address is unpredictable. Tie it to GND or to 3.3 V.
- All-zero readings mean the chip is still in standby.
- Lying flat, it reads about +1 g on Z: that is gravity.
- DRDY is held low during power-up. Do not use it as a boot-strap pin.
- The temperature sensor tracks die temperature for drift correction. Its absolute accuracy is low.

## Datasheet
https://www.analog.com/media/en/technical-documentation/data-sheets/adxl354_adxl355.pdf
