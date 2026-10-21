---
name: part-mb85rc256v
description: Pinout, electrical limits, wiring and MicroPython driver for the MB85RC256V 32 KB I2C FRAM (Fujitsu MB85RC256V, Adafruit 1895 breakout). Use when designing, wiring, simulating or writing code for an MB85RC256V / I2C FRAM in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MB85RC256V 32 KB I2C FRAM (MB85RC256V)

## Overview
The **MB85RC256V** from Fujitsu is a 256 Kbit (32 KB) ferroelectric RAM. It keeps its data with the power off, like an EEPROM, but every byte writes as fast as RAM: there is no write delay and no page size, and each byte survives 10^12 writes. It talks I2C at up to 1 MHz. Hobbyists buy it on the **Adafruit I2C Non-Volatile FRAM Breakout (product 1895)**. That board has 10 kΩ pull-ups from SDA/SCL to VCC and a 10 µF decoupling capacitor.

## Pinout (Adafruit 1895, header order)
| Pin | Function |
|---|---|
| VCC | Supply, 2.7–5.5 V |
| GND | Ground |
| WP | Write protect: high blocks writes. Internal pull-down, so leave it open to allow writing |
| SCL | I2C clock (10 kΩ pull-up to VCC) |
| SDA | I2C data (10 kΩ pull-up to VCC) |
| A2 | Address bit 2 (internal pull-down) |
| A1 | Address bit 1 (internal pull-down) |
| A0 | Address bit 0 (internal pull-down) |

## Electrical limits
- Supply: 2.7–5.5 V (absolute max 6.0 V).
- Current: 130 µA at 400 kHz, 200 µA max at 1 MHz, 27 µA typical in standby.
- I2C up to 1 MHz.
- Data retention: 10 years at 85 °C, 95 years at 55 °C.

## Interface details
- **I2C address 0x50** (binary 1010 A2 A1 A0). A2–A0 high give 0x51–0x57, so up to 8 boards can share a bus.
- **Write**: address byte (R/W = 0), memory address high byte (top bit 0), low byte, then data bytes. The address auto-increments and wraps from 0x7FFF to 0x0000. Data is stored as each byte is acknowledged, so no tWC wait is needed.
- **Random / sequential read**: write the two address bytes with no STOP, send a repeated START, then read any number of bytes. The address auto-increments and wraps.
- **Current address read**: a plain read continues from the last address + 1. The address is undefined after power-up.
- **Device ID**: write the device address word to the reserved ID 0xF8 (7-bit 0x7C), send a repeated START to 0xF9, then read 3 bytes. Manufacturer = 0x00A (Fujitsu), product = 0x510 (density 5 = 256 Kbit).

## Wiring
- ESP32: VCC → 3V3, GND → GND, SDA → D21, SCL → D22. Leave WP and A0–A2 open.
- Pico: VCC → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from mb85rc256v import MB85RC256V
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
fram = MB85RC256V(i2c)
fram.write(0x0000, b'hello')
print(fram.read(0x0000, 5))         # b'hello'
fram.write_u16(0x0010, 1234)         # stored high byte first
print(fram.read_u16(0x0010))
print(fram.device_id())              # (10, 1296) = (0x00A, 0x510) on a genuine chip
```

## Gotchas
- Power the board from 3.3 V when you use an ESP32 or Pico. Its pull-ups go to VCC, so at 5 V they would put 5 V on the 3.3 V GPIOs.
- If WP is high, writes are ignored without any error, and reads return the old data.
- A0–A2 must stay fixed while the chip is in use. Change them with the power off.
- A new chip holds unknown data. Store a marker byte or checksum, and check it before trusting saved settings.
- Don't use `readfrom_mem(..., addrsize=16)`: some ports ignore `addrsize`. The driver sends the two address bytes itself.

## Datasheet
https://cdn-shop.adafruit.com/product-files/1895/MB85RC256V-DS501-00017-3v0-E.pdf
