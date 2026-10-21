---
name: part-opt3001
description: Pinout, electrical limits, wiring and MicroPython driver for the OPT3001 ambient light sensor (Texas Instruments OPT3001). Use when designing, wiring, simulating or writing code for an OPT3001 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# OPT3001 ambient light sensor (OPT3001)

## Overview
The **OPT3001** from Texas Instruments measures visible light the way the human eye sees it (peak 550 nm, strong IR rejection), from 0.01 lux to 83865.6 lux, and talks I2C. It ranges automatically: each 16-bit result holds a 4-bit exponent and a 12-bit mantissa. Hobbyists buy it on the purple **CJMCU-3001 OPT3001 module**, which has no regulator, so it is a 3.3 V-only board.

## Pinout (CJMCU-3001, header order)
| Pin | Function |
|---|---|
| VCC | Supply, 1.6–3.6 V (use 3.3 V) |
| GND | Ground |
| SCL | I2C clock (5.5 V tolerant) |
| SDA | I2C data, open-drain (5.5 V tolerant) |
| INT | Interrupt output, open-drain, active low by default (optional) |
| ADD | Address select (chip ADDR): GND = 0x44 (board default), VCC = 0x45, SDA = 0x46, SCL = 0x47 (optional) |

## Electrical limits
- Supply: 1.6–3.6 V (absolute maximum 6 V). Do not feed VCC from 5 V.
- SDA, SCL, ADDR inputs: up to 5.5 V. I2C pull-ups 1.6–5.5 V.
- Current: 1.8 µA typical active (3.7 µA at full-scale light), 0.3 µA shut down.
- Conversion time: 800 ms (720–880 ms) or 100 ms (90–110 ms).

## Interface details
- **I2C address 0x44** (ADDR to GND). 16-bit registers, MSB first; write the register pointer, then read 2 bytes.
- 0x00 result, 0x01 configuration (power-up 0xC810), 0x02 low limit (0xC000), 0x03 high limit (0xBFFF), 0x7E manufacturer ID = 0x5449 ("TI"), 0x7F device ID = 0x3001.
- **lux = 0.01 × 2^E × R**, where E = result bits 15–12 and R = bits 11–0 (e.g. 0x3456 → 0.08 × 0x456 = 88.80 lux).
- Configuration: RN[15:12] range (0–11 manual, full scale 40.95 × 2^RN lux; 12 = auto), CT[11] (1 = 800 ms), M[10:9] (00 shutdown, 01 single-shot, 10/11 continuous), OVF[8], CRF[7] conversion ready, FH[6], FL[5], L[4], POL[3], ME[2], FC[1:0].
- The chip powers up **shut down**. Write e.g. 0xCE10 (auto range, 800 ms, continuous) and wait one conversion before the first read.
- Reading the configuration register clears CRF.

## Wiring
- ESP32: VCC → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VCC → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from opt3001 import OPT3001
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
sensor = OPT3001(i2c)          # auto range, 800 ms, continuous; waits for the first result
print('Lux=%.2f' % sensor.lux())
```
`OPT3001(i2c, range_number=8)` fixes the range at 10483.2 lux (2.56 lux per count); `continuous=False` plus `single_shot()` takes one reading and shuts down again.

## Gotchas
- Mind the header order: SCL comes before SDA on the CJMCU-3001.
- A result of 0 right after power-up means the chip is still shut down or the first conversion has not finished.
- Cover glass or a dark window cuts the reading; calibrate against a lux meter if you put it behind one.
- In the Sparkbench simulator the chip answers with a fixed 10483.2 lux full-scale range (exponent 8); the real chip in auto range gives finer steps in dim light.

## Datasheet
https://www.ti.com/lit/ds/symlink/opt3001.pdf
