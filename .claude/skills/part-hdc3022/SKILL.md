---
name: part-hdc3022
description: Pinout, electrical limits, wiring and MicroPython driver for the HDC3022 temperature & humidity sensor (Texas Instruments HDC302x, Adafruit 5989 STEMMA QT breakout). Use when designing, wiring, simulating or writing code for an HDC3022 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# HDC3022 temperature & humidity sensor (HDC3022)

## Overview
The **HDC3022** from Texas Instruments measures temperature (−40 to 125 °C, ±0.1 °C typical) and relative humidity (0–100 %, ±0.5 % typical) and talks I2C with a CRC byte after every data word. The HDC3022 version carries a PTFE filter cover that keeps dust and water off the sensor. Hobbyists buy it on the **Adafruit HDC3022 Precision Temperature & Humidity Sensor (product 5989)**: no regulator, 10 kΩ pull-ups on SDA/SCL, two STEMMA QT connectors and a 6-pin header.

## Pinout (Adafruit 5989, header order)
| Pin | Function |
|---|---|
| VIN | Supply, 1.8–5.5 V (no regulator: use your logic voltage) |
| GND | Ground |
| SCL | I2C clock (10 kΩ pull-up) |
| SDA | I2C data (10 kΩ pull-up) |
| RST | Reset, active low, internal pull-up (optional) |
| ALERT | Push-pull alert output (optional) |

## Electrical limits
- Supply: 1.62–5.5 V (chip); Adafruit specifies 1.8–5 V. 6.0 V absolute maximum.
- Current: about 110 µA while measuring, 0.5 µA asleep (plus the board's power LED).
- I2C up to 1 MHz. Inputs must stay below VDD + 0.3 V, so power it from the same rail as your logic.

## Interface details
- **I2C address 0x44**; A0 jumper → 0x45, A1 → 0x46, both → 0x47.
- Trigger on demand, low power mode 0: write **0x24 0x00**, wait ≥ 12.5 ms, read 6 bytes: T MSB, T LSB, CRC, RH MSB, RH LSB, CRC. Reading before the conversion ends is NACKed.
- Faster/lower-noise options: 0x240B (7.5 ms), 0x2416 (5 ms), 0x24FF (3.7 ms).
- CRC-8/NRSC-5: polynomial 0x31, initial value 0xFF (datasheet example: 0xABCD → 0x6F).
- Temperature: T = −45 + 175 × raw / 65535 °C. Humidity: RH = 100 × raw / 65535 %.
- Manufacturer ID: command 0x37 0x81 returns 0x3000 + CRC. Soft reset: 0x30 0xA2 (ready within 3 ms).

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.
- Or use a STEMMA QT / Qwiic cable.

## Using the driver
```python
from machine import I2C, Pin
from hdc3022 import HDC3022
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
t, h = HDC3022(i2c).read()
print('T=%.1fC H=%.0f%%' % (t, h))
```

## Gotchas
- A CRC mismatch nearly always means a loose SDA/SCL wire.
- Do not remove the white PTFE filter; peel off any protective sticker before use.
- Keep it away from the regulator and the microcontroller, which warm the air nearby.
- The heater (command 0x306E) warms the die by tens of degrees; leave it off for normal readings.

## Datasheet
https://www.ti.com/lit/ds/symlink/hdc3022.pdf
