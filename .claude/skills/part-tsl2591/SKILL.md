---
name: part-tsl2591
description: Pinout, electrical limits, wiring and MicroPython driver for the TSL2591 high dynamic range light sensor (ams TSL25911FN). Use when designing, wiring, simulating or writing code for a TSL2591 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# TSL2591 high dynamic range light sensor (TSL2591)

## Overview
The **ams TSL2591** has a full-spectrum (visible + IR) photodiode (CH0) and an infrared photodiode (CH1), each with a 16-bit integrating ADC. Gain 1x/25x/428x/9876x and integration 100-600 ms give a 600M:1 dynamic range. It talks I2C at the fixed address **0x29**. Hobbyists buy it on the **Adafruit TSL2591 breakout (#1980)**, which has a 3.3 V regulator and I2C level shifters, so it runs from 3-5 V.

## Pinout (Adafruit #1980, header order)
| Pin | Function |
|---|---|
| VIN | Board supply, 3-5 V (AP2112K 3.3 V regulator on board) |
| 3Vo | 3.3 V regulator OUTPUT, leave unconnected |
| GND | Ground |
| SCL | I2C clock (level shifted, 10k pull-up to VIN) |
| SDA | I2C data (level shifted, 10k pull-up to VIN) |
| INT | Interrupt, open-drain active low, no pull-up on board, 3.3 V max (optional) |

## Electrical limits
- Chip: 2.7-3.6 V (absolute max 3.8 V); the board's VIN takes 3-5 V.
- Current: about 0.3-0.4 mA measuring, a few µA asleep.
- I2C up to 400 kHz.

## Interface details
- Command byte = **0xA0 | register** (CMD bit + normal transaction). Special function 0xE7 clears interrupts.
- ENABLE 0x00: write 0x03 (PON + AEN) to measure, 0x00 to sleep.
- CONFIG 0x01: bits 5:4 gain (00 1x, 01 25x, 10 428x, 11 9876x), bits 2:0 time (000 = 100 ms … 101 = 600 ms).
- ID 0x12 = 0x50. STATUS 0x13 bit 0 AVALID = a cycle has completed since AEN was set.
- Data: read 4 bytes from 0x14 in one go: CH0 low, CH0 high, CH1 low, CH1 high.
- Full scale: 37888 counts at 100 ms, 65535 at 200-600 ms.
- Lux: the datasheet gives none. The driver uses Adafruit's uncalibrated approximation: cpl = time_ms × gain / 408; lux = max((CH0 − 1.64·CH1)/cpl, (0.59·CH0 − 0.86·CH1)/cpl).

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from tsl2591 import TSL2591, GAIN_LOW
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
s = TSL2591(i2c)                 # 25x gain, 100 ms
ch0, ch1 = s.raw()
print(ch0, ch1, s.lux(ch0, ch1))
s.configure(GAIN_LOW, 100)       # for direct sunlight
```

## Gotchas
- Address 0x29 is fixed: one TSL2591 per bus, and it clashes with a VL53L0X/VL53L1X at its default address.
- Saturated readings (max count) give nonsense lux; `lux()` returns None then. Lower the gain.
- Power VIN from 3.3 V with an ESP32/Pico so the shifted SDA/SCL pull up to 3.3 V.
- INT is not level shifted: never pull it to 5 V.

## Datasheet
https://cdn-shop.adafruit.com/datasheets/TSL25911_Datasheet_EN_v1.pdf
