---
name: part-tca9555
description: Pinout, electrical limits, wiring and MicroPython driver for the TCA9555 16-bit I2C I/O expander (Texas Instruments TCA9555, MusRock 24-pin expansion board). Use when designing, wiring, simulating or writing code for a TCA9555 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# TCA9555 16-bit I/O expander (TCA9555)

## Overview
The **TCA9555** from Texas Instruments adds 16 general-purpose pins over I2C: port 0 (P00–P07) and port 1 (P10–P17). Each pin is an input with a fixed internal ~100 kΩ pull-up, or a push-pull output, and an open-drain INT output flags input changes. It is register-compatible with the NXP PCA9555 (some boards ship with either chip). The modelled board is the green **MusRock TCA9555 I2C I/O Expander 16-Bit GPIO Expansion Board**: a 24-pin DIP-style carrier (two rows 800 mil apart) with 10 kΩ pull-ups on SDA, SCL and nINT and 10 kΩ pull-downs on A0–A2 (address 0x20). No regulator: the chip runs straight from VDD.

## Pinout (two 12-pin rows)
| Header | Pins in order |
|---|---|
| J1 | nINT, A1, A2, P00, P01, P02, P03, P04, P05, P06, P07, GND |
| J2 | VDD (silk "V" on top), SDA, SCL, A0, P17, P16, P15, P14, P13, P12, P11, P10 |

- A0–A2 are address pins (pulled low). Tie one to VDD to change the address; never leave the chip's address pins floating.
- With 24 pins on two rows, Sparkbench wires the board with jumper leads to a single-row connector.

## Electrical limits
- Supply: 1.65–5.5 V (absolute max 6 V). P-port pins are 5 V tolerant.
- Supply current: 22 µA typ. (40 µA max) at 5.5 V with 400 kHz I2C traffic; 3.5 µA max standby with inputs high, but up to 1.5 mA when all 16 inputs are held low (the internal pull-ups).
- Each pin sinks/sources up to 25 mA; per 8-pin port 100 mA sunk / 80 mA sourced; chip total 200 mA sunk / 160 mA sourced.

## Interface details
- **I2C address 0x20 + (A2 A1 A0)** → 0x20–0x27; same address range as PCF8574/PCF8575, up to 8 chips on one bus. 100 kHz or 400 kHz.
- Command byte selects a register (datasheet Table 3):
  - 0x00 / 0x01 Input Port 0 / 1: read the pin levels (works for outputs too)
  - 0x02 / 0x03 Output Port 0 / 1: output latches, power-up 0xFF
  - 0x04 / 0x05 Polarity Inversion: 1 = invert that input, power-up 0x00
  - 0x06 / 0x07 Configuration: 1 = input (power-up 0xFF), 0 = output
- Write: address, command byte, data (a second byte goes to the other register of the pair). Read: write the command byte, repeated start, read; reading 2 bytes from 0x00 gives Input Port 0 then 1.
- INT goes low when an input changes and clears when the Input Port is read.

## Wiring
- ESP32: VDD → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VDD → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VDD → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.
- LED on an output: P0x → 330 Ω → LED → GND. Button on an input: P1x → button → GND (the internal pull-up makes it read 1 when released).

## Using the driver
```python
from machine import I2C, Pin
from tca9555 import TCA9555, INPUT, OUTPUT
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
io = TCA9555(i2c)        # 0x20
io.value(0, 0)           # latch P00 low first...
io.pin_mode(0, OUTPUT)   # ...then make it an output
io.pin_mode(8, INPUT)    # P10
io.value(0, 1)           # P00 high
print(io.value(8))       # 0 while a button to GND is pressed
```
Pins are numbered 0–15 (0–7 = P00–P07, 8–15 = P10–P17). `read_port()` / `write_port()` / `config_port()` work on all 16 bits at once; `invert()` sets polarity inversion.

## Gotchas
- Output latches power up at 1: set the level before switching a pin to output, or it glitches high.
- There is no pull-up register: inputs always have the ~100 kΩ pull-up (that is the difference from the TCA9535).
- Set outputs through the Output Port; read inputs from the Input Port (reading the Output Port gives the latch, not the pin).
- The board's SDA/SCL pull-ups go to VDD: power it from 3.3 V with an ESP32 or Pico.
- Two boards on one bus: tie A0 to VDD on the second (0x21).

## Datasheet
https://www.ti.com/lit/ds/symlink/tca9555.pdf
