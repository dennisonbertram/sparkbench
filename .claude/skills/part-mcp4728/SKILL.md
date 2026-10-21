---
name: part-mcp4728
description: Pinout, electrical limits, wiring and MicroPython driver for the MCP4728 quad 12-bit I2C DAC with EEPROM (Microchip MCP4728, Adafruit 4470 breakout). Use when designing, wiring, simulating or writing code for an MCP4728 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MCP4728 quad 12-bit I2C DAC (MCP4728)

## Overview
The **MCP4728** from Microchip has four buffered 12-bit voltage outputs, each with its own reference choice (VDD or an internal 2.048 V), gain (x1/x2, internal reference only) and power-down mode, plus EEPROM that restores the settings at power-up. Hobbyists buy it on the **Adafruit MCP4728 Quad DAC with EEPROM - STEMMA QT / Qwiic (product 4470)**, which has 4.7 kΩ I2C pull-ups to VCC and a 4.7 kΩ pull-down on LDAC.

## Pinout (Adafruit 4470, header by header)
Header 1 (I2C edge):
| Pin | Function |
|---|---|
| VCC | Supply, 3–5 V (also the I2C pull-up voltage) |
| GND | Ground |
| SCL | I2C clock |
| SDA | I2C data |
| LDAC | Active-low latch input, pulled low on the board (optional) |
| RDY | RDY/BSY open-drain output, low during EEPROM writes (optional) |

Header 2 (output edge):
| Pin | Function |
|---|---|
| GND | Ground (labelled GND_2 in Sparkbench) |
| VA | Channel A output |
| VB | Channel B output |
| VC | Channel C output |
| VD | Channel D output |
| VCC | VCC again (labelled VCC_2 in Sparkbench) |

## Electrical limits
- Chip supply 2.7–5.5 V; the board is marked 3–5 VDC. About 0.8 mA typical, 1.4 mA max.
- Outputs swing 0 V to VDD; recommended load ≥ 5 kΩ, ≤ 1000 pF.
- I2C up to 400 kHz (3.4 MHz HS mode at 4.5–5.5 V).

## Interface details
- **I2C address 0x60** (address bits A2–A0 = 000 from the factory, stored in EEPROM).
- Multi-Write (no EEPROM): `0x40 | ch<<1 | UDAC`, then `VREF PD1 PD0 Gx D11–D8`, then `D7–D0`. With UDAC = 0 (or LDAC low) the output updates at the last ACK.
- Fast Write: for A, B, C, D in turn `0 0 PD1 PD0 D11–D8`, `D7–D0` (keeps each channel's VREF and gain).
- Single Write with EEPROM: `0x58 | ch<<1 | UDAC` + 2 data bytes; RDY/BSY stays low until the EEPROM write ends.
- Select VREF `0x80 | A B C D`, select gain `0xC0 | A B C D`, power-down `0xA0 | PDA PDB` then `PDC PDD 0000`.
- VOUT = VDD × code / 4096 (VREF = VDD, gain ignored) or 2.048 V × gain × code / 4096 (internal VREF), never above VDD.
- A read returns 24 bytes: for each channel 3 bytes of input register (RDY/BSY, POR, channel, address bits; VREF PD1 PD0 Gx D11–D8; D7–D0) then 3 bytes of EEPROM.

## Wiring
- ESP32: VCC → 3V3, GND → GND, SDA → D21, SCL → D22; VA/VB/VC to loads (or ADC pins to check them).
- Pico: VCC → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5; VA/VB/VC → GP26/GP27/GP28 to read them back.
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from mcp4728 import MCP4728, VREF_INTERNAL
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
dac = MCP4728(i2c, vdd=3.3)
dac.write(0, 2048)                    # A = 3.3 V * 2048/4096 = 1.65 V
dac.write(1, 2000, VREF_INTERNAL, 1)  # B = 2.048 V * 2000/4096 = 1.00 V
dac.set_voltage(2, 2.5, VREF_INTERNAL, 2)  # C = 2.50 V from the internal reference x2
```

## Gotchas
- The board's I2C pull-ups go to VCC: power it from 3.3 V when using a 3.3 V microcontroller.
- Factory default is the internal 2.048 V reference on every channel; a bare Fast Write uses whatever reference is set, so set VREF explicitly (the driver's `write()` always does).
- Gain x2 only applies with the internal reference; with VREF = VDD the full scale is VDD.
- EEPROM writes (`save()`) take up to 50 ms and wear out; the chip ignores commands until RDY goes high.
- Changing the I2C address needs LDAC toggled at an exact bit time; leave it at 0x60 unless you really need two boards.

## Datasheet
https://ww1.microchip.com/downloads/en/DeviceDoc/22187E.pdf
