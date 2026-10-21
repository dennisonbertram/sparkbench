---
name: part-lis3dh
description: Pinout, electrical limits, wiring and MicroPython driver for the LIS3DH 3-axis accelerometer (STMicroelectronics LIS3DH). Use when designing, wiring, simulating or writing code for an LIS3DH in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# LIS3DH 3-axis accelerometer (LIS3DH)

## Overview
The **LIS3DH** from STMicroelectronics measures acceleration on X, Y and Z with a selectable ±2/±4/±8/±16 g range and up to 12-bit resolution (1 mg/digit at ±2 g in high-resolution mode). It talks I2C or SPI and has two interrupt generators (motion, tap, free-fall, data ready) plus three auxiliary ADC inputs. Hobbyists buy it on the **Adafruit LIS3DH breakout (#2809, STEMMA QT version)**, which adds a 3.3 V regulator, level shifting and 10 kΩ pull-ups so it runs from 3–5 V.

## Pinout (Adafruit #2809, main header, left to right)
| Pin | Function |
|---|---|
| VIN | Supply, 3–5 V (regulated to 3.3 V on the board) |
| 3Vo | 3.3 V regulator output (up to 100 mA): leave unconnected |
| GND | Ground |
| SCL | I2C clock (10 kΩ pull-up) |
| SDA | I2C data (10 kΩ pull-up) |
| INT | Interrupt 1 output, 3.3 V (optional) |

The board's second 6-pin row (I2, A3, A2, A1, SDO, CS) is not needed for I2C: leave it open. SDO open = address 0x18, SDO to 3.3 V = 0x19. CS is pulled high (I2C); pulling it low selects SPI. Two STEMMA QT / Qwiic sockets carry the same I2C bus.

## Electrical limits
- Chip supply 1.71–3.6 V (absolute max 4.8 V); the breakout's VIN accepts 3–5 V.
- Current: about 11 µA at 50 Hz in high-resolution mode, plus the board's regulator and power LED.
- I2C up to 400 kHz.

## Interface details
- **I2C address 0x18** (SDO low/open), 0x19 (SDO high). WHO_AM_I (0x0F) = **0x33**.
- Powers up in power-down mode: write CTRL_REG1 (0x20) = **0x57** (100 Hz, X/Y/Z on, LPen = 0).
- CTRL_REG4 (0x23) = **0x88**: BDU = 1, FS = ±2 g, HR = 1 (12-bit). Wait 7/ODR (70 ms at 100 Hz) after enabling.
- STATUS_REG (0x27) bit 3 ZYXDA = new X/Y/Z data available.
- Read 6 bytes from **0xA8** (OUT_X_L 0x28 with the auto-increment bit 0x80): X_L, X_H, Y_L, Y_H, Z_L, Z_H.
- Each axis is 16-bit two's complement, low byte first, **left-justified**: value = int16 >> 4, then × 1 mg (±2 g), 2 mg (±4 g), 4 mg (±8 g) or 12 mg (±16 g) in high-resolution mode.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from lis3dh import LIS3DH
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
x, y, z = LIS3DH(i2c).read()   # g
print('X=%.3f Y=%.3f Z=%.3f g' % (x, y, z))
```

## Gotchas
- All zeros means the chip is still in power-down: CTRL_REG1 was never written.
- Forgetting the 0x80 auto-increment bit makes a 6-byte read return OUT_X_L six times over.
- The data is left-justified: forgetting the >> 4 gives values 16 times too large.
- WHO_AM_I not 0x33: check wiring, or the address (0x19 if SDO is tied high).
- Do not feed power into 3Vo; power the board through VIN.

## Datasheet
https://www.st.com/resource/en/datasheet/lis3dh.pdf
