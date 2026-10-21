---
name: part-lis2hh12
description: Pinout, electrical limits, wiring and MicroPython driver for the LIS2HH12 3-axis accelerometer (STMicroelectronics LIS2HH12, STEVAL-MKI164V1 DIL24 adapter). Use when designing, wiring, simulating or writing code for an LIS2HH12 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# LIS2HH12 3-axis accelerometer (LIS2HH12)

## Overview
The **LIS2HH12** from STMicroelectronics measures acceleration on X, Y and Z with a selectable ±2/±4/±8 g range and 16-bit output (0.061 mg/digit at ±2 g), 10–800 Hz output rate, a FIFO, two interrupt outputs and I2C/SPI. Hobbyists buy it on ST's **STEVAL-MKI164V1** adapter: the chip plus decoupling capacitors on a 24-pin DIL module. There is **no regulator and no pull-ups**, and CS and SA0 are left for you to tie: run it from 3.3 V only.

## Pinout (STEVAL-MKI164V1, DIL24: JP1 pins 1–12, JP2 pins 13–24)
| Pin | Name | Function |
|---|---|---|
| 1 | VDD | Supply, 3.3 V (1.71–3.6 V) |
| 2 | VDD_IO | I/O supply, same 3.3 V |
| 3–12 | NC | Not connected |
| 13 | GND | Ground |
| 14 | INT1 | Interrupt 1 output (optional) |
| 15 | INT2 | Interrupt 2 output (optional) |
| 16–18 | NC | Not connected |
| 19 | CS | Tie to 3.3 V for I2C (low = SPI) |
| 20 | SCL/SPC | I2C clock, needs a pull-up |
| 21 | SDA/SDI/SDO | I2C data, needs a pull-up |
| 22 | SDO | SA0 address bit: 3.3 V = 0x1D, GND = 0x1E |
| 23–24 | NC | Not connected |

## Electrical limits
- Vdd 1.71–3.6 V, Vdd_IO 1.71 V to Vdd + 0.1 V. Never 5 V on any pin.
- Current: about 180 µA at 100–800 Hz, 5 µA in power-down.
- I2C up to 400 kHz. SDA and SCL must be pulled up to Vdd_IO (4.7 kΩ).

## Interface details
- **I2C address 0x1D** with SDO/SA0 high, **0x1E** with SA0 low. WHO_AM_I (0x0F) = **0x41**.
- Boot time 20 ms. Powers up in power-down (CTRL1 0x20 = 0x07).
- CTRL1 = **0xBF**: HR = 1, ODR 100 Hz (011), BDU = 1, X/Y/Z on.
- CTRL4 (0x23) = **0x04**: FS = ±2 g (00; 10 = ±4 g, 11 = ±8 g), IF_ADD_INC = 1 (auto-increment, the default).
- STATUS (0x27) bit 3 ZYXDA = new X/Y/Z data. Discard the first sample after power-down.
- Read 6 bytes from **0x28**: X_L, X_H, Y_L, Y_H, Z_L, Z_H. Each axis is 16-bit two's complement, low byte first (not left-justified, no shift): × 0.061 / 0.122 / 0.244 mg at ±2 / 4 / 8 g.
- Auto-increment comes from IF_ADD_INC, not the 0x80 bit of the sub-address (only the 7 low bits are the register address).

## Wiring
- ESP32: VDD + VDD_IO + CS + SDO → 3V3, GND → GND, SDA/SDI/SDO → D21, SCL/SPC → D22, 4.7 kΩ from SDA and SCL to 3V3.
- Pico: VDD + VDD_IO + CS + SDO → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5, 4.7 kΩ pull-ups to 3V3.
- Raspberry Pi 4: 3.3 V pin 1 to VDD/VDD_IO/CS/SDO, GND pin 6, SDA pin 3, SCL pin 5 (the Pi has 1.8 kΩ pull-ups already).

## Using the driver
```python
from machine import I2C, Pin
from lis2hh12 import LIS2HH12
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
x, y, z = LIS2HH12(i2c).read()   # g; LIS2HH12(i2c, addr=0x1E) with SA0 on GND
print('X=%.3f Y=%.3f Z=%.3f g' % (x, y, z))
```

## Gotchas
- `OSError: ENODEV`: CS floating or low (I2C disabled), SA0 floating, or no SDA/SCL pull-ups — the adapter has none of these.
- All zeros: CTRL1 still in power-down (ODR = 000).
- This chip's data is full 16-bit: do not copy the >> 4 from LIS2DH12/LIS3DH code. WHO_AM_I is 0x41, not 0x33.
- FS = 01 is "not available": only ±2, ±4 and ±8 g exist.
- Pin 5 (RES) of the bare chip is grounded on the adapter; on your own PCB connect it to GND.

## Datasheet
https://www.st.com/resource/en/datasheet/lis2hh12.pdf
