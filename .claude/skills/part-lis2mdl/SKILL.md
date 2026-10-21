---
name: part-lis2mdl
description: Pinout, electrical limits, wiring and MicroPython driver for the LIS2MDL 3-axis magnetometer (STMicroelectronics LIS2MDL, Adafruit #4488). Use when designing, wiring, simulating or writing code for an LIS2MDL in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# LIS2MDL 3-axis magnetometer (LIS2MDL)

## Overview
The **LIS2MDL** from STMicroelectronics measures the magnetic field on three axes with 16-bit output at a fixed sensitivity of **1.5 mgauss/LSB** (range ±49.152 gauss; 1 gauss = 100 µT; Earth's field is about 0.25–0.65 gauss). It talks I2C or SPI. Hobbyists buy it as the **Adafruit LIS2MDL Triple-axis Magnetometer (#4488)**, which adds a 3.3 V regulator, level shifting for 3–5 V logic, 10 kΩ I2C pull-ups and two STEMMA QT sockets.

## Pinout (Adafruit #4488, header order)
| Pin | Function |
|---|---|
| VIN | Supply, 3–5 V (on-board 3.3 V regulator) |
| 3Vo | 3.3 V regulator output (up to 100 mA), leave unconnected |
| GND | Ground |
| SCL | I2C clock / SPI clock |
| SDA | I2C data / SPI data (3-wire) |
| SDO | Chip pin INT/DRDY/SDO: interrupt or data-ready output, SPI data out in 4-wire mode (10 kΩ pull-down) |
| CS | SPI chip select, pulled high on the board = I2C; leave unconnected for I2C |

## Electrical limits
- Chip: 1.71–3.6 V; the breakout takes 3–5 V on VIN.
- Current: about 100 µA at 10 Hz high-resolution, 200 µA at 20 Hz, 1.5 µA powered down.
- Operating temperature −40 to 85 °C.

## Interface details
- **I2C address 0x1E**, fixed (clashes with LSM303/LIS3MDL at 0x1E).
- WHO_AM_I (0x4F) reads **0x40**.
- Power-on default is idle (CFG_REG_A 0x60 = 0x03). ST start-up: CFG_REG_A = **0x80** (temperature compensation, 10 Hz, high-resolution, continuous). COMP_TEMP_EN must be 1.
- Setup used by the driver: soft reset (CFG_REG_A = 0x20), CFG_REG_C (0x62) = 0x10 (block data update), CFG_REG_B (0x61) = 0x02 (offset cancellation), CFG_REG_A = 0x80, then wait 9.4 ms + 1/ODR.
- STATUS_REG (0x67) bit 3 Zyxda = new X/Y/Z data ready.
- Data: OUTX_L..OUTZ_H at 0x68–0x6D, 16-bit two's complement, low byte first. Set the top bit of the register address for auto-increment: read 6 bytes from **0x68 | 0x80 = 0xE8**.
- Field in gauss = raw × 0.0015.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from lis2mdl import LIS2MDL
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
mag = LIS2MDL(i2c)            # 0x1E, 10 Hz continuous
x, y, z = mag.read()          # gauss; mag.read_ut() gives microtesla
print('X=%.3f Y=%.3f Z=%.3f gauss' % (x, y, z))
```

## Gotchas
- Readings never change: the chip is still idle (MD bits = 11 at reset); write CFG_REG_A = 0x80.
- Forgetting the 0x80 auto-increment bit can make a 6-byte read return the same register over and over.
- The pin printed SDO is the interrupt/data-ready output in I2C mode; it is not an address select (the address is fixed).
- For a compass heading, keep the sensor level and away from motors, speakers, steel and current-carrying wires, and calibrate out hard-iron offsets (min/max per axis while rotating, or write them to OFFSET_X/Y/Z_REG 0x45–0x4A).

## Datasheet
https://cdn.sparkfun.com/assets/d/b/f/b/3/lis2mdl.pdf (ST DocID030621 Rev 5; also https://www.st.com/resource/en/datasheet/lis2mdl.pdf)
