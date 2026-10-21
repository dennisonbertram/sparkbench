---
name: part-adxl345
description: Pinout, electrical limits, wiring and MicroPython driver for the ADXL345 3-axis accelerometer (Analog Devices ADXL345, GY-291 module). Use when designing, wiring, simulating or writing code for an ADXL345 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# ADXL345 3-axis accelerometer (ADXL345)

## Overview
The **ADXL345** from Analog Devices measures acceleration on X, Y and Z, including gravity, so it senses tilt, vibration, taps and free-fall. Ranges are ±2, ±4, ±8 or ±16 g; in full-resolution mode every range reads 3.9 mg/LSB (256 LSB/g). It talks I2C or SPI. Hobbyists buy it on the **GY-291 module**: a 3.3 V regulator (3–5 V in), 4.7 kΩ pull-ups on SDA/SCL to 3.3 V, CS pulled up (I2C mode) and SDO pulled down (address 0x53).

## Pinout (GY-291 module, header order)
| Pin | Function |
|---|---|
| GND | Ground |
| VCC | Supply, 3–5 V (regulated to 3.3 V on the module) |
| CS | Chip select; pulled high on the module = I2C mode. Leave unconnected for I2C |
| INT1 | Interrupt output 1 (optional) |
| INT2 | Interrupt output 2 (optional) |
| SDO | Address select: pulled low = 0x53, tie to 3.3 V = 0x1D |
| SDA | I2C data |
| SCL | I2C clock |

## Electrical limits
- Chip supply 2.0–3.6 V; the GY-291 regulator accepts 3–5 V on VCC.
- I2C lines are pulled up to 3.3 V on the module, so they are safe for ESP32/Pico.
- Current: 40–145 µA measuring (depends on data rate), 0.1 µA in standby.
- I2C up to 400 kHz.

## Interface details
- **I2C address 0x53** (SDO low, GY-291 default), 0x1D (SDO high).
- DEVID register 0x00 reads **0xE5**.
- Start-up: POWER_CTL (0x2D) = 0x00 (standby), BW_RATE (0x2C) = 0x0A (100 Hz), DATA_FORMAT (0x31) = 0x08 | range (FULL_RES, right-justified; range bits 00 = ±2 g … 11 = ±16 g), then POWER_CTL = 0x08 (Measure). Turn-on takes about 1/ODR + 1.1 ms (≈11 ms at 100 Hz).
- Data: burst-read 6 bytes from 0x32: X0, X1, Y0, Y1, Z0, Z1. Each axis is 16-bit two's complement, **low byte first**.
- Acceleration: a = raw / 256 g (3.9 mg/LSB, full resolution). Multiply by 9.80665 for m/s².

## Wiring
- ESP32: VCC → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VCC → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.
- CS, SDO, INT1, INT2: leave unconnected for basic I2C use.

## Using the driver
```python
from machine import I2C, Pin
from adxl345 import ADXL345
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
x, y, z = ADXL345(i2c).read()
print('X=%.2f Y=%.2f Z=%.2f g' % (x, y, z))
```

## Gotchas
- It powers up in **standby** and returns zeros until the Measure bit is set.
- Read all six data bytes in one burst, or the axes can come from different samples.
- DEVID not 0xE5: loose wire, wrong address (SDO), or CS pulled low (puts it in SPI mode).
- Lying flat it reads about Z = +1 g; that is gravity, not an error.
- If nothing answers at 0x53, run `i2c.scan()`: a board with SDO pulled or wired high answers at 0x1D.

## Datasheet
https://www.analog.com/media/en/technical-documentation/data-sheets/ADXL345.pdf
