---
name: part-lis2dh12
description: Pinout, electrical limits, wiring and MicroPython driver for the LIS2DH12 3-axis accelerometer (STMicroelectronics LIS2DH12). Use when designing, wiring, simulating or writing code for an LIS2DH12 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# LIS2DH12 3-axis accelerometer (LIS2DH12)

## Overview
The **LIS2DH12** from STMicroelectronics is an ultra-low-power accelerometer measuring X, Y and Z with a selectable ±2/±4/±8/±16 g range and up to 12-bit resolution (1 mg/digit at ±2 g in high-resolution mode). It talks I2C or SPI and has a 32-level FIFO and two interrupt outputs (data ready, motion, click, free-fall). Hobbyists buy it on the **SparkFun Triple Axis Accelerometer Breakout - LIS2DH12 (Qwiic), SPX-15760**: chip, decoupling, 2.2 kΩ I2C pull-ups, a power LED and two Qwiic sockets. There is **no regulator**: it runs from 3.3 V only.

## Pinout (SparkFun SPX-15760, edge header, left to right)
| Pin | Function |
|---|---|
| GND | Ground |
| 3V3 | Supply, 3.3 V (chip range 1.71–3.6 V, no regulator) |
| SDA | I2C data (2.2 kΩ pull-up) |
| SCL | I2C clock (2.2 kΩ pull-up) |
| INT2 | Interrupt 2 output (optional, 100 kΩ pull-up) |
| INT1 | Interrupt 1 output (optional, 100 kΩ pull-up) |

The two Qwiic sockets carry GND, 3V3, SDA and SCL. The ADR jumper sets the address: open (default) = **0x19**, closed = 0x18.

## Electrical limits
- Supply 1.71–3.6 V (absolute max 4.8 V). Never connect the 3V3 pin or the I/O lines to 5 V.
- Current: about 10 µA at 50 Hz in high-resolution mode (chip), plus about 1 mA for the board's power LED.
- I2C up to 400 kHz.

## Interface details
- **I2C address 0x19** on the SparkFun board (SDO/SA0 pulled high), 0x18 with SA0 low. WHO_AM_I (0x0F) = **0x33**.
- Powers up in power-down mode (CTRL_REG1 = 0x07): write CTRL_REG1 (0x20) = **0x57** (100 Hz, X/Y/Z on, LPen = 0).
- CTRL_REG4 (0x23) = **0x88**: BDU = 1, BLE = 0, FS = ±2 g, HR = 1 (12-bit). LPen and HR must never both be 1. Wait 7/ODR (70 ms at 100 Hz) after enabling HR.
- STATUS_REG (0x27) bit 3 ZYXDA = new X/Y/Z data available.
- Read 6 bytes from **0xA8** (OUT_X_L 0x28 with the auto-increment bit 0x80): X_L, X_H, Y_L, Y_H, Z_L, Z_H.
- Each axis is 16-bit two's complement, low byte first, **left-justified**: value = int16 >> 4, then × 1 mg (±2 g), 2 mg (±4 g), 4 mg (±8 g) or 12 mg (±16 g) in high-resolution mode.

## Wiring
- ESP32: 3V3 → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: 3V3 → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: 3V3 → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.
- Or use a Qwiic cable (JST SH 4-pin) to a Qwiic/STEMMA QT socket.

## Using the driver
```python
from machine import I2C, Pin
from lis2dh12 import LIS2DH12
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
x, y, z = LIS2DH12(i2c).read()   # g; LIS2DH12(i2c, addr=0x18) if ADR is closed
print('X=%.3f Y=%.3f Z=%.3f g' % (x, y, z))
```

## Gotchas
- All zeros means the chip is still in power-down: CTRL_REG1 was never written.
- Forgetting the 0x80 auto-increment bit makes a 6-byte read return OUT_X_L six times over.
- The data is left-justified: forgetting the >> 4 gives values 16 times too large.
- `OSError: ENODEV` or WHO_AM_I not 0x33: check wiring, and the address (0x19 default on SparkFun, many other LIS2DH12 boards use 0x18).
- Several Qwiic boards on one bus each add 2.2 kΩ pull-ups; cut the I2C jumper on extras if the bus gets unreliable.

## Datasheet
https://www.st.com/resource/en/datasheet/lis2dh12.pdf
