---
name: part-max6675
description: Pinout, electrical limits, wiring and MicroPython driver for the MAX6675 K-type thermocouple amplifier (MAX6675). Use when designing, wiring, simulating or writing code for a MAX6675 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MAX6675 K-type thermocouple amplifier (MAX6675)

## Overview
The **MAX6675** from Maxim (now Analog Devices) turns a K-type thermocouple voltage into a temperature, with cold-junction compensation built in. It reads **0 to +1023.75 °C in 0.25 °C steps** and flags an open (unplugged) probe. It only sends data, over a 3-wire SPI-style interface (SO, SCK, CS). Hobbyists buy it as the **MAX6675 K-type thermocouple module** (the common red clone breakout) with a screw terminal for the probe and a 5-pin header, usually bundled with a K-type probe.

## Pinout (MAX6675 module, header order)
| Pin | Function |
|---|---|
| GND | Ground |
| VCC | Supply, 3.0–5.5 V |
| SCK | Serial clock input (≤ 4.3 MHz) |
| CS | Chip select, active low |
| SO | Serial data out → board MISO |

The probe goes to the screw terminal (+ and −) on the other end of the board.

## Electrical limits
- Supply: 3.0–5.5 V; 0.7 mA typical, 1.5 mA max.
- SO swings to VCC, so power it from **3.3 V** for an ESP32 or Pico.
- Conversion time: 0.17 s typical, **0.22 s max**.
- Accuracy: ±9 LSB (±2.25 °C) from 0 to +700 °C at VCC = 5 V. The board itself (cold end) must stay between −20 and +85 °C.

## Interface details
- Pull CS low, clock 16 bits (SPI mode 0, MSB first), then pull CS high.
- CS low stops any conversion in progress; CS high starts a new one. Wait ≥ 220 ms between reads.
- Word layout: D15 = 0 (dummy sign bit), D14–D3 = 12-bit temperature, D2 = 1 if the thermocouple is open, D1 = 0 (device ID), D0 = three-state.
- Temperature = ((word >> 3) & 0xFFF) × 0.25 °C.

## Wiring
- ESP32: VCC → 3V3, GND → GND, SCK → D18, SO → D19, CS → D5.
- Pico: VCC → 3V3(OUT), GND → GND, SCK → GP18, SO → GP16, CS → GP17.
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, SCK → pin 23, SO → pin 21 (MISO), CS → pin 24 (CE0).

## Using the driver
```python
from machine import Pin, SPI
from max6675 import MAX6675
spi = SPI(1, baudrate=1000000, sck=Pin(18), miso=Pin(19))  # Pico: SPI(0, sck=Pin(18), miso=Pin(16))
tc = MAX6675(spi, 5)
print('T=%.2fC' % tc.read())
```
`read()` raises `OSError` if the probe is open (D2) or if SO is floating (D15/D1 read as 1).

## Gotchas
- Reading faster than every 0.22 s keeps restarting the conversion, so the value never updates.
- A probe connected backwards reads lower as it heats up: swap the leads.
- Only K-type probes work, and nothing below 0 °C is reported.
- The thermocouple's metal tip must not touch mains or anything live: the probe is wired straight to the chip.

## Datasheet
https://www.analog.com/media/en/technical-documentation/data-sheets/MAX6675.pdf
