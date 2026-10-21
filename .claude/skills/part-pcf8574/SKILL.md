---
name: part-pcf8574
description: Pinout, electrical limits, wiring and MicroPython driver for the PCF8574 8-bit I2C I/O expander (TI/NXP PCF8574, Adafruit #5545 breakout). Use when designing, wiring, simulating or writing code for a PCF8574 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# PCF8574 8-bit I/O expander (PCF8574)

## Overview
The **PCF8574** (TI SCPS068, also NXP) adds eight GPIO pins, P0–P7, over I2C. It has **no registers and no direction register**. You write one byte to set all eight output latches (bit 7 = P7) and read one byte to get all eight pin levels. Each pin is **quasi-bidirectional**. Latched high, it is a weak 30–310 µA pull-up that you can read as an input. Latched low, it sinks up to 25 mA. Hobbyists buy it on the **Adafruit PCF8574 I2C GPIO Expander Breakout (#5545)**, which has 10 k I2C pull-ups, STEMMA QT connectors and address jumpers.

## Pinout (Adafruit #5545, header order)
The board has two rows of pins. Sparkbench models them as one 16-pin row: the power/I2C row first, then the I/O row.

| Pin | Function |
|---|---|
| VIN | Supply, 3–5 V (same as your logic level; chip allows 2.5–6 V) |
| GND | Ground |
| SCL | I2C clock (10 k pull-up) |
| SDA | I2C data (10 k pull-up) |
| INT | Interrupt, open-drain, active low (optional) |
| A0 | Address bit 0: open = 0x20, to VIN = 0x21 (optional) |
| + | I/O-row supply (same net as VIN) |
| P7 … P0 | Quasi-bidirectional I/O |
| - | I/O-row ground (same net as GND) |

## Electrical limits
- Supply: 2.5–6 V (chip). The breakout runs at your microcontroller's logic level, 3–5 V.
- I2C: **100 kHz maximum** (standard mode only).
- Each P pin sinks up to 25 mA (50 mA absolute max). The total through VCC/GND is 100 mA max.
- A pin can only pull high weakly (−30 to −310 µA), so it **cannot source current to an LED**.
- Supply current: 100 µA max while operating, 10 µA in standby.

## Interface details
- **I2C address 0x20–0x27** = 0b0100 A2 A1 A0. The default is 0x20. Tie A0 to VIN, or close the A0/A1/A2 jumpers on the back, to change it. (The PCF8574A variant uses 0x38–0x3F.)
- Write: `[addr+W] [P7..P0]`. The chip ignores any extra bytes after the first.
- Read: `[addr+R]` returns the levels on P7..P0. A pin latched low always reads 0.
- At power-on every latch is high, so every pin starts as an input.
- INT goes low when an input pin changes. Reading or writing the port clears it.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.
- LED: + → 1 kΩ → LED anode, LED cathode → Pn. The LED lights when Pn is written 0.
- Button: Pn → button → GND. Keep Pn written 1. Pressed reads 0.

## Using the driver
```python
from machine import I2C, Pin
from pcf8574 import PCF8574
i2c = I2C(0, sda=Pin(21), scl=Pin(22), freq=100000)
io = PCF8574(i2c, 0x20)
pressed = io.pin(7) == 0   # button on P7 to GND
io.pin(0, 0)               # sink P0 low: LED from + to P0 turns on
print(hex(io.read_port()))
```

## Gotchas
- Set `freq=100000`. MicroPython often defaults to 400 kHz, which is beyond the chip's rating.
- To read a pin as an input, write it 1 first. A pin written 0 always reads 0.
- Wire LEDs active-low, from + into the pin. An LED from the pin to GND stays almost dark.
- Never connect a pin written 0 straight to VIN. It sinks current until the chip overheats.
- A PCF8574A answers at 0x38–0x3F, not 0x20. Run `i2c.scan()` if nothing responds.

## Datasheet
https://www.ti.com/lit/ds/symlink/pcf8574.pdf
