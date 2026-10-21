---
name: part-tof10120
description: Pinout, electrical limits, wiring and MicroPython driver for the TOF10120 laser time-of-flight distance sensor module (Sharp SPAD ranging, UART + I2C, 10-180 cm). Use when designing, wiring, simulating or writing code for a TOF10120 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# TOF10120 laser distance sensor (I2C)

## Overview
The **TOF10120** is a small (20 x 13.2 mm) laser time-of-flight ranging module with a 940 nm class 1 VCSEL and Sharp SPAD detector. It measures 100-1800 mm indoors on a white target (about ±5 %), at most 33 ms per reading, and reports the distance in mm over a UART (9600 8-N-1, ASCII commands) or I2C. Modelled here: the common **TOF10120 laser range sensor module 10-180 cm UART/I2C** with its 6-wire 1.0 mm cable, used over **I2C**.

## Pinout (connector order)
| Pin | Name | Function |
|---|---|---|
| 1 | GND | Ground |
| 2 | VDD | Supply 3-5 V |
| 3 | RXD | UART input (ASCII commands). Optional |
| 4 | TXD | UART output. Optional |
| 5 | SDA | I2C data |
| 6 | SCL | I2C clock |

## Electrical limits
- Supply 3-5 V, about 35 mA. Operating temperature -20 to +70 °C.
- Serial pins are "TTL level" at the supply: power from 3.3 V on ESP32 / Pico.
- Add 4.7 kΩ pull-ups on SDA and SCL to 3.3 V.

## Interface details
- I2C address **0x52** (datasheet: slave ID 0xA4 = 8-bit write address; change with UART `s7-xxx#`).
- Read: write register pointer `0x00`, wait at least 30 µs, read 2 bytes, distance mm = MSB × 256 + LSB.
- UART commands (ASCII, end with `#`): `r1#` offset, `r2#` send interval, `r3#` distance mode, `r5#` send mode, `r6#` distance (`L=xxxx`, passive mode only), `r7#` I2C ID; `s3-0#` filtered (default) / `s3-1#` real-time, `s5-0#` active UART streaming (default) / `s5-1#` passive, `s2-xxxx#` interval 10-9999 ms. Replies `ok` / `fail`.

## Wiring
- ESP32: VDD -> 3V3, GND -> GND, SDA -> GPIO21, SCL -> GPIO22, 4.7 kΩ pull-ups to 3V3. I2C(0).
- Pico: VDD -> 3V3(OUT), GND -> GND, SDA -> GP4, SCL -> GP5, I2C(0).
- Raspberry Pi: VDD -> pin 1, GND -> pin 6, SDA -> pin 3, SCL -> pin 5 (the Pi has pull-ups fitted).

## Using the driver
```python
from machine import I2C, Pin
from tof10120 import TOF10120
i2c = I2C(0, sda=Pin(21), scl=Pin(22), freq=100000)
s = TOF10120(i2c)
print(s.distance_mm(), 'mm')
```

## Gotchas
- Using 0xA4 as the address in MicroPython fails: MicroPython takes the 7-bit address 0x52.
- Not found on the bus: check SDA/SCL are pins 5/6 (cable colours differ between batches) and that pull-ups are fitted.
- Readings under 100 mm or beyond ~1800 mm (80 cm on dark targets, less in sunlight) are unreliable.
- A dirty cover glass gives short, wrong readings.

## Datasheet
https://github.com/SoyM/TOF10120/blob/master/TOF10120.pdf (Shenzhen Hongchengji TOF10120, Chinese/English; I2C register 0x00 read sequence from the vendor Arduino example, as reproduced on electroniclinic.com)
