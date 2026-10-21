---
name: part-msa311
description: Pinout, electrical limits, wiring and MicroPython driver for the MSA311 3-axis accelerometer (MEMSensing MSA311, Adafruit #5309 STEMMA QT breakout). Use when designing, wiring, simulating or writing code for an MSA311 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MSA311 3-axis accelerometer (MSA311)

## Overview
The **MSA311** from MEMSensing Microsystems is a tiny, low-cost 3-axis accelerometer: ±2/±4/±8/±16 g selectable, 12-bit output, 1 Hz to 1 kHz data rate, with tap, double-tap, orientation, activity and free-fall interrupts. It talks I2C at a **fixed address 0x62**. Hobbyists buy it on the **Adafruit MSA311 Triple Axis Accelerometer - STEMMA QT / Qwiic (#5309)**, which adds a 3.3 V regulator, I2C level shifting and pull-ups so it runs from 3–5 V.

## Pinout (Adafruit #5309, header order)
| Pin | Function |
|---|---|
| VIN | Supply, 3–5 V (same as your board's logic level) |
| 3Vo | 3.3 V regulator output (up to 100 mA), leave unconnected |
| GND | Ground |
| SCL | I2C clock (pull-up + level shifter on board) |
| SDA | I2C data (pull-up + level shifter on board) |
| INT | Interrupt output INT1, 3.3 V push-pull, active low by default (optional) |

## Electrical limits
- Chip supply 1.62–3.6 V; the breakout takes 3–5 V on VIN.
- Current: about 130 µA in normal mode (chip only), 2 µA low-power, 1 µA suspend.
- I2C up to 400 kHz. Start-up 3 ms from power off, wake-up 1 ms from suspend.

## Interface details
- **I2C address 0x62** (fixed; the older MSA301 was 0x26). PARTID register 0x01 = **0x13**.
- Powers up in **suspend mode** (0x11 = 0xDE): clear PWR_MODE bits 7:6 for normal mode.
- 0x10 ODR: bits 7:5 disable X/Y/Z (0 = on), ODR[3:0] (0x07 = 125 Hz). 0x0F range: FS[1:0] 00/01/10/11 = ±2/4/8/16 g.
- Data 0x02–0x07: X LSB, X MSB, Y LSB, Y MSB, Z LSB, Z MSB. LSB register holds ACC[3:0] in bits 7:4, MSB register ACC[11:4]: combine low byte first as signed 16-bit, shift right by 4.
- Sensitivity: 1024 / 512 / 256 / 128 LSB/g at ±2 / 4 / 8 / 16 g.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.
- Or use a STEMMA QT / Qwiic cable on either JST-SH connector.

## Using the driver
```python
from machine import I2C, Pin
from msa311 import MSA311
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
x, y, z = MSA311(i2c).read()
print('X=%.3f Y=%.3f Z=%.3f g' % (x, y, z))
```

## Gotchas
- Reads all zeros? The chip is still in suspend mode: write 0x11 first (the driver does).
- Fixed address 0x62: only one MSA311 per I2C bus without a multiplexer.
- Register 0x12 (axis polarity / X-Y swap) defaults to 0x06; leave it alone unless you need to remap axes.
- Adafruit's page says "14-bit"; the MSA311 datasheet specifies 12-bit output (1024 LSB/g at ±2 g), which is what the driver uses.

## Datasheet
https://cdn-shop.adafruit.com/product-files/5309/MSA311-V1.1-ENG.pdf
