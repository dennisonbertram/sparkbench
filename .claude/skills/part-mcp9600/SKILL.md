---
name: part-mcp9600
description: Pinout, electrical limits, wiring and MicroPython driver for the MCP9600 I2C thermocouple amplifier (Microchip MCP9600). Use when designing, wiring, simulating or writing code for an MCP9600 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MCP9600 I2C thermocouple amplifier (MCP9600)

## Overview
The **MCP9600** from Microchip digitises a thermocouple's EMF with an 18-bit ADC, measures its own cold junction, and reports the compensated thermocouple temperature in °C (0.0625 °C/LSB) over I2C. It supports type K, J, T, N, S, E, B and R thermocouples (type K: −200 to 1372 °C, ±1.5 °C max). Hobbyists buy it as the **Adafruit MCP9600 I2C Thermocouple Amplifier (product 4101)**, which has the thermocouple screw terminal, SDA/SCL pull-ups and a level-safe 2.7–5 V supply.

## Pinout (Adafruit MCP9600 breakout, header order)
| Pin | Function |
|---|---|
| VIN | Supply, 2.7–5 V (3.3 V on ESP32/Pico) |
| GND | Ground |
| SCL | I2C clock |
| SDA | I2C data |
| A1 | Alert 1 output (optional) |
| A2 | Alert 2 output (optional) |
| A3 | Alert 3 output (optional) |
| A4 | Alert 4 output (optional) |
| ADR | Address select: tied to VIN on the board = 0x67, to GND = 0x60 |

The thermocouple goes into the separate 2-pin screw terminal marked + and −.

## Electrical limits
- Supply: 2.7–5.5 V (chip); Adafruit specifies 2.7–5 V for the board.
- Current: 0.3 mA typical, up to 2.5 mA while converting; 2 µA in shutdown.
- I2C: 100 kHz; the chip stretches the clock up to 60 µs.

## Interface details
- **I2C address 0x67** (Adafruit default), 0x60 with ADR to GND; resistor dividers give 0x60–0x67.
- Write the 1-byte register pointer, STOP, then read (the chip keeps the pointer).
- 0x00 TH: thermocouple (hot-junction) temperature, cold-junction compensated. 0x01 TΔ: TH − TC. 0x02 TC: cold-junction temperature. All 16-bit two's complement: T = UpperByte × 16 + LowerByte / 16, minus 4096 when negative.
- 0x05 sensor config: bits 6-4 thermocouple type (0 = K … 7 = R), bits 2-0 filter. 0x06 device config: 0x00 = 18-bit ADC, 0.0625 °C cold junction, continuous.
- 0x20 device ID: upper byte 0x40 (MCP9600), 0x41 (MCP9601). 18-bit conversion takes about 320 ms.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5 (set the bus to a low speed: clock stretching).

## Using the driver
```python
from machine import I2C, Pin
from mcp9600 import MCP9600
i2c = I2C(0, sda=Pin(21), scl=Pin(22), freq=100000)
tc = MCP9600(i2c, tc_type='K')
print('TH=%.2fC TC=%.2fC' % (tc.temperature(), tc.ambient()))
```

## Gotchas
- Set the right thermocouple type; the default is K.
- If heating the tip makes the reading go down, the thermocouple leads are swapped.
- Keep the board out of the heat: only the thermocouple tip goes in the oven.
- Raspberry Pi's hardware I2C struggles with clock stretching; slow the bus down.

## Datasheet
https://ww1.microchip.com/downloads/en/DeviceDoc/MCP960X-Data-Sheet-20005426.pdf
