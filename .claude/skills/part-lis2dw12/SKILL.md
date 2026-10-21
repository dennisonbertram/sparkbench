---
name: part-lis2dw12
description: Pinout, electrical limits, wiring and MicroPython driver for the LIS2DW12 ultra-low-power 3-axis accelerometer (STMicroelectronics LIS2DW12, DFRobot Fermion SEN0405 breakout). Use when designing, wiring, simulating or writing code for an LIS2DW12 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# LIS2DW12 low-power 3-axis accelerometer (LIS2DW12)

## Overview
The **LIS2DW12** from STMicroelectronics is an ultra-low-power accelerometer that measures X, Y and Z. You can pick a ±2/±4/±8/±16 g range. It has a 14-bit High-Performance mode (0.244 mg/digit at ±2 g, about 90 µA) and four low-power modes that draw down to about 1 µA. It talks I2C or SPI and has a 32-level FIFO. Two interrupt pins can signal tap, double-tap, free-fall, wake-up and 6D orientation. Hobbyists buy it as the **DFRobot Fermion: LIS2DW12 Triple Axis Accelerometer Sensor (Breakout) (±16g), SEN0405**. That board carries the chip, an ME6206A33 3.3 V regulator (so VCC takes 3.3–5 V) and 10 kΩ pull-ups to its own 3.3 V on SCL, SDA, SDO and CS.

## Pinout (DFRobot SEN0405, two 4-pin headers on opposite edges, square pad = pin 1)
| Header | Pin | Function |
|---|---|---|
| P1 | VCC | Supply 3.3–5 V (on-board 3.3 V regulator) |
| P1 | GND | Ground |
| P1 | SCL | I2C clock / SPI SCK (10 kΩ pull-up to 3.3 V) |
| P1 | SDA | I2C data / SPI MOSI (10 kΩ pull-up to 3.3 V) |
| P2 | SDO | Address select: open = 0x19, to GND = 0x18 / SPI MISO |
| P2 | CS | SPI chip select; open (pulled up) = I2C mode |
| P2 | INT1 | Interrupt 1 output (optional, push-pull 3.3 V) |
| P2 | INT2 | Interrupt 2 output (optional, push-pull 3.3 V) |

The two headers sit on opposite edges, so the board is wired with jumper leads, not plugged straight across a breadboard. For I2C only P1 is needed.

## Electrical limits
- Board VCC 3.3–5 V (ME6206A33 regulator). The chip itself runs at 1.62–3.6 V (absolute max 4.8 V).
- Signals are 3.3 V. The I2C pull-ups go to the regulated 3.3 V, so the bus is safe for ESP32, Pico and Pi.
- Current: about 90 µA in High-Performance mode, 1–90 µA in low-power modes and 50 nA in power-down, plus the regulator's quiescent current.
- I2C up to 400 kHz.

## Interface details
- **I2C address 0x19** (SDO pulled high on the board), 0x18 with SDO tied to GND. WHO_AM_I (0x0F) = **0x44**.
- Powers up in power-down (CTRL1 0x20 = 0x00). Write CTRL1 = **0x54** for 100 Hz in High-Performance (14-bit) mode.
- CTRL2 (0x21) = **0x0C**: BDU = 1, IF_ADD_INC = 1 (the default). Bit 5 must stay 0. SOFT_RESET is bit 6 and clears itself.
- CTRL6 (0x25): FS[5:4] sets ±2/4/8/16 g, and LOW_NOISE is bit 2. **0x04** = ±2 g with low noise.
- STATUS (0x27) bit 0 DRDY = new X/Y/Z data available.
- Read 6 bytes from **0x28**: X_L, X_H, Y_L, Y_H, Z_L, Z_H. Unlike the LIS2DH12/LIS3DH, auto-increment comes from IF_ADD_INC in CTRL2, not from bit 7 of the register address.
- Each axis is 16-bit two's complement, low byte first, **left-justified**. Take int16 >> 2 and multiply by 0.244 mg (±2 g), 0.488 (±4 g), 0.976 (±8 g) or 1.952 mg (±16 g). In Low-Power Mode 1 the data is 12-bit: use >> 4 with 0.976/1.952/3.904/7.808 mg.
- OUT_T (0x26) gives the die temperature as 8-bit two's complement, 1 °C/LSB, with 0 = 25 °C.
- At 100 Hz in High-Performance mode, throw away the first sample after setting the ODR (datasheet Table 13).

## Wiring
- ESP32: VCC → 3V3 (or 5V), GND → GND, SDA → D21, SCL → D22.
- Pico: VCC → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.
- Leave SDO and CS unconnected for I2C at 0x19.

## Using the driver
```python
from machine import I2C, Pin
from lis2dw12 import LIS2DW12
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
x, y, z = LIS2DW12(i2c).read()   # g; LIS2DW12(i2c, addr=0x18) if SDO is tied to GND
print('X=%.3f Y=%.3f Z=%.3f g' % (x, y, z))
```

## Gotchas
- All zeros: the chip is still in power-down because CTRL1 was never written.
- Code ported from the LIS2DH12/LIS3DH that reads from 0xA8 is wrong here. Read from 0x28 and keep IF_ADD_INC set.
- The data is left-justified. Forgetting the >> 2 gives values 4 times too large. The LIS2DH12's >> 4 is wrong in 14-bit mode.
- `OSError: ENODEV` or WHO_AM_I not 0x44: check wiring and the address (0x19 default on DFRobot; many other boards use 0x18).
- Pulling CS low switches the chip to SPI and I2C stops answering.
- The micro:bit's own accelerometer sits at 0x19 on some versions. Tie SDO to GND to use 0x18 there.

## Datasheet
https://www.st.com/resource/en/datasheet/lis2dw12.pdf
