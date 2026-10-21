---
name: part-isl29125
description: Pinout, electrical limits, wiring and MicroPython driver for the ISL29125 RGB colour light sensor (Renesas/Intersil ISL29125, SparkFun SEN-12829 breakout). Use when designing, wiring, simulating or writing code for an ISL29125 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# ISL29125 RGB colour light sensor (ISL29125)

## Overview
The **ISL29125** from Renesas (formerly Intersil) measures red, green and blue light with a 16-bit ADC behind an IR-blocking filter. Two ranges: 375 lux or 10,000 lux full scale. It talks I2C at a fixed address. Hobbyists buy it on the **SparkFun RGB Light Sensor - ISL29125 (SEN-12829)**, which has 10 kΩ pull-ups on SDA, SCL and INT and no regulator.

## Pinout (SparkFun SEN-12829, header order)
| Pin | Function |
|---|---|
| GND | Ground |
| 3.3V | Supply, 2.25–3.63 V (3.3 V only, never 5 V) |
| SDA | I2C data (10 kΩ pull-up fitted) |
| SCL | I2C clock (10 kΩ pull-up fitted) |
| INT | Interrupt, active low, open-drain (printed !INT, optional) |

## Electrical limits
- Supply: 2.25–3.63 V. The chip is not 5 V tolerant; use a level shifter with a 5 V microcontroller.
- Current: 56 µA typical while converting, 0.5 µA powered down.
- I2C up to 400 kHz (500 kHz max).

## Interface details
- **I2C address 0x44** (fixed; only one per bus).
- Register 0x00 reads the device ID **0x7D**; writing **0x46** to it resets every register.
- CONFIG1 (0x01): B2:B0 mode (101 = green/red/blue continuous), B3 range (0 = 375 lux, 1 = 10,000 lux), B4 resolution (0 = 16-bit, ~101 ms per colour; 1 = 12-bit).
- CONFIG2 (0x02): IR compensation; datasheet recommends 0xBF. CONFIG3 (0x03): interrupt setup (0x00 = off).
- Data: green 0x09/0x0A, red 0x0B/0x0C, blue 0x0D/0x0E, each **low byte first**. Read 6 bytes from 0x09.
- Readings are raw counts (0–65535). Lux needs enclosure-specific coefficients (datasheet EQ. 2).

## Wiring
- ESP32: 3.3V → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: 3.3V → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: 3.3V → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from isl29125 import ISL29125
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
sensor = ISL29125(i2c)          # 10,000 lux range; ISL29125(i2c, bright=False) for 375 lux
r, g, b = sensor.rgb()
print('R=%d G=%d B=%d' % (r, g, b))
```

## Gotchas
- 5 V on the 3.3V pin or on SDA/SCL destroys the chip.
- A full colour cycle takes about 0.3 s in 16-bit mode; reading sooner returns the previous values (or zeros right after reset).
- Indoors, the 375 lux range (`bright=False`) gives far more resolution; in sunlight use the 10,000 lux range.
- Only one ISL29125 per I2C bus (address is hard-wired).

## Datasheet
https://www.renesas.com/us/en/document/dst/isl29125-datasheet
