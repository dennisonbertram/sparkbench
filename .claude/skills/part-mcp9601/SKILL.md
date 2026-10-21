---
name: part-mcp9601
description: Pinout, electrical limits, wiring and MicroPython driver for the MCP9601 I2C thermocouple amplifier with open/short-circuit detection (Microchip MCP9601 / MCP96L01, Adafruit 5165). Use when designing, wiring, simulating or writing code for an MCP9601 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MCP9601 I2C thermocouple amplifier (MCP9601)

## Overview
The **MCP9601** from Microchip digitises a thermocouple's EMF with an 18-bit ADC, measures its own cold junction, and reports the compensated thermocouple temperature in °C (0.0625 °C/LSB) over I2C. It supports type K, J, T, N, S, E, B and R thermocouples (type K: −200 to 1372 °C). Unlike the MCP9600 it also detects a **disconnected (open) or shorted thermocouple** through its VSENSE pin. Hobbyists buy it as the **Adafruit MCP9601 (MCP96L01) I2C Thermocouple Amplifier, product 5165**, which carries the MCP96L01 grade (±2 °C typ / ±4 °C max), the VSENSE resistors, SDA/SCL pull-ups, a thermocouple screw terminal and two STEMMA QT sockets.

## Pinout (Adafruit MCP9601 breakout, header order)
| Pin | Function |
|---|---|
| VIN | Supply, 3.3–5 V (3.3 V on ESP32/Pico) |
| GND | Ground |
| SCL | I2C clock (10k pull-up) |
| SDA | I2C data (10k pull-up) |
| A1 | Alert 1 output (optional) |
| A2 | Alert 2 output (optional) |
| A3 | Alert 3 output (optional) |
| A4 | Alert 4 output (optional) |
| ADDR | Address select: unconnected = 0x67, to GND = 0x60 |

The thermocouple goes into the separate 2-pin screw terminal marked + and −.

## Electrical limits
- Supply: 2.7–5.5 V (chip); Adafruit specifies 3.3–5 V for the board. VIN feeds the chip directly and the I2C pull-ups go to VIN, so power it from the same voltage as your board's logic.
- Current: 0.3 mA typical, up to 2.5 mA while converting.
- I2C: 100 kHz; the chip stretches the clock up to 60 µs.

## Interface details
- **I2C address 0x67** (default), 0x60 with ADDR to GND; back jumpers: 43k = 0x66, 22k = 0x65.
- Write the 1-byte register pointer, STOP, then read (the chip keeps the pointer).
- 0x00 TH: thermocouple (hot-junction) temperature, cold-junction compensated. 0x01 TΔ: TH − TC. 0x02 TC: cold-junction temperature. All 16-bit two's complement: T = UpperByte × 16 + LowerByte / 16, minus 4096 when negative.
- 0x04 STATUS (8-bit): bit 6 TH updated, bit 5 short circuit (thermocouple shorted to VDD/GND), bit 4 open circuit (thermocouple disconnected), bits 3-0 alert status.
- 0x05 sensor config: bits 6-4 thermocouple type (0 = K … 7 = R), bits 2-0 filter. 0x06 device config: 0x00 = 18-bit ADC, 0.0625 °C cold junction, continuous.
- 0x20 device ID: 0x4110 (upper byte 0x41 = MCP9601/L01/RL01, 0x40 would be an MCP9600). An 18-bit conversion takes about 320 ms.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5 (set the bus to a low speed: clock stretching).

## Using the driver
```python
from machine import I2C, Pin
from mcp9601 import MCP9601
i2c = I2C(0, sda=Pin(21), scl=Pin(22), freq=100000)
tc = MCP9601(i2c, tc_type='K')
print('TH=%.2fC TC=%.2fC %s' % (tc.temperature(), tc.ambient(), tc.fault()))  # fault(): 'OK', 'OPEN' or 'SHORT'
```

## Gotchas
- Set the right thermocouple type; the default is K.
- If heating the tip makes the reading go down, the thermocouple leads are swapped.
- When fault() says OPEN or SHORT the temperature registers are not valid; check the thermocouple wiring.
- Keep the board out of the heat: only the thermocouple tip goes in the oven.
- Raspberry Pi's hardware I2C struggles with clock stretching; slow the bus down.

## Datasheet
https://ww1.microchip.com/downloads/en/DeviceDoc/MCP960X-Data-Sheet-20005426.pdf
