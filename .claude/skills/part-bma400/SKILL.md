---
name: part-bma400
description: Pinout, electrical limits, wiring and MicroPython driver for the BMA400 ultra-low-power 3-axis accelerometer (Bosch Sensortec BMA400, SparkFun Qwiic SEN-21208). Use when designing, wiring, simulating or writing code for a BMA400 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# BMA400 ultra-low-power 3-axis accelerometer (BMA400)

## Overview
The **BMA400** from Bosch Sensortec measures acceleration on X, Y and Z with a selectable ±2/±4/±8/±16 g range and 12-bit output (1024 LSB/g at ±2 g), at 12.5–800 Hz in normal mode. It draws only 14.5 µA in normal mode, 850 nA in low-power mode and 160 nA asleep, and adds a 1 KB FIFO, step counter, activity/orientation/tap engines, an 8-bit temperature sensor and two interrupt pins. It talks I2C or SPI. Hobbyists buy it on the **SparkFun Triple Axis Accelerometer Breakout - BMA400 (Qwiic), SEN-21208**: 1" x 1", two Qwiic sockets, 2.2 kΩ I2C pull-ups, **no regulator** (3.3 V only).

## Pinout (SparkFun SEN-21208, main header, left to right on the front)
| Pin | Function |
|---|---|
| GND | Ground |
| 3V3 | Supply, 3.3 V (no regulator; chip max 3.6 V) |
| SDA/PICO | I2C data / SPI data in (2.2 kΩ pull-up) |
| SCL/SCK | I2C clock / SPI clock (2.2 kΩ pull-up) |
| ADR/POCI | Address select / SPI data out: 10 kΩ to GND via the ADR jumper = 0x14 (leave open) |
| CS | SPI chip select, 10 kΩ pull-up to 3.3 V = I2C mode (leave open) |

Second header (2 pins, opposite edge, left to right on the front):
| Pin | Function |
|---|---|
| INT2 | Interrupt output 2, push-pull 3.3 V logic (optional) |
| INT1 | Interrupt output 1, push-pull 3.3 V logic (optional) |

Because the pins are on two opposite edges, the board is wired with jumper leads rather than plugged into a breadboard as a single row. Only the main header is needed for basic I2C use.

## Electrical limits
- Supply 1.72–3.6 V (VDD and VDDIO are both on the 3V3 pin); absolute max 3.6 V. **Never 5 V.**
- Current: 14.5 µA in normal mode (osr 3), plus the board's power LED (~1 mA; cut the PWR jumper to save it).
- I2C up to 1 MHz (400 kHz is a safe default).

## Interface details
- **I2C address 0x14** (SDO low, board default), 0x15 (SDO high). CHIPID (0x00) = **0x90**.
- Boots into **sleep mode** (no data). Soft reset: write 0xB6 to CMD (0x7E).
- Configure: ACC_CONFIG1 (0x1A) = **0x38** (±2 g, osr 3, 100 Hz), ACC_CONFIG2 (0x1B) = 0x00 (data from filter 1), ACC_CONFIG0 (0x19) = **0x02** (normal mode). Wait 2/ODR (20 ms at 100 Hz).
- STATUS (0x03): bit 7 drdy, bits 2:1 power mode (2 = normal).
- Read 6 bytes from **0x04** in one burst: X_LSB, X_MSB, Y_LSB, Y_MSB, Z_LSB, Z_MSB.
- Each axis: v = LSB + 256 × (MSB & 0x0F); if v > 2047: v −= 4096. g = v / 1024 (±2 g), /512 (±4 g), /256 (±8 g), /128 (±16 g).
- TEMP_DATA (0x11): signed 8-bit, T = value × 0.5 + 23 °C.

## Wiring
- ESP32: 3V3 → 3V3, GND → GND, SDA/PICO → D21, SCL/SCK → D22.
- Pico: 3V3 → 3V3(OUT), GND → GND, SDA/PICO → GP4, SCL/SCK → GP5.
- Raspberry Pi 4: 3V3 → pin 1 (3.3 V), GND → pin 6, SDA/PICO → pin 3, SCL/SCK → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from bma400 import BMA400
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
accel = BMA400(i2c)
x, y, z = accel.read()   # g
print('X=%.3f Y=%.3f Z=%.3f g T=%.1f C' % (x, y, z, accel.temperature()))
```

## Gotchas
- All zeros: the chip is still in sleep mode (ACC_CONFIG0 power_mode never set to normal).
- The power-on range is ±4 g (ACC_CONFIG1 = 0x49), not ±2 g: set the range or divide by 512.
- Reading the six output bytes one at a time can mix samples: use a single burst.
- The data sheet's flow-chart example shows a burst read from 0x08; the register map (and Bosch's API) puts X at **0x04**.
- CHIPID not 0x90: check wiring, or the address (0x15 if the ADR jumper was changed).
- Low-power mode fixes the data rate at 25 Hz and ignores other settings.

## Datasheet
https://www.bosch-sensortec.com/media/boschsensortec/downloads/datasheets/bst-bma400-ds000.pdf
