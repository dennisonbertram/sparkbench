---
name: part-adt7410
description: Pinout, electrical limits, wiring and MicroPython driver for the ADT7410 16-bit precision temperature sensor (Analog Devices ADT7410). Use when designing, wiring, simulating or writing code for an ADT7410 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# ADT7410 precision temperature sensor (ADT7410)

## Overview
The **ADT7410** from Analog Devices measures temperature from −55 to 150 °C (±0.5 °C from −40 to 105 °C at 2.7–3.6 V) with a 13-bit (0.0625 °C) or 16-bit (0.0078 °C) result. It talks I2C. Hobbyists buy it on the **Adafruit ADT7410 breakout (#4089, STEMMA QT version)**: no regulator (VIN feeds the chip), 10 kΩ pull-ups to VIN on SDA, SCL, INT and CT, and A0/A1 address jumpers on the back.

## Pinout (Adafruit #4089, header order)
| Pin | Function |
|---|---|
| VIN | Supply, 2.7–5.5 V (straight to the chip and the pull-ups) |
| GND | Ground |
| SCL | I2C clock (10 kΩ pull-up to VIN) |
| SDA | I2C data (10 kΩ pull-up to VIN) |
| INT | Over/under-temperature interrupt, open-drain, active low (optional) |
| CT | Critical-temperature output, open-drain, active low (optional) |

## Electrical limits
- Supply: 2.7–5.5 V (chip and board). Absolute max 7 V.
- Current: 210 µA typical (250 µA max) while converting at 3.3 V; plus the board's power LED.
- SDA/SCL/A0/A1/INT/CT must stay within −0.3 V to VDD + 0.3 V.

## Interface details
- **I2C address 0x48** (A0, A1 low); 0x49 / 0x4A / 0x4B with the A0 / A1 jumpers closed.
- Registers (8-bit, pointer auto-increments): 0x00/0x01 temperature MSB/LSB, 0x02 status, 0x03 configuration, 0x04–0x09 THIGH/TLOW/TCRIT setpoints, 0x0A THYST, 0x0B ID (bits 7:3 = 11001, so `id & 0xF8 == 0xC8`), 0x2F software reset.
- Configuration 0x03: bit 7 = resolution (0 = 13-bit, power-up default; 1 = 16-bit), bits 6:5 = mode (00 continuous, 01 one-shot, 10 1 SPS, 11 shutdown).
- Read 2 bytes from 0x00, MSB first, twos complement.
  - 16-bit: T = code / 128 °C (code signed 16-bit).
  - 13-bit: T = (code >> 3) / 16 °C; bits 2:0 are TCRIT/THIGH/TLOW flags, not temperature.
- Conversion takes 240 ms typical (6 ms for the very first one after power-up).

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from adt7410 import ADT7410
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
sensor = ADT7410(i2c)          # switches to 16-bit mode, waits for a conversion
print('T=%.2fC' % sensor.temperature())
```

## Gotchas
- Power the board from 3.3 V with a 3.3 V microcontroller: the I2C pull-ups go to VIN, so 5 V on VIN puts 5 V on the GPIO pins.
- In the default 13-bit mode the low 3 bits are alarm flags; forgetting to shift them out gives readings that jump by up to 0.4 °C.
- Reading faster than every 240 ms just returns the same conversion again.
- Keep it away from the regulator and the microcontroller, which warm the air nearby; the chip itself only draws about 0.7 mW.
- Up to four on one bus using the A0/A1 jumpers.

## Datasheet
https://www.analog.com/media/en/technical-documentation/data-sheets/ADT7410.pdf
