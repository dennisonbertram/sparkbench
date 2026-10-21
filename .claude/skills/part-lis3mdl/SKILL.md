---
name: part-lis3mdl
description: Pinout, electrical limits, wiring and MicroPython driver for the LIS3MDL 3-axis magnetometer (STMicroelectronics LIS3MDL). Use when designing, wiring, simulating or writing code for an LIS3MDL in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# LIS3MDL 3-axis magnetometer (LIS3MDL)

## Overview
The **LIS3MDL** from STMicroelectronics measures the magnetic field on three axes with 16-bit resolution and a selectable full scale of ±4, ±8, ±12 or ±16 gauss (1 gauss = 100 µT; Earth's field is about 0.25–0.65 gauss). It talks I2C or SPI. Hobbyists buy it as the **Adafruit Triple-axis Magnetometer - LIS3MDL (#4479)**, which adds a 3.3 V regulator, level shifting for 3–5 V logic, 10 kΩ I2C pull-ups and two STEMMA QT sockets.

## Pinout (Adafruit #4479, header by header)
Top header (6 pins):
| Pin | Function |
|---|---|
| VIN | Supply, 3–5 V (on-board 3.3 V regulator) |
| 3Vo | 3.3 V regulator output (up to 100 mA), leave unconnected |
| GND | Ground |
| SCL | I2C clock / SPI clock |
| SDA | I2C data / SPI data in |
| INT | Interrupt output (optional) |

Bottom header (4 pins):
| Pin | Function |
|---|---|
| GND | Ground (second pin; GND2 in Sparkbench) |
| DRDY | Data-ready output (optional) |
| DO | SDO/SA1: I2C address select (AD1), SPI data out |
| CS | SPI chip select, leave unconnected for I2C |

## Electrical limits
- Chip: 1.9–3.6 V (absolute max 4.8 V on any pin); the breakout takes 3–5 V on VIN.
- Current: about 270 µA in ultra-high-performance mode at 20 Hz, 40 µA in low-power mode, 1 µA powered down.
- Operating temperature −40 to 85 °C.

## Interface details
- **I2C address 0x1C** (DO/AD1 low, the board default), 0x1E (DO high or back jumper bridged).
- WHO_AM_I (0x0F) reads **0x3D**.
- Power-on default is power-down: write CTRL_REG3 (0x22) = 0x00 for continuous conversion.
- Setup used by the driver: CTRL_REG1 = 0x70 (X/Y ultra-high-performance, 10 Hz), CTRL_REG2 = 0x00 (±4 gauss), CTRL_REG4 = 0x0C (Z ultra-high-performance, little-endian), CTRL_REG5 = 0x40 (block data update), CTRL_REG3 = 0x00.
- STATUS_REG (0x27) bit 3 ZYXDA = new X/Y/Z data ready.
- Data: OUT_X_L..OUT_Z_H at 0x28–0x2D, 16-bit two's complement, low byte first. In I2C set the top bit of the register address for auto-increment: read 6 bytes from **0x28 | 0x80 = 0xA8**.
- Field in gauss = raw / sensitivity: **6842** LSB/gauss at ±4, 3421 at ±8, 2281 at ±12, 1711 at ±16.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from lis3mdl import LIS3MDL
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
mag = LIS3MDL(i2c)            # 0x1C, ±4 gauss
x, y, z = mag.read()          # gauss; mag.read_ut() gives microtesla
print('X=%.3f Y=%.3f Z=%.3f gauss' % (x, y, z))
```

## Gotchas
- Readings stuck at 0: the chip is still in power-down (CTRL_REG3 = 0x03 at reset).
- Forgetting the 0x80 auto-increment bit makes a 6-byte read return the same register over and over.
- Adafruit notes a few boards pick the I2C address erratically with only the 10 kΩ pull-down on DO: tie DO firmly to GND (0x1C) or 3Vo (0x1E).
- For a compass heading, keep the sensor level and away from motors, speakers, steel and current-carrying wires, and calibrate out hard-iron offsets (min/max per axis while rotating).

## Datasheet
https://www.pololu.com/file/0J1089/LIS3MDL.pdf (ST DocID024204 Rev 4; also https://www.st.com/resource/en/datasheet/lis3mdl.pdf)
