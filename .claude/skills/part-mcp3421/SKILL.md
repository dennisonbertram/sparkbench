---
name: part-mcp3421
description: Pinout, electrical limits, wiring and MicroPython driver for the MCP3421 18-bit single-channel I2C analog-to-digital converter (Microchip MCP3421, Adafruit 5870 STEMMA QT breakout). Use when designing, wiring, simulating or writing code for an MCP3421 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MCP3421 18-bit ADC (MCP3421)

## Overview
The **MCP3421** from Microchip is a delta-sigma ADC with one differential input, an on-board 2.048 V reference, a programmable gain amplifier (x1, x2, x4, x8) and an I2C interface. Resolution trades against speed: 12 bits at 240 SPS, 14 at 60, 16 at 15, 18 at 3.75 SPS. Good for thermocouples, strain gauges and shunt resistors. Hobbyists buy it on the **Adafruit MCP3421 18-Bit ADC - STEMMA QT / Qwiic (product 5870)**: one 6-pin header, a 2-way screw terminal for the inputs, two STEMMA QT sockets and 10 kΩ pull-ups on SDA/SCL.

## Pinout (Adafruit 5870, header order left to right as printed)
| Pin | Function |
|---|---|
| VIN | Supply, 2.7-5.5 V (no regulator; use 3.3 V with an ESP32/Pico) |
| GND | Ground |
| SCL | I2C clock (10 kΩ pull-up to VIN) |
| SDA | I2C data (10 kΩ pull-up to VIN) |
| V+ | Positive analog input (also on the screw terminal) |
| V- | Negative analog input (also on the screw terminal) |

## Electrical limits
- Supply: 2.7-5.5 V; about 145 µA while converting continuously, far less in one-shot mode.
- Each input pin: GND - 0.3 V to VIN + 0.3 V. Differential range ±2.048 V / PGA; beyond it the code saturates (no roll-over).
- I2C: 100 kHz, 400 kHz or 3.4 MHz.

## Interface details
- **I2C address 0x68**, fixed (device code 1101, address bits 000 programmed at the factory).
- No register pointer: a write is one configuration byte `RDY C1 C0 O/C S1 S0 G1 G0`. RDY=1 starts a one-shot conversion; C1C0 are unused; O/C 0 = one-shot, 1 = continuous (power-on default 0x90: continuous, 12-bit, gain 1); S1S0 00/01/10/11 = 12/14/16/18 bits; G1G0 = gain 1/2/4/8. Example: 0x8C = one-shot, 18-bit, gain 1.
- A read returns the data bytes then the configuration byte: 3 data bytes at 18 bits (top 6 bits repeat the sign), 2 at 12-16 bits. RDY reads 0 once the result is new.
- Code is two's complement; volts = code x LSB / PGA, LSB = 2 x 2.048 V / 2^N (15.625 µV at 18 bits, 62.5 µV at 16, 250 µV at 14, 1 mV at 12).
- Conversion time = 1 / rate: about 267 ms at 18 bits, 67 ms at 16 bits.

## Wiring
- ESP32: VIN -> 3V3, GND -> GND, SDA -> D21, SCL -> D22.
- Pico: VIN -> 3V3(OUT), GND -> GND, SDA -> GP4, SCL -> GP5.
- Raspberry Pi 4: VIN -> pin 1 (3.3 V), GND -> pin 6, SDA -> pin 3, SCL -> pin 5.
- Single-ended signal: signal -> V+, V- -> GND (range 0 to 2.048 V at gain 1). Divide larger voltages down first.

## Using the driver
```python
from machine import I2C, Pin
from mcp3421 import MCP3421
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
adc = MCP3421(i2c, bits=18, gain=1)
print('%.5f V' % adc.read_volts())
```

## Gotchas
- VIN goes straight to the chip and the pull-ups: power it from 3.3 V with an ESP32 or Pico, not 5 V.
- An unconnected V- floats: tie it to GND for single-ended readings or the result wanders.
- 18-bit readings take a quarter of a second; use 16 or 12 bits when you need speed.
- At 18 bits the first data byte holds 6 copies of the sign bit; use only its low 2 bits.
- The address cannot be changed on this board: use a TCA9548A multiplexer for several.

## Datasheet
https://ww1.microchip.com/downloads/en/DeviceDoc/22003e.pdf
