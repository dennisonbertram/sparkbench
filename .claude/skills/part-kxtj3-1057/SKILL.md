---
name: part-kxtj3-1057
description: Pinout, electrical limits, wiring and MicroPython driver for the KXTJ3-1057 3-axis accelerometer (Kionix/ROHM KXTJ3-1057, PTSolns I2Connect Qwiic-compatible module). Use when designing, wiring, simulating or writing code for a KXTJ3 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# KXTJ3-1057 3-axis accelerometer (KXTJ3-1057)

## Overview
The **KXTJ3-1057** from Kionix (ROHM) is a low-power accelerometer measuring X, Y and Z with a selectable ±2/±4/±8/±16 g range in 8-bit (low power), 12-bit or 14-bit (±8/±16 g only) resolution, at 0.781–1600 Hz. It talks I2C (up to 3.4 MHz) and has a motion wake-up engine with one push-pull interrupt pin. Modelled board: the **PTSolns I2Connect: KXTJ3-1057** module, which has two Qwiic-compatible JST SH sockets, an onboard regulator and I2C level shifting ("3.3/5V Rated"), a power LED and a 5-pin right-angle header. (SparkFun does not sell a KXTJ3 Qwiic board.)

## Pinout (PTSolns I2Connect: KXTJ3-1057, header order as listed by PTSolns)
| Pin | Function |
|---|---|
| INT | Interrupt output, push-pull at the chip's regulated logic level (optional) |
| SCL | I2C clock (level-shifted, pulled up to the module supply) |
| SDA | I2C data (level-shifted, pulled up to the module supply) |
| 3V3 | Module supply into the onboard regulator (3.3 V or 5 V rated) |
| GND | Ground |

The Qwiic sockets carry GND, VCC, SDA, SCL in the standard Qwiic order.

## Electrical limits
- Chip: 1.71–3.6 V (VDD and IO_VDD), supplied by the module's regulator.
- Module: rated for 3.3 V and 5 V systems. The I2C pull-ups go to the supply pin, so **power it from 3.3 V with an ESP32, Pico or Raspberry Pi**; from 5 V the bus would idle at 5 V.
- Current: about 155 µA (high resolution), 10 µA low power, 0.9 µA stand-by, plus the power LED.
- Power-up (supply to boot complete) up to 30 ms; the chip NACKs until then.

## Interface details
- **I2C address 0x0E** (board default, ADDR to GND); 0x0F with the ADDR pad changed. WHO_AM_I (0x0F) = **0x35**; DCST_RESP (0x0C) = 0x55.
- Starts in stand-by. CTRL_REG1, CTRL_REG2, INT_CTRL_REG1/2 and DATA_CTRL_REG change only with PC1 = 0: write CTRL_REG1 (0x1B) = **0x00**, DATA_CTRL_REG (0x21) = **0x02** (50 Hz), then CTRL_REG1 = **0xC0** (PC1 = 1, RES = 1 for 12-bit, ±2 g).
- Range bits in CTRL_REG1 (GSEL1 bit 4, GSEL0 bit 3, EN16G bit 2): 000 ±2 g, 010 ±4 g, 100 ±8 g, 110 ±8 g 14-bit, 001 ±16 g, 111 ±16 g 14-bit.
- Read 6 bytes from **0x06** in one burst: X_L, X_H, Y_L, Y_H, Z_L, Z_H. Two's complement, low byte first, **left-justified**: raw16 >> 4 for 12-bit (>> 2 for 14-bit).
- Sensitivity, 12-bit: 1024 / 512 / 256 / 128 counts/g at ±2/4/8/16 g; 14-bit: 1024 (±8 g), 512 (±16 g).
- Start-up after setting PC1 is about 1/ODR.

## Wiring
- ESP32: 3V3 → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: 3V3 → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: 3V3 → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.
- Or use a Qwiic / STEMMA QT cable to a board with a 3.3 V Qwiic socket.

## Using the driver
```python
from machine import I2C, Pin
from kxtj3 import KXTJ3
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
x, y, z = KXTJ3(i2c).read()   # g, 12-bit, ±2 g
print('X=%.3f Y=%.3f Z=%.3f g' % (x, y, z))
```
`KXTJ3(i2c, g_range=16, bits=14)` selects the 14-bit ±16 g mode.

## Gotchas
- All zeros: still in stand-by (PC1 never set).
- Range/rate writes while PC1 = 1 are ignored: go to stand-by first.
- Forgetting the left-justification gives readings 16x too large in 12-bit mode.
- In 8-bit low-power mode (RES = 0) only the _H registers are valid; this driver always uses high resolution.
- Rates of 400 Hz and above force high-resolution mode.
- WHO_AM_I not 0x35: check wiring, or the address (0x0F if the ADDR pad was changed).

## Datasheet
https://cdn.sparkfun.com/assets/c/e/a/5/c/KXTJ3-1057.pdf
