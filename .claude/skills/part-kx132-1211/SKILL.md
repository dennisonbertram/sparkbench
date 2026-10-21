---
name: part-kx132-1211
description: Pinout, electrical limits, wiring and MicroPython driver for the KX132-1211 3-axis accelerometer (Kionix/ROHM KX132-1211, SparkFun Qwiic SEN-17871). Use when designing, wiring, simulating or writing code for a KX132 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# KX132-1211 3-axis accelerometer (KX132-1211)

## Overview
The **KX132-1211** from Kionix (ROHM) measures acceleration on X, Y and Z with a selectable ±2/±4/±8/±16 g range and 16-bit output (16384 counts/g at ±2 g), at output data rates from 0.781 Hz to 25.6 kHz. It talks I2C (up to 3.4 MHz) or SPI and adds a 512-byte FIFO, tap/tilt/free-fall/wake-up engines and two interrupt pins. Hobbyists buy it on the **SparkFun Triple Axis Accelerometer Breakout - KX132 (Qwiic), SEN-17871**: 1" x 1", two Qwiic sockets, 4.7 kΩ I2C pull-ups, **no regulator** (3.3 V only).

## Pinout (SparkFun SEN-17871, main header, left to right on the front)
| Pin | Function |
|---|---|
| GND | Ground |
| 3V3 | Supply, 3.3 V (no regulator; chip max 3.6 V) |
| SDA | I2C data / SPI SDI (4.7 kΩ pull-up) |
| SCL | I2C clock / SPI SCLK (4.7 kΩ pull-up) |
| ADR | Address select / SPI SDO: pulled to 3.3 V on the board = 0x1F (leave open) |
| CS | SPI chip select, pulled to 3.3 V on the board = I2C mode (leave open) |

Second header (3 pins, opposite edge, left to right on the front; from the SparkFun board file J1):
| Pin | Function |
|---|---|
| INT2 | Interrupt output 2, push-pull 3.3 V logic (optional) |
| INT1 | Interrupt output 1, push-pull 3.3 V logic (optional) |
| TRIG | FIFO trigger input, tied to GND by the closed TRIG jumper: leave unconnected unless the jumper is cut |

Because the pins are on two opposite edges, the board is wired with jumper leads rather than plugged into a breadboard as a single row. Only the main header is needed for basic I2C use.

## Electrical limits
- Supply 1.7–3.6 V (VDD and IO_VDD are both on the 3V3 pin); absolute max 3.6 V. **Never 5 V.**
- Current: about 148 µA in high-performance mode, 0.5 µA in stand-by, plus the board's power LED (~1 mA).
- I2C up to 400 kHz fast mode (3.4 MHz high-speed mode supported by the chip).

## Interface details
- **I2C address 0x1F** (ADR high, board default), 0x1E (ADR to GND via the ADR jumper). WHO_AM_I (0x13) = **0x3D**; COTR (0x12) = 0x55.
- Starts in stand-by. Control registers may only be changed with PC1 = 0: write CNTL1 (0x1B) = **0x00**, ODCNTL (0x21) = **0x06** (50 Hz), then CNTL1 = **0xE0** (PC1 = 1, RES = 1 high-performance, DRDYE = 1, GSEL = 00 ±2 g).
- INS2 (0x17) bit 4 DRDY = new data available.
- Read 6 bytes from **0x08** in one transaction (address auto-increments): X_L, X_H, Y_L, Y_H, Z_L, Z_H.
- Each axis is 16-bit two's complement, low byte first: g = raw / 16384 (±2 g), /8192 (±4 g), /4096 (±8 g), /2048 (±16 g).

## Wiring
- ESP32: 3V3 → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: 3V3 → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: 3V3 → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from kx132 import KX132
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
x, y, z = KX132(i2c).read()   # g
print('X=%.3f Y=%.3f Z=%.3f g' % (x, y, z))
```

## Gotchas
- All zeros: the chip is still in stand-by (PC1 never set in CNTL1).
- Changing range or data rate while PC1 = 1 is ignored: go to stand-by first.
- Reading the six output bytes one at a time can mix samples: use a single burst.
- WHO_AM_I not 0x3D: check wiring, or the address (0x1E if the ADR jumper was changed). A KX134 board reads 0x46.
- SparkFun's guide text calls 0x1E the default, but the datasheet (ADDR high = 0x1F), the silkscreen and SparkFun's own library default all say 0x1F; scan the bus if unsure.

## Datasheet
https://kionixfs.azureedge.net/en/datasheet/KX132-1211-Specifications-Rev-1.0.pdf
