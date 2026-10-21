---
name: part-sht45
description: Pinout, electrical limits, wiring and MicroPython driver for the SHT45 precision temperature & humidity sensor (Sensirion SHT4x family). Use when designing, wiring, simulating or writing code for an SHT45 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# SHT45 precision temperature & humidity sensor (SHT45)

## Overview
The **SHT45** is the best-accuracy member of Sensirion's SHT4x family: temperature −40 to 125 °C (±0.1 °C typical) and relative humidity 0–100 % (±1.0 % typical). It talks I2C at the fixed address 0x44 and uses exactly the same commands and formulas as the SHT40/SHT41. Hobbyists buy it on the **Adafruit Sensirion SHT45 Precision Temperature & Humidity Sensor - STEMMA QT / Qwiic (#5665)**, which adds a 3.3 V regulator, I2C level shifting and 10 kΩ pull-ups, so it runs from 3.3–5 V.

## Pinout (Adafruit SHT45 #5665, header order)
| Pin | Function |
|---|---|
| VIN | Supply, 3.3–5 V (same voltage as your board's logic) |
| 3Vo | 3.3 V output from the on-board regulator (up to 100 mA); leave unconnected |
| GND | Ground |
| SCL | I2C clock (10 kΩ pull-up and level shifter on board) |
| SDA | I2C data (10 kΩ pull-up and level shifter on board) |

The two STEMMA QT / Qwiic sockets carry the same GND, VIN, SDA, SCL.

## Electrical limits
- Board supply: 3.3–5 V on VIN. The bare chip is 1.08–3.6 V; never feed 5 V to a bare SHT45.
- Current: about 0.32 mA while measuring (0.5 mA max), 0.08 µA idle. The built-in heater draws up to 100 mA.
- I2C up to 1 MHz (Fast-mode Plus).

## Interface details
- **I2C address 0x44**, fixed (SHT45-AD1B).
- Single-shot, high precision: write the single byte **0xFD**, wait ≥ 8.3 ms (10 ms is safe), read 6 bytes: T MSB, T LSB, CRC, RH MSB, RH LSB, CRC. Reading too early gets a NACK.
- Other commands: 0xF6 medium / 0xE0 low precision, 0x89 serial number, 0x94 soft reset.
- CRC-8: polynomial 0x31, initial value 0xFF (datasheet example: 0xBEEF → 0x92).
- Temperature: T = −45 + 175 × raw / 65535 °C.
- Humidity: RH = **−6 + 125** × raw / 65535 % (different from the SHT3x!), then crop to 0–100 %.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from sht45 import SHT45
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
t, h = SHT45(i2c).read()
print('T=%.1fC H=%.0f%%' % (t, h))
```

## Gotchas
- An SHT3x driver will not work: the SHT45 takes a one-byte command (0xFD) and uses a different humidity formula.
- A CRC mismatch nearly always means a loose SDA/SCL wire.
- Only one SHT45 per bus (address fixed at 0x44); use an I2C mux (TCA9548A) for more.
- Its ±0.1 °C accuracy is wasted if it sits next to the regulator or the microcontroller, which warm the air nearby; mount it on a cable away from them.
- 3Vo is an output; do not feed power into it.

## Datasheet
https://sensirion.com/resource/datasheet/sht4x
