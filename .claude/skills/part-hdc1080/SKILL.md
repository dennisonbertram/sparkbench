---
name: part-hdc1080
description: Pinout, electrical limits, wiring and MicroPython driver for the HDC1080 temperature & humidity sensor (Texas Instruments HDC1080, CJMCU-1080 module). Use when designing, wiring, simulating or writing code for an HDC1080 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# HDC1080 temperature & humidity sensor (HDC1080)

## Overview
The **HDC1080** from Texas Instruments measures temperature (−40 to 125 °C, ±0.2 °C typical) and relative humidity (0–100 %, ±2 % typical) with 14-bit results. It talks I2C at a fixed address. Hobbyists buy it on the blue **CJMCU-1080** module: the bare chip, a decoupling capacitor and two 10 kΩ pull-ups (SDA, SCL) to VCC; there is no regulator.

## Pinout (CJMCU-1080, header order)
| Pin | Function |
|---|---|
| GND | Ground |
| SCL | I2C clock (10 kΩ pull-up to VCC) |
| SDA | I2C data (10 kΩ pull-up to VCC) |
| VCC | Supply, 2.7–5.5 V, straight to the chip |

## Electrical limits
- Supply: 2.7–5.5 V (absolute max 6 V). Use 3.3 V with 3.3 V microcontrollers, since the pull-ups go to VCC.
- Current: about 190 µA while converting, 100 nA asleep.
- Temperature sensor −40 to 125 °C; humidity sensor −20 to 85 °C, non-condensing.
- Start-up: up to 15 ms after power-up before the first measurement.

## Interface details
- **I2C address 0x40** (fixed).
- Registers (16-bit, MSB first): 0x00 temperature, 0x01 humidity, 0x02 configuration (reset 0x1000), 0xFE manufacturer ID = 0x5449, 0xFF device ID = 0x1050.
- Configure: write 0x02 0x10 0x00 (heater off, MODE=1 = T then RH, 14-bit T and RH).
- Measure: pointer write 0x00 starts the conversion; wait ≥ 13 ms (6.35 ms T + 6.5 ms RH); read 4 bytes: T MSB, T LSB, RH MSB, RH LSB. Reading too early is NACKed.
- Temperature: T = raw / 2^16 × 165 − 40 °C. Humidity: RH = raw / 2^16 × 100 %. The two lowest bits are always 0. No CRC.

## Wiring
- ESP32: VCC → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VCC → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from hdc1080 import HDC1080
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
t, h = HDC1080(i2c).read()
print('T=%.1fC H=%.1f%%' % (t, h))
```

## Gotchas
- Do not power the module from 5 V when the bus goes to an ESP32 or Pico: the on-board pull-ups would put 5 V on the GPIOs.
- Address 0x40 is fixed and is shared with HTU21D/Si7021/SHT21 and a default INA219, so only one of them per bus.
- The driver checks the manufacturer and device IDs at start-up; "not found" means wiring or a different chip.
- Keep it away from the regulator and the microcontroller, which warm the air nearby. The built-in heater (config bit 13) is only for drying off condensation.

## Datasheet
https://www.ti.com/lit/ds/symlink/hdc1080.pdf
