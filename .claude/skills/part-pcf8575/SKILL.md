---
name: part-pcf8575
description: Pinout, electrical limits, wiring and MicroPython driver for the PCF8575 16-bit I2C I/O expander (TI PCF8575, Adafruit #5611 breakout). Use when designing, wiring, simulating or writing code for a PCF8575 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# PCF8575 16-bit I/O expander (PCF8575)

## Overview
The **PCF8575** (TI SCPS121) adds sixteen GPIO pins over I2C. It has **no registers and no direction register**. Every transfer is a **pair of bytes**: the first byte is port 0 (P07–P00), the second is port 1 (P17–P10). You write a pair to set all sixteen output latches and read a pair to get all sixteen pin levels. Each pin is **quasi-bidirectional**. Latched high, it is a weak 30–300 µA pull-up that you can read as an input. Latched low, it sinks up to 25 mA. Hobbyists buy it on the **Adafruit PCF8575 I2C 16 GPIO Expander Breakout (#5611)**, which has 10 k I2C pull-ups, STEMMA QT connectors, address pins and jumpers.

## Pinout (Adafruit #5611, header order)
The board has four rows of pads. Sparkbench models them as one 26-pin row, wired with jumper cables: the bottom header, then the top header, then one pad of each power rail.

| Pin | Function |
|---|---|
| VIN | Supply, 3–5 V (same as your logic level; chip allows 2.5–5.5 V) |
| G | Ground |
| SCL | I2C clock (10 k pull-up) |
| SDA | I2C data (10 k pull-up) |
| P0 … P7 | Quasi-bidirectional I/O, chip P00–P07 (port 0, first byte) |
| IRQ | Interrupt (chip INT), open-drain, active low (optional) |
| A0, A1, A2 | Address pins: open = 0, to VIN = 1 (optional) |
| 15, 14, 13, 12, 11, 10, P9, P8 | Quasi-bidirectional I/O, chip P17–P10 (port 1, second byte) |
| VCC | Row of 8 pads marked + / VCC, same net as VIN |
| GND | Row of 8 pads marked - / GND, same net as G |

## Electrical limits
- Supply: 2.5–5.5 V (chip). The breakout runs at your microcontroller's logic level, 3–5 V.
- I2C: up to **400 kHz** (Fast mode).
- Each pin sinks up to 25 mA when written 0 (50 mA absolute max).
- A pin can only pull high weakly (−30 to −300 µA), so it **cannot source current to an LED**.
- Supply current: 200 µA max operating at 5.5 V, 10 µA standby.

## Interface details
- **I2C address 0x20–0x27** = 0b0100 A2 A1 A0. The default is 0x20.
- Write: `[addr+W] [P07..P00] [P17..P10]`. The output changes after each complete pair; more pairs may follow.
- Read: `[addr+R]` returns `[P07..P00] [P17..P10]`. A pin latched low always reads 0.
- At power-on every latch is high, so every pin starts as an input.
- INT goes low when an input pin changes. Reading or writing the port clears it.

## Wiring
- ESP32: VIN → 3V3, G → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), G → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), G → pin 6, SDA → pin 3, SCL → pin 5.
- LED: VCC → 1 kΩ → LED anode, LED cathode → pin. The LED lights when the pin is written 0.
- Button: pin → button → GND. Keep the pin written 1. Pressed reads 0.

## Using the driver
The driver numbers pins 0–15 as on the board (P0–P7 = 0–7, P8 = 8 … 15 = 15).
```python
from machine import I2C, Pin
from pcf8575 import PCF8575
i2c = I2C(0, sda=Pin(21), scl=Pin(22), freq=400000)
io = PCF8575(i2c, 0x20)
pressed = io.pin(15) == 0   # button on pin 15 (chip P17) to GND
io.pin(0, 0)                # sink P0 low: LED from VCC to P0 turns on
print('%04X' % io.read_port())
```

## Gotchas
- Always send and read **two** bytes. A single byte is not a complete transfer, so the port does not update.
- Bit 15 of `read_port()` is the second byte's bit 7 (chip P17, labelled 15).
- To read a pin as an input, write it 1 first. A pin written 0 always reads 0.
- Wire LEDs active-low, from VCC into the pin. An LED from the pin to GND stays almost dark.
- Shares the 0x20–0x27 range with the PCF8574, MCP23017 and TCA9555. Give each chip its own address.

## Datasheet
https://www.ti.com/lit/ds/symlink/pcf8575.pdf
