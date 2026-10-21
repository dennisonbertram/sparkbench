---
name: part-amg8833
description: Pinout, electrical limits, wiring and MicroPython driver for the AMG8833 8x8 infrared thermal camera (Panasonic Grid-EYE, AMG8833). Use when designing, wiring, simulating or writing code for an AMG8833 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# AMG8833 8x8 thermal camera (AMG8833)

## Overview
The **AMG8833** (Panasonic Grid-EYE, high-gain 3.3 V version) is an 8×8 array of thermopile pixels: it reports 64 temperatures (0–80 °C objects, 0.25 °C steps, about ±2.5 °C) over a 60° field of view, plus its own thermistor temperature. It talks I2C. Hobbyists buy it on the **Adafruit AMG8833 IR Thermal Camera Breakout (#3538, STEMMA QT version)**, which has a 3.3 V regulator, level-shifted SDA/SCL with 10 kΩ pull-ups, and accepts 3–5 V on VIN.

## Pinout (Adafruit #3538 STEMMA QT version, bottom header, left to right)
| Pin | Function |
|---|---|
| VIN | Supply, 3–5 V (onboard 3.3 V regulator) |
| 3Vo | 3.3 V regulator output (up to 100 mA); not an input, leave unconnected |
| GND | Ground |
| SCL | I2C clock (10 kΩ pull-up, level shifted) |
| SDA | I2C data (10 kΩ pull-up, level shifted) |
| INT | Interrupt output (optional) |

The top row of 6 holes is for mechanical support only and is not connected. The older blue board prints SDA before SCL (VIN, 3Vo, GND, SDA, SCL, INT): check the labels on your board.

## Electrical limits
- Chip: 3.3 V ± 0.3 V (absolute max 6.5 V); the breakout's regulator takes 3–5 V on VIN.
- Current: about 4.5 mA in normal mode, 0.2 mA asleep.
- I2C fast mode (400 kHz).
- Output is stable about 15 s after power-up; I2C works after about 50 ms.

## Interface details
- **I2C address 0x69** on the Adafruit board (AD_SELECT high); 0x68 with the "Addr" jumper soldered.
- Init: PCTL (0x00) = 0x00 normal mode; RST (0x01) = 0x3F initial reset; INTC (0x03) = 0x00; FPSC (0x02) = 0x00 for 10 fps (0x01 = 1 fps).
- Pixels: 0x80–0xFF, two bytes per pixel, low byte first. 12-bit **two's complement**, 0.25 °C per LSB (0x064 = 25 °C, 0xFFF = −0.25 °C). Read all 128 bytes in one transfer so the frame is never mixed.
- Thermistor: 0x0E (low), 0x0F (high). 12 bits, **sign + magnitude** (bit 11 = sign), 0.0625 °C per LSB (0x190 = 25 °C, 0x804 = −0.25 °C).

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from amg8833 import AMG8833
i2c = I2C(0, sda=Pin(21), scl=Pin(22), freq=400000)
cam = AMG8833(i2c)
px = cam.pixels()
print('Max=%.2fC Board=%.2fC' % (max(px), cam.thermistor()))
```

## Gotchas
- It is not a camera with a picture: 64 pixels only. Interpolate in software for a smoother image.
- Pixels and thermistor use different formats (two's complement vs sign + magnitude) and different LSB sizes.
- The reading drifts for the first ~15 s after power-up.
- Glass and clear plastic block far-infrared; nothing may sit in front of the lens.

## Datasheet
https://cdn-learn.adafruit.com/assets/assets/000/043/261/original/Grid-EYE_SPECIFICATIONS%28Reference%29.pdf
