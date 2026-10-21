---
name: part-mcp23017
description: Pinout, electrical limits, wiring and MicroPython driver for the MCP23017 16-bit I2C I/O expander (CJMCU-2317 module). Use when designing, wiring, simulating or writing code for an MCP23017 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MCP23017 16-bit I/O expander (MCP23017)

## Overview
The **MCP23017** from Microchip adds 16 general-purpose pins over I2C: port A (GPA0–GPA7) and port B (GPB0–GPB7). Each pin can be an input (with an optional internal 100 kΩ pull-up) or an output, and two interrupt outputs (INTA/INTB) can flag input changes. Hobbyists buy it on the purple **CJMCU-2317** module, which has 10 kΩ pull-ups on SDA, SCL and RESET and pulls A0–A2 low (address 0x20). No regulator: the chip runs straight from VCC.

## Pinout (CJMCU-2317, three 10-pin headers)
| Header | Pins in order |
|---|---|
| JP1 | GND, VCC, SCL (SCL/SCK), SDA (SDA/SI), NC/CS, NC/SO, RESET, A0, A1, A2 |
| JP2 | GND, ITA (INTA), GPA0 … GPA7 |
| JP3 | VCC, ITB (INTB), GPB0 … GPB7 |

- NC/CS and NC/SO are only used on the SPI twin (MCP23S17); leave them open.
- RESET is active-low and already pulled high; leave it open.
- A0–A2 are address pins (pulled low). Some boards silk the port pins as A0–A7 / B0–B7: don't confuse GPA0 with address pin A0.

## Electrical limits
- Supply: 1.8–5.5 V (absolute max 5.5 V). I2C at 400 kHz needs ≥ 2.7 V.
- Supply current: 1 mA max active, ~1 µA standby.
- Each pin sources/sinks up to 25 mA; total 125 mA into VDD, 150 mA out of VSS.
- **GPA7 and GPB7 are output only** on the MCP23017 (datasheet rev D).

## Interface details
- **I2C address 0x20 + (A2 A1 A0)** → 0x20–0x27; up to 8 chips on one bus.
- Power-on map (IOCON.BANK = 0, auto-incrementing pointer):
  - IODIRA 0x00 / IODIRB 0x01: 1 = input (reset 0xFF), 0 = output
  - GPPUA 0x0C / GPPUB 0x0D: 1 = 100 kΩ pull-up
  - GPIOA 0x12 / GPIOB 0x13: read pin levels
  - OLATA 0x14 / OLATB 0x15: output latches
  - IOCON 0x0A (and 0x0B): configuration (driver writes 0x00)
- Write: address, register, data… (sequential). Read: write the register, then read; reading 2 bytes from 0x12 gives GPIOA then GPIOB.

## Wiring
- ESP32: VCC → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VCC → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.
- LED on an output: GPAx → 330 Ω → LED → GND. Button on an input: GPBx → button → GND, with the pull-up enabled.

## Using the driver
```python
from machine import I2C, Pin
from mcp23017 import MCP23017, INPUT, OUTPUT
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
io = MCP23017(i2c)                  # 0x20
io.pin_mode(0, OUTPUT)              # GPA0
io.pin_mode(8, INPUT, pullup=True)  # GPB0
io.value(0, 1)                      # GPA0 high
print(io.value(8))                  # 0 while a button to GND is pressed
```
Pins are numbered 0–15 (0–7 = GPA0–7, 8–15 = GPB0–7). `read_port()` / `write_port()` / `config_port()` work on all 16 bits at once.

## Gotchas
- The module's SDA/SCL pull-ups go to VCC: power it from 3.3 V with an ESP32 or Pico.
- Don't use GPA7/GPB7 as inputs (output only on the MCP23017).
- Set outputs through OLAT; read inputs from GPIO. A floating input reads random values: enable the pull-up or wire a resistor.
- Two modules on one bus: tie A0 to VCC on the second (0x21).

## Datasheet
https://ww1.microchip.com/downloads/aemDocuments/documents/APID/ProductDocuments/DataSheets/MCP23017-Data-Sheet-DS20001952.pdf
