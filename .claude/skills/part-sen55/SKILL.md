---
name: part-sen55
description: Pinout, electrical limits, wiring and MicroPython driver for the Sensirion SEN55 environmental sensor node (PM1.0–PM10, RH, T, VOC Index, NOx Index; SEN55-SDN-T) over I2C. Use when designing, wiring, simulating or writing code for a SEN55 (or SEN54/SEN5x) in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# SEN55 environmental sensor node (SEN55-SDN-T)

## Overview
The **Sensirion SEN55** combines a laser-scattering particulate matter sensor with a fan (PM1.0, PM2.5, PM4.0, PM10, 0–1000 µg/m³), an SHT-type humidity/temperature sensor and an SGP41-type gas sensor that outputs a **VOC Index** and a **NOx Index** (1–500). It updates once per second and talks **I2C only** (address 0x69). Hobbyists buy the bare module **SEN55-SDN-T** with a **6-wire JST GHR-06V cable** to reach a breadboard. The sensor has no pull-up resistors.

## Pinout (ACES 51451-0060N-001 connector, pin 1 to pin 6)
| Pin | Function |
|---|---|
| VDD | Supply, 5 V ± 10 % (4.5–5.5 V) |
| GND | Ground (also the metal shield) |
| SDA | I2C data, open-drain, 3.3 V LVTTL compatible |
| SCL | I2C clock, open-drain, 3.3 V LVTTL compatible |
| SEL | Interface select: connect to GND |
| NC  | Do not connect |

## Electrical limits
- Supply 4.5–5.5 V (absolute max 5.5 V). Current: 70 mA typ / 100 mA max in the first 60 s of measurement, 63 mA typ after; peaks 110 mA; 6.8 mA in RHT/gas-only mode; 2.6–3.8 mA idle.
- I/O: VIH ≥ 2.31 V, VIL ≤ 0.99 V, pins and SEL tolerate up to 5.5 V; 16 mA max per I/O pin.
- Start-up: wait 50 ms after power-on before the first I2C transfer.
- I2C standard mode only (100 kHz), no clock stretching; keep wires under 10 cm or shielded.

## Interface details
- **I2C address 0x69.** Commands are 16-bit pointers sent MSB first with no CRC; every 2 data bytes written or read are followed by a CRC-8 (poly 0x31, init 0xFF; CRC(0xBEEF) = 0x92).
- Start measurement `00 21` (< 50 ms); RHT/gas-only mode `00 37`; stop `01 04` (< 200 ms).
- Data-ready: write `02 02`, wait 20 ms, read `00 flag CRC` (flag 1 = new data, each second).
- Read measured values: write `03 C4`, **wait 20 ms**, read 24 bytes = 8 words, each `MSB LSB CRC`:
  PM1.0, PM2.5, PM4.0, PM10 (uint16 ÷ 10, µg/m³), RH (int16 ÷ 100, %), T (int16 ÷ 200, °C), VOC Index (int16 ÷ 10), NOx Index (int16 ÷ 10).
  An unknown value reads 0xFFFF (the driver also treats 0x7FFF on signed fields as unknown) and is returned as `None`.
- Fan cleaning `56 07`, device status `D2 06`, reset `D3 04` (100 ms). Product name `D0 14`, serial `D0 33`.

## Wiring
- Pull-ups: 10 kΩ from SDA to 3.3 V and from SCL to 3.3 V (the sensor has none; never pull up to 5 V on a 3.3 V board).
- ESP32: VDD → 5V/VIN, GND → GND, SEL → GND, SDA → D21, SCL → D22, NC unconnected.
- Pico: VDD → VBUS, GND → GND, SEL → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VDD → pin 2 (5 V), GND → pin 6, SEL → pin 9 (GND), SDA → pin 3, SCL → pin 5 (the Pi has 1.8 kΩ pull-ups to 3.3 V).

## Using the driver
```python
from machine import I2C, Pin
from sen55 import SEN55
i2c = I2C(0, sda=Pin(21), scl=Pin(22), freq=100000)
s = SEN55(i2c)
s.start()
m = s.read()          # waits for the data-ready flag
print(m['pm2_5'], m['humidity'], m['temperature'], m['voc_index'], m['nox_index'])
```

## Gotchas
- SEL must be at GND when the sensor powers up, otherwise it will not answer at 0x69.
- NOx Index reads unknown (`None`) for about the first 10 s; the VOC/NOx indices take minutes to settle (VOC starts at 100, NOx at 1 = typical air). PM settles after ~30 s.
- Values are averaged/compensated for the module's self-heating; mount it away from warm parts.
- A CRC mismatch nearly always means missing pull-ups, long wires, or a bus faster than 100 kHz.
- Keep the metal shield floating: it is tied to GND internally.
- SEN54 has the same pinout and commands but returns NOx as unknown; SEN50 is PM only.

## Datasheet
https://sensirion.com/media/documents/6791EFA0/62A1F68F/Sensirion_Datasheet_Environmental_Node_SEN5x.pdf
