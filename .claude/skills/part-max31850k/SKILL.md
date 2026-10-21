---
name: part-max31850k
description: Pinout, electrical limits, wiring and MicroPython driver for the MAX31850K 1-Wire K-type thermocouple amplifier (Adafruit 1727 breakout). Use when designing, wiring, simulating or writing code for a MAX31850K in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MAX31850K 1-Wire thermocouple amplifier (MAX31850K)

## Overview
The **MAX31850K** (Maxim / Analog Devices) digitises a **K-type thermocouple** with built-in cold-junction compensation and reports it on a **1-Wire** bus (family code **3Bh**, unique 64-bit ROM per chip). Range −270 to +1372 °C in **0.25 °C** steps (14-bit); it also reports its own cold-junction temperature (0.0625 °C) and open/short faults. Hobbyists buy it on the **Adafruit 1-Wire Thermocouple Amplifier MAX31850K breakout (product 1727)**: 3.3 V regulator on board, 2-way screw terminal for the thermocouple, **no pull-up on DATA**.

## Pinout (Adafruit 1727, 8-pin header, left to right)
| Pin | Function |
|---|---|
| GND | Ground |
| VIN | Supply in, 3.3–5 V (on-board 3.3 V regulator) |
| 3V3 | 3.3 V regulator output (up to 100 mA); leave unconnected |
| A0 | Location bit AD0 (solder jumper to GND by default) |
| A1 | Location bit AD1 (GND by default) |
| A2 | Location bit AD2 (GND by default) |
| A3 | Location bit AD3 (GND by default) |
| DATA | 1-Wire DQ, open-drain, **3.3 V logic only**; needs 4.7 kΩ pull-up to 3.3 V |

Screw terminal on the opposite edge: **YELLOW+** (chromel) and **RED−** (alumel). Because of the two connector edges the board is wired with jumper leads.

## Electrical limits
- Chip VDD 3.0–3.7 V (abs. max 4.0 V); board VIN 3.3–5 V.
- Supply current 0.9 mA typ, 1.75 mA max while converting; ~0.3 µA standby.
- DATA high level must not exceed 3.7 V: never pull it up to 5 V.

## Interface details
- Convert T: reset, Skip ROM (CCh), **44h**; conversion takes **72 ms typ, 100 ms max**.
- Read Scratchpad: reset, Match ROM (55h) + ROM, **BEh**, read 9 bytes; byte 8 = Maxim CRC-8 (x⁸+x⁵+x⁴+1) of bytes 0–7.
- Bytes 0–1: thermocouple temperature, bits 15..2 = signed 14-bit × 0.25 °C; bit 1 reserved; **bit 0 = fault**.
- Bytes 2–3: cold-junction temperature, bits 15..4 = signed 12-bit × 0.0625 °C; bit 2 short to VDD, bit 1 short to GND, bit 0 open circuit.
- Byte 4: AD3..AD0 in bits 3..0 (bits 7..4 read 1). Bytes 5–7 read FFh.
- Open thermocouple: fault bit set and the temperature field reads all ones with sign 0.

## Wiring
- ESP32: VIN → 3V3, GND → GND, DATA → GPIO4, 4.7 kΩ DATA → 3V3.
- Pico: VIN → 3V3(OUT), GND → GND, DATA → GP22, 4.7 kΩ DATA → 3V3(OUT).
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, DATA → pin 7 (GPIO4, w1-gpio overlay), 4.7 kΩ to 3.3 V.
- Several boards can share one DATA line; one pull-up for the whole bus. Set A0–A3 differently to tell them apart.

## Using the driver
```python
import machine, onewire
from max31850 import MAX31850
tc = MAX31850(onewire.OneWire(machine.Pin(4)))
roms = tc.scan()            # ROMs starting with 0x3B
tc.convert()                # 44h, waits 100 ms
print('TC=%.2fC' % tc.read_temp(roms[0]))
tc_c, cj_c, faults, addr = tc.read_detail(roms[0])   # full scratchpad
```
`read_temp()` raises `MAX31850Fault` when the chip flags an open or shorted thermocouple.

## Gotchas
- `ds18x20.DS18X20.scan()` filters out family 3Bh; use `OneWire.scan()` (the driver does).
- K-type only: other thermocouple types read wrong. Polarity reversed = temperature moves the wrong way.
- Grounded probe tips or a lead touching a grounded case give a "short to GND" fault.
- Thermocouple wire can't be soldered: use the screw terminal; extend only with K-type extension wire.
- Parasite power (no VIN) needs a strong pull-up for 100 ms during each conversion; power it from VIN instead.

## Datasheet
https://www.analog.com/media/en/technical-documentation/data-sheets/MAX31850-MAX31851.pdf
