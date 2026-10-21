---
name: part-mcp4725
description: Pinout, electrical limits, wiring and MicroPython driver for the MCP4725 12-bit I2C DAC (Microchip MCP4725, Adafruit 935 breakout). Use when designing, wiring, simulating or writing code for an MCP4725 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MCP4725 12-bit I2C DAC (MCP4725)

## Overview
The **MCP4725** from Microchip is a single-channel 12-bit digital-to-analog converter with an I2C interface and an EEPROM that holds the power-up output code. Its supply is also its reference: **Vout = VDD × code / 4096**, rail to rail. Hobbyists buy it on the **Adafruit MCP4725 Breakout Board (product 935, STEMMA QT)**, which carries the MCP4725A1, 10 kΩ pull-ups on SDA/SCL and an A0 address pin.

## Pinout (Adafruit 935, header order)
| Pin | Function |
|---|---|
| VIN | Supply 2.7–5.5 V, also the DAC reference |
| GND | Ground |
| SCL | I2C clock (10 kΩ pull-up on board) |
| SDA | I2C data (10 kΩ pull-up on board) |
| A0 | Address select: low/unconnected = 0x62, high = 0x63 |
| VOUT | Analog output, 0 V to VIN |

## Electrical limits
- Supply: 2.7–5.5 V; 210 µA typical, 400 µA max; 0.06 µA in power-down.
- Output: rail to rail, specified into ≥ 5 kΩ / 100 pF; settling about 6 µs.
- I2C: 100 kHz, 400 kHz and 3.4 MHz modes.
- EEPROM write: 25 ms typical, 50 ms max; about 1 million cycles.

## Interface details
- **I2C address 0x62** (A0 low) or 0x63 (A0 high) for the MCP4725A1 on the Adafruit board. Other chip variants: A0 = 0x60/0x61, A2 = 0x64/0x65.
- Fast write (2 bytes): `[0 0 PD1 PD0 D11 D10 D9 D8] [D7..D0]`.
- Write DAC register: `[0x40 | PD<<1] [D11..D4] [D3..D0 0000]`; 0x60 also writes the EEPROM.
- Read 5 bytes: `[RDY/BSY POR x x x PD1 PD0 x] [D11..D4] [D3..D0 xxxx] [x PD1 PD0 x D11..D8] [D7..D0]`.
- Power-down PD1 PD0: 00 normal, 01 = 1 kΩ, 10 = 100 kΩ, 11 = 500 kΩ to ground (output off).

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22, VOUT → an ADC pin (e.g. D34) or your circuit.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5, VOUT → GP26 (ADC0) to read it back.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from mcp4725 import MCP4725
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
dac = MCP4725(i2c, 0x62, vdd=3.3)
dac.write(2048)          # 12-bit code -> 1.65 V on a 3.3 V supply
dac.set_voltage(1.0)     # volts
print(dac.read())        # (dac_code, power_down, eeprom_code, ready)
```

## Gotchas
- Full scale is VIN, not a fixed reference: a noisy USB 5 V supply gives a noisy output.
- Only write the EEPROM (`write_eeprom`) when you want a new power-up value, never in a loop.
- The output can only source a few mA; buffer it with an op-amp for real loads.
- Two DACs on one bus: tie one board's A0 to VIN (0x63).

## Datasheet
https://ww1.microchip.com/downloads/en/DeviceDoc/22039d.pdf
