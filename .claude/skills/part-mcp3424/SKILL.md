---
name: part-mcp3424
description: Pinout, electrical limits, wiring and MicroPython driver for the MCP3424 18-bit 4-channel I2C analog-to-digital converter (Microchip MCP3424, DFRobot DFR0316 module). Use when designing, wiring, simulating or writing code for an MCP3424 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MCP3424 18-bit 4-channel ADC (MCP3424)

## Overview
The **MCP3424** from Microchip is a delta-sigma ADC with 4 differential inputs, an on-board 2.048 V reference, a programmable gain amplifier (x1, x2, x4, x8) and an I2C interface. Resolution trades against speed: 12 bits at 240 SPS, 14 at 60, 16 at 15, 18 at 3.75 SPS. Hobbyists buy it on the **DFRobot Fermion MCP3424 module (DFR0316)**: two 6-pin headers on opposite edges, a 2-way DIP switch for the address and 1 kΩ pull-ups on SDA/SCL.

## Pinout (DFR0316, header by header, top to bottom with the DIP switch at the top)
| Pin | Function |
|---|---|
| GND | Ground |
| +5V | Supply, 2.7-5.5 V (use 3.3 V with an ESP32/Pico) |
| C3+ | Channel 3 positive input |
| C3- | Channel 3 negative input |
| C4+ | Channel 4 positive input |
| C4- | Channel 4 negative input |
| SCL | I2C clock (1 kΩ pull-up to +5V) |
| SDA | I2C data (1 kΩ pull-up to +5V) |
| C2- | Channel 2 negative input |
| C2+ | Channel 2 positive input |
| C1- | Channel 1 negative input |
| C1+ | Channel 1 positive input |

## Electrical limits
- Supply: 2.7-5.5 V; about 135 µA converting continuously at 3 V.
- Each input pin: GND - 0.3 V to supply + 0.3 V. Differential range ±2.048 V / PGA; beyond it the code sticks at the maximum.
- I2C: 100 kHz, 400 kHz or 3.4 MHz.
- The board pulls SDA/SCL up to its supply pin with 1 kΩ: power it from 3.3 V so the bus stays at 3.3 V logic.

## Interface details
- **I2C address 0x68** with both DIP switches off. Switch A = Adr0, B = Adr1: B on 0x6A, A on 0x6C, both on 0x6E (base code 1101 A2 A1 A0).
- No register pointer: a write is one configuration byte `RDY C1 C0 O/C S1 S0 G1 G0`. RDY=1 starts a one-shot conversion; C1C0 = channel-1; O/C 0 = one-shot, 1 = continuous; S1S0 00/01/10/11 = 12/14/16/18 bits; G1G0 = gain 1/2/4/8. Example: 0x8C = channel 1, one-shot, 18-bit, gain 1.
- A read returns the data bytes then the configuration byte: 3 data bytes at 18 bits (top 6 bits repeat the sign), 2 at 12-16 bits. RDY reads 0 once the result is new.
- Code is two's complement; volts = code x LSB / PGA, LSB = 2 x 2.048 V / 2^N (15.625 µV at 18 bits, 62.5 µV at 16, 250 µV at 14, 1 mV at 12).
- Conversion time = 1 / rate: about 267 ms at 18 bits, 67 ms at 16 bits.

## Wiring
- ESP32: +5V -> 3V3, GND -> GND, SDA -> D21, SCL -> D22.
- Pico: +5V -> 3V3(OUT), GND -> GND, SDA -> GP4, SCL -> GP5.
- Raspberry Pi 4: +5V -> pin 1 (3.3 V), GND -> pin 6, SDA -> pin 3, SCL -> pin 5.
- Single-ended signal on channel n: signal -> Cn+, Cn- -> GND (range 0 to 2.048 V at gain 1). Divide larger voltages down first.

## Using the driver
```python
from machine import I2C, Pin
from mcp3424 import MCP3424
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
adc = MCP3424(i2c, addr=0x68, bits=18, gain=1)
print('CH1=%.5fV' % adc.read_volts(1))
```

## Gotchas
- Despite the "+5V" label, run it from 3.3 V with an ESP32 or Pico: the on-board pull-ups follow the supply.
- An unconnected C- input floats: tie it to GND for single-ended readings or the result wanders.
- 18-bit readings take a quarter of a second per channel; use 16 or 12 bits when you need speed.
- At 18 bits the first data byte holds 6 copies of the sign bit; use only its low 2 bits.

## Datasheet
https://ww1.microchip.com/downloads/en/DeviceDoc/22088c.pdf
