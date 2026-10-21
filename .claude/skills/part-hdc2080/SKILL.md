---
name: part-hdc2080
description: Pinout, electrical limits, wiring and MicroPython driver for the HDC2080 temperature & humidity sensor (Texas Instruments HDC2080, TinkeringTech HDC2080 breakout). Use when designing, wiring, simulating or writing code for an HDC2080 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# HDC2080 temperature & humidity sensor (HDC2080)

## Overview
The **HDC2080** from Texas Instruments measures temperature (−40 to 125 °C, ±0.2 °C typical) and relative humidity (0–100 %, ±2 % typical) with 14-bit results, drawing well under 1 µA between readings. It talks I2C. Hobbyists buy it on the purple **TinkeringTech HDC2080 breakout**: the bare chip, a decoupling capacitor and two 10 kΩ pull-ups (SDA, SCL) to 3.3V, with ADDR tied to GND. There is no regulator.

## Pinout (TinkeringTech HDC2080 breakout, header order)
| Pin | Function |
|---|---|
| 3.3V | Supply, 1.62–3.6 V, straight to the chip |
| INT | DRDY/INT output, push-pull, high-Z until enabled (optional) |
| SCL | I2C clock (10 kΩ pull-up to 3.3V) |
| SDA | I2C data (10 kΩ pull-up to 3.3V) |
| GND | Ground |

## Electrical limits
- Supply: 1.62–3.6 V (absolute max 3.9 V). **Never 5 V.**
- Current: about 0.65 mA during an RH conversion, 0.55 mA for temperature, 50 nA asleep.
- I2C up to 400 kHz.

## Interface details
- **I2C address 0x40** (ADDR to GND, as on this board); 0x41 with ADDR to VDD on the bare chip.
- 8-bit registers with auto-increment. Results are 16-bit words sent **LSB first**: 0x00 T low, 0x01 T high, 0x02 RH low, 0x03 RH high. The two lowest bits are always 0.
- On-demand measurement: write **0x01** to 0x0F (14-bit T and RH, MEAS_TRIG), wait ≥ 1.3 ms (610 µs + 660 µs typical), read 4 bytes from 0x00.
- Temperature: T = raw / 65536 × 165 − 40.5 °C (add 0.08 °C/V × (VDD − 1.8 V) for best accuracy). Humidity: RH = raw / 65536 × 100 %.
- IDs: manufacturer 0x5449 (0xFC/0xFD), device 0x07D0 (0xFE/0xFF), both LSB first.

## Wiring
- ESP32: 3.3V → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: 3.3V → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: 3.3V → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from hdc2080 import HDC2080
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
t, h = HDC2080(i2c).read()
print('T=%.1fC H=%.1f%%' % (t, h))
```
Pass `vdd=3.3` to apply the datasheet's supply correction (about +0.12 °C at 3.3 V).

## Gotchas
- The ID check failing nearly always means a loose SDA/SCL wire or the wrong address.
- Address 0x40 clashes with the HDC1080, HTU21D/Si7021 and INA219 (default) on the same bus.
- Keep it away from the regulator and the microcontroller, which warm the air nearby.
- The built-in heater draws about 90 mA: leave HEAT_EN (0x0E bit 3) off unless you mean it.

## Datasheet
https://www.ti.com/lit/ds/symlink/hdc2080.pdf
