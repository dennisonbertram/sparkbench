---
name: part-tmp117
description: Pinout, electrical limits, wiring and MicroPython driver for the TMP117 high-accuracy temperature sensor (Texas Instruments TMP117). Use when designing, wiring, simulating or writing code for a TMP117 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# TMP117 high-accuracy temperature sensor (TMP117)

## Overview
The **TMP117** from Texas Instruments is a digital thermometer good to ±0.1 °C (max, −20 to 50 °C) over −55 to 150 °C, with 16-bit, 7.8125 m°C resolution. It talks I2C. Hobbyists buy it as the **Adafruit TMP117 breakout (product 4821)**: a 6-pin header, two STEMMA QT connectors, 10 kΩ pull-ups on SDA/SCL/INT and no regulator (VIN goes straight to the chip).

## Pinout (Adafruit TMP117 #4821, header order)
| Pin | Function |
|---|---|
| VIN | Supply 1.7–5.5 V, straight to the chip (use 3.3 V) |
| GND | Ground |
| SCL | I2C clock (10 kΩ pull-up to VIN) |
| SDA | I2C data (10 kΩ pull-up to VIN) |
| INT | ALERT output, open-drain, 10 kΩ pull-up (optional) |
| ADDR | Address select (ADD0), 10 kΩ pull-down: GND 0x48, VIN 0x49, SDA 0x4A, SCL 0x4B |

## Electrical limits
- Supply: 1.7–5.5 V (1.8 V minimum above 70 °C). No regulator on the board, so VIN also sets the I2C pull-up voltage: power it from 3.3 V for an ESP32 / Pico.
- Current: 135 µA typical (220 µA max) while converting, about 16 µA average in the default 1 s / 8-average cycle, 0.15 µA shut down.
- I2C up to 400 kHz; SCL/SDA/ALERT/ADD0 tolerate up to 5.5 V.

## Interface details
- **I2C address 0x48** (ADDR at GND, the board default); 0x49 with the back jumper bridged.
- 16-bit registers, MSB first, pointer byte first: 0x00 temperature, 0x01 configuration (default 0x0220), 0x02 high limit (0x6000 = 192 °C), 0x03 low limit (0x8000 = −256 °C), 0x07 offset, 0x0F device ID (0x0117).
- Temperature: T = signed16(raw) × 0.0078125 °C. Reads 0x8000 (−256 °C) until the first conversion.
- Default mode: continuous, 8 averages (124 ms active), one new result per second. MOD[1:0] (config bits 11:10): 00 continuous, 01 shutdown, 11 one-shot. One conversion takes 15.5 ms × the number of averages.
- Data_Ready (config bit 13) is set when a result lands and cleared by reading the temperature or configuration register.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.
- Or use a STEMMA QT / Qwiic cable.

## Using the driver
```python
from machine import I2C, Pin
from tmp117 import TMP117
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
sensor = TMP117(i2c)              # checks device ID 0x117
print('T=%.2fC' % sensor.temperature())
```
`one_shot()` starts a single conversion and waits for Data_Ready; `set_mode(mode, averaging, conv)` changes MOD/AVG/CONV; `limits()` / `set_limits()` handle the alert window.

## Gotchas
- A reading of −256 °C means no conversion has finished yet (the driver waits for the first one).
- Reading the configuration register clears Data_Ready and the alert flags, so do not poll it in one place and expect them elsewhere.
- Keep it away from the regulator, the microcontroller and your fingers: at this accuracy, nearby heat shows up straight away.
- Writes to config/limits are volatile; the EEPROM keeps the factory values unless you unlock and program it.

## Datasheet
https://www.ti.com/lit/ds/symlink/tmp117.pdf
