---
name: part-sx1509
description: Pinout, electrical limits, wiring and MicroPython driver for the SX1509 16-channel I2C I/O expander (Semtech SX1509, SparkFun BOB-13601 breakout). Use when designing, wiring, simulating or writing code for an SX1509 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# SX1509 16-I/O expander (SX1509)

## Overview
The **SX1509** from Semtech adds 16 general-purpose pins over I2C, in two banks: Bank A (IO0–IO7, supplied by VCC1) and Bank B (IO8–IO15, supplied by VCC2). Each pin can be an input (pull-up or pull-down, 5.5 V tolerant) or an output, and the chip also has an LED driver (PWM, blink, breathe), a keypad scanner and level shifting between the banks. Hobbyists buy it on the **SparkFun SX1509 Breakout (BOB-13601)**, which has 10 kΩ pull-ups on SDA, SCL, RST and INT, ties VCC1/VCC2 to 3V3 through jumpers and sets the address to 0x3E.

## Pinout (SparkFun BOB-13601)
| Header | Pins in order |
|---|---|
| Top I2C/power | INT, RST, GND, 3V3, SDA, SCL |
| Left I/O column | GND, 0, 1, 2, 3, VCC1, 4, 5, 6, 7 |
| Bottom I2C/power | OSC, RST, GND, 3.3V, SDA, SCL (same nets as the top header, for daisy-chaining) |
| Right I/O column | 8, 9, 10, 11, VCC2, 12, 13, 14, 15, GND |

- Next to each I/O column is an optional power rail (GND by default; rear jumpers can switch it to VCC1/VCC2).
- RST (active low), INT (active-low interrupt) and OSC (clock in/out or GPO) are optional.

## Electrical limits
- Supply (3V3 / VDDM): 1.425–3.6 V, absolute max 3.7 V. **Do not power it from 5 V.**
- VCC1/VCC2 (I/O banks): 1.2–3.6 V; tied to 3V3 on the breakout by default.
- Supply current: about 0.37 mA with the internal oscillator on, ~1 µA with it off.
- Each output sources up to 8 mA and sinks up to 15 mA (VCCx ≥ 2 V). Inputs tolerate up to 5.5 V.

## Interface details
- **I2C address 0x3E** (ADD1 ADD0 = 00), 0x3F (01), 0x70 (10), 0x71 (11). 100 or 400 kHz.
- Register pairs are **Bank B first, then Bank A**:
  - RegInputDisableB/A 0x00/0x01 (1 = input buffer off)
  - RegPullUpB/A 0x06/0x07, RegPullDownB/A 0x08/0x09, RegOpenDrainB/A 0x0A/0x0B
  - RegDirB/A 0x0E/0x0F: 1 = input (reset 0xFF), 0 = output
  - RegDataB/A 0x10/0x11: write = output level, read = level at the pins (reset 0xFF)
  - RegReset 0x7D: write 0x12 then 0x34 for a software reset
- Register addresses auto-increment on multi-byte reads/writes (RegMisc bit 1 = 0, the default).

## Wiring
- ESP32: 3V3 → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: 3V3 → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: 3V3 → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.
- LED on an output: IOx → 330 Ω → LED → GND. Button on an input: IOx → button → GND, with the pull-up enabled.

## Using the driver
```python
from machine import I2C, Pin
from sx1509 import SX1509, INPUT, OUTPUT
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
io = SX1509(i2c)                  # 0x3E, software reset + presence check
io.value(0, 0)                    # latch low first (latches reset high)
io.pin_mode(0, OUTPUT)            # IO0
io.pin_mode(8, INPUT, pull='up')  # IO8
io.value(0, 1)                    # IO0 high
print(io.value(8))                # 0 while a button to GND is pressed
```
Pins are numbered 0–15 as printed on the board. `read_port()` / `write_port()` work on all 16 bits (bits 0–7 = IO0–7).

## Gotchas
- 3.3 V only: the chip's absolute maximum supply is 3.7 V.
- Bank B registers come before Bank A (0x10 = IO8–15, 0x11 = IO0–7) — the opposite of most expanders.
- Reading RegData returns the pin levels, not the output latch; the driver keeps a copy of the latch so read-modify-write can't flip outputs.
- Everything starts as an input with the latch high; an LED wired IO → LED → GND lights as soon as you make the pin an output unless you write it low first.
- Floating inputs read random values: enable the pull-up or pull-down.

## Datasheet
https://cdn.sparkfun.com/datasheets/BreakoutBoards/sx1509.pdf
