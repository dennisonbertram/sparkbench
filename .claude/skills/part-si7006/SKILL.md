---
name: part-si7006
description: Pinout, electrical limits, wiring and MicroPython driver for the Si7006 temperature & humidity sensor (Silicon Labs Si7006-A20, Sensor Maestros smSENSR-Si7006 breakout). Use when designing, wiring, simulating or writing code for an Si7006 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Si7006 temperature & humidity sensor (SI7006-A20)

## Overview
The **Si7006-A20** from Silicon Labs measures relative humidity (0–100 %, ±5 % max from 0–80 %) and temperature (−40 to 125 °C, ±1 °C max from −10 to 85 °C). It talks I2C at a fixed address and uses the same commands and formulas as the Si7021. Modelled here on the **Sensor Maestros smSENSR-Si7006** breakout: a tiny board with two 3-pin 0.1" rows 0.3" apart (it sits across the breadboard gap like a DIP-6), 10 kΩ pull-ups on SDA/SCL and **no regulator**.

## Pinout (smSENSR-Si7006, DIP-style numbering)
| Pin | Name | Function |
|---|---|---|
| 1 | VDD | Supply, 1.95–3.6 V |
| 2 | GND | Ground |
| 3 | N/C | No connect |
| 4 | N/C | No connect |
| 5 | SCL | I2C clock (10 kΩ pull-up to VDD) |
| 6 | SDA | I2C data (10 kΩ pull-up to VDD) |

## Electrical limits
- Supply 1.9–3.6 V (board rated 1.95–3.6 V). There is no regulator or level shifter: never connect 5 V or 5 V I2C lines.
- Current: 150 µA during an RH conversion, 90 µA during temperature, 0.06 µA standby (3.5 mA peaks at power-up).
- I2C up to 400 kHz.

## Interface details
- **I2C address 0x40**, fixed.
- Power-up: up to 25 ms at 25 °C (80 ms over full temperature). Reset: write **0xFE**, wait 15 ms.
- No-hold measurement: write **0xF5** (humidity) or **0xF3** (temperature), then read 3 bytes: MSB, LSB, CRC. The chip NACKs its address until the conversion finishes. Hold-master variants are 0xE5 / 0xE3 (clock stretching).
- Conversion times (max): 12-bit RH 12 ms, 14-bit T 10.8 ms; an RH measurement also measures temperature (up to 22.8 ms total).
- **0xE0** reads the temperature from the previous RH measurement: 2 bytes, no checksum.
- CRC-8 over the two data bytes: polynomial x⁸+x⁵+x⁴+1 (0x31), initial value **0x00**.
- Temperature: T = 175.72 × Temp_Code / 65536 − 46.85 °C. Humidity: RH = 125 × RH_Code / 65536 − 6 %. Codes are the 16-bit word as returned (temperature LSB ends in 00, humidity in 10).

## Wiring
- ESP32: VDD → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VDD → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VDD → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from si7006 import SI7006
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
t, h = SI7006(i2c).read()
print('T=%.1fC H=%.1f%%' % (t, h))
```

## Gotchas
- 0x40 is also the default address of the Si7021, HTU21D, SHT21 and INA219: only one per bus without a multiplexer.
- A CRC mismatch nearly always means a loose SDA/SCL wire.
- RH can read slightly below 0 % or above 100 %; the datasheet says to clamp to 0–100 %, which the driver does.
- The Si7006 is marked "not recommended for new designs"; the Si7021 is the drop-in, more accurate successor.

## Datasheet
https://www.silabs.com/documents/public/data-sheets/Si7006-A20.pdf
