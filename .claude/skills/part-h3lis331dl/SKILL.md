---
name: part-h3lis331dl
description: Pinout, electrical limits, wiring and MicroPython driver for the H3LIS331DL high-g 3-axis accelerometer (STMicroelectronics H3LIS331DL, Adafruit #4627). Use when designing, wiring, simulating or writing code for an H3LIS331DL in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# H3LIS331DL high-g 3-axis accelerometer (H3LIS331DL)

## Overview
The **H3LIS331DL** from STMicroelectronics measures very large accelerations on X, Y and Z with a selectable ±100/±200/±400 g range and 12-bit output (49 mg/digit at ±100 g). It talks I2C or SPI, has two interrupt generators and data rates from 0.5 Hz to 1 kHz. It is meant for impacts, crashes and rocketry; its 0.05 g steps and ±1 g offset make it a poor tilt sensor. Hobbyists buy it on the **Adafruit H3LIS331 breakout (#4627, STEMMA QT)**, which adds a 3.3 V regulator, level shifting and 10 kΩ pull-ups so it runs from 3–5 V.

## Pinout (Adafruit #4627, main header, left to right)
| Pin | Function |
|---|---|
| VIN | Supply, 3–5 V (regulated to 3.3 V on the board) |
| 3Vo | 3.3 V regulator output (up to 100 mA): leave unconnected |
| GND | Ground |
| SCL | I2C clock (10 kΩ pull-up) |
| SDA | I2C data (10 kΩ pull-up) |
| INT | Interrupt 1 output, 3.3 V (optional) |

The board's second 6-pin row (I2, NC, NC, NC, SDO, CS) is not needed for I2C: leave it open. SDO open = address 0x18, SDO to 3.3 V = 0x19. CS is pulled high (I2C); pulling it low selects SPI. Two STEMMA QT / Qwiic sockets carry the same I2C bus.

## Electrical limits
- Chip supply 2.16–3.6 V (absolute max 4.8 V); the breakout's VIN accepts 3–5 V.
- Current: about 300 µA in normal mode, plus the board's regulator and power LED.
- I2C up to 400 kHz.

## Interface details
- **I2C address 0x18** (SDO low/open), 0x19 (SDO high). WHO_AM_I (0x0F) = **0x32**.
- Powers up in power-down mode (CTRL_REG1 = 0x07): write CTRL_REG1 (0x20) = **0x2F** (PM = 001 normal mode, DR = 01 100 Hz, X/Y/Z on). Turn-on time is 1/ODR + 1 ms.
- CTRL_REG4 (0x23) = **0x80**: BDU = 1, BLE = 0 (low byte first), FS = 00 ±100 g (01 = ±200 g, 11 = ±400 g).
- STATUS_REG (0x27) bit 3 ZYXDA = new X/Y/Z data available.
- Read 6 bytes from **0xA8** (OUT_X_L 0x28 with the auto-increment bit 0x80): X_L, X_H, Y_L, Y_H, Z_L, Z_H.
- Each axis is 16-bit two's complement, low byte first, **left-justified 12-bit**: value = int16 >> 4, then × 49 mg (±100 g), 98 mg (±200 g) or 195 mg (±400 g).

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from h3lis331dl import H3LIS331DL
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
x, y, z = H3LIS331DL(i2c, g_range=100).read()   # g
print('X=%.1f Y=%.1f Z=%.1f g' % (x, y, z))
```

## Gotchas
- All zeros means the chip is still in power-down: CTRL_REG1 was never written.
- Forgetting the 0x80 auto-increment bit makes a 6-byte read return OUT_X_L six times over.
- The data is left-justified: forgetting the >> 4 gives values 16 times too large.
- FS = 10 is not a valid range; use 00, 01 or 11.
- WHO_AM_I not 0x32: check wiring, or the address (0x19 if SDO is tied high).
- At rest it will not read a clean 1 g: the zero-g offset is up to ±1 g. Use it for shocks, not tilt.
- Do not feed power into 3Vo; power the board through VIN.

## Datasheet
https://www.st.com/resource/en/datasheet/h3lis331dl.pdf
