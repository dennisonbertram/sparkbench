---
name: part-lis331hh
description: Pinout, electrical limits, wiring and MicroPython driver for the LIS331HH ±6/±12/±24 g 3-axis accelerometer (STMicroelectronics LIS331HH, Adafruit #4626). Use when designing, wiring, simulating or writing code for an LIS331HH in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# LIS331HH high-g 3-axis accelerometer (LIS331HH)

## Overview
The **LIS331HH** from STMicroelectronics measures acceleration on X, Y and Z with a selectable ±6/±12/±24 g range and 12-bit output (3 mg/digit at ±6 g). It talks I2C or SPI, has two interrupt generators and data rates from 0.5 Hz to 1 kHz. It suits jumps, crashes, sports and rocketry where an ordinary ±2/±4 g accelerometer would clip. Hobbyists buy it on the **Adafruit LIS331 Triple-Axis Wide-Range ±24g Accelerometer breakout (#4626, STEMMA QT)**, which adds a 3.3 V regulator, level shifting and 10 kΩ pull-ups so it runs from 3–5 V.

## Pinout (Adafruit #4626, two 6-pin headers on opposite edges, 0.5 in apart)
| Header | Pin | Function |
|---|---|---|
| Main row | VIN | Supply, 3–5 V (regulated to 3.3 V on the board) |
| Main row | 3Vo | 3.3 V regulator output (up to 100 mA): leave unconnected |
| Main row | GND | Ground |
| Main row | SCL | I2C clock (10 kΩ pull-up) |
| Main row | SDA | I2C data (10 kΩ pull-up) |
| Main row | INT | Interrupt 1 output, 3.3 V (optional) |
| Second row | I2 | Interrupt 2 output, 3.3 V (optional) |
| Second row | NC1–NC3 (printed NC) | No connection, mechanical support only |
| Second row | SDO | I2C address: open/GND = 0x18, 3.3 V = 0x19 (SPI data out in SPI mode) |
| Second row | CS | Pulled high = I2C; pulling it low selects SPI |

For I2C the second row can stay open (address 0x18). The two rows sit on opposite edges, so Sparkbench wires the board with jumper leads. Two STEMMA QT / Qwiic sockets carry the same I2C bus.

## Electrical limits
- Chip supply 2.16–3.6 V (absolute max 6 V); the breakout's VIN accepts 3–5 V.
- Current: about 250 µA in normal mode (10 µA low-power, 1 µA power-down), plus the board's regulator and power LED.
- I2C up to 400 kHz.

## Interface details
- **I2C address 0x18** (SDO low/open), 0x19 (SDO high). WHO_AM_I (0x0F) = **0x32**.
- Powers up in power-down mode (CTRL_REG1 = 0x07): write CTRL_REG1 (0x20) = **0x2F** (PM = 001 normal mode, DR = 01 100 Hz, X/Y/Z on). Turn-on time is 1/ODR + 1 ms.
- CTRL_REG4 (0x23) = **0x80**: BDU = 1, BLE = 0 (low byte first), FS = 00 ±6 g (01 = ±12 g, 11 = ±24 g).
- STATUS_REG (0x27) bit 3 ZYXDA = new X/Y/Z data available.
- Read 6 bytes from **0xA8** (OUT_X_L 0x28 with the auto-increment bit 0x80): X_L, X_H, Y_L, Y_H, Z_L, Z_H.
- Each axis is 16-bit two's complement, low byte first, **left-justified 12-bit**: value = int16 >> 4, then × 3 mg (±6 g), 6 mg (±12 g) or 12 mg (±24 g) (datasheet typical sensitivity; the exact LSB is 2 × FS / 4096, e.g. 2.93 mg at ±6 g).

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from lis331hh import LIS331HH
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
x, y, z = LIS331HH(i2c, g_range=6).read()   # g
print('X=%.2f Y=%.2f Z=%.2f g' % (x, y, z))
```

## Gotchas
- All zeros means the chip is still in power-down: CTRL_REG1 was never written.
- Forgetting the 0x80 auto-increment bit makes a 6-byte read return OUT_X_L six times over.
- The data is left-justified: forgetting the >> 4 gives values 16 times too large.
- FS = 10 is not a valid range; use 00, 01 or 11.
- WHO_AM_I not 0x32: check wiring, or the address (0x19 if SDO is tied high).
- Zero-g offset is about ±70 mg typical; calibrate at rest if you need tilt-level accuracy.
- Do not feed power into 3Vo; power the board through VIN.

## Datasheet
https://www.st.com/resource/en/datasheet/lis331hh.pdf
