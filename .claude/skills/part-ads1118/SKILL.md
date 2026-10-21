---
name: part-ads1118
description: Pinout, electrical limits, wiring and MicroPython driver for the ADS1118 16-bit SPI ADC with internal temperature sensor (Texas Instruments ADS1118, PMD Way / HW-420 breakout). Use when designing, wiring, simulating or writing code for an ADS1118 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# ADS1118 16-bit SPI ADC with temperature sensor (ADS1118)

## Overview
The **ADS1118** from Texas Instruments is a 16-bit delta-sigma ADC with four single-ended (or two differential) inputs, a programmable gain amplifier (±0.256 V to ±6.144 V full scale), 8–860 samples/s, an internal reference and a built-in temperature sensor (0.03125 °C per count). It talks SPI (mode 1). Hobbyists buy it on the **ADS1118 16-bit ADC Breakout Board** (PMD Way, red 17 × 16 mm board marked HW-420) with two 6-pin headers on opposite edges.

## Pinout (breakout, header by header as printed)
| Pin | Function |
|---|---|
| GND | Ground |
| VIN | Supply to VDD, 2–5.5 V (use 3.3 V with ESP32/Pico) |
| SCK | SPI clock (SCLK) |
| CS | Chip select, active low |
| OUT | DOUT/DRDY: data out, goes low when a result is ready |
| DIN | Data in (Config register) |
| GND (GND2) | Ground, same net |
| VIN (VIN2) | Supply, same net |
| A0–A3 | Analog inputs AIN0–AIN3 |

The two headers sit on opposite edges, so the board is wired with jumper leads.

## Electrical limits
- Supply 2–5.5 V; about 150 µA converting, 0.5 µA in power-down.
- Analog inputs GND−0.3 V to VDD+0.3 V, whatever the full-scale range. At 3.3 V, ±4.096 V range reads 0–3.3 V.
- SCLK up to 4 MHz. OUT swings to VIN, so power it from 3.3 V on 3.3 V boards.

## Interface details
- SPI mode 1 (CPOL 0, CPHA 1), MSB first.
- Every 16-bit transfer writes the Config word on DIN while the **previous** conversion result comes out on OUT.
- Config: SS | MUX[2:0] | PGA[2:0] | MODE | DR[2:0] | TS_MODE | PULL_UP_EN | NOP[1:0] = 01 | 1. NOP must be 01 or the write is ignored.
- Single-shot: send config with SS=1, wait 1/DR (+10 %), send the same config again and read the 16-bit result.
- AIN0 vs GND, ±4.096 V, 128 SPS: **0xC38B** (AIN1 0xD38B, AIN2 0xE38B, AIN3 0xF38B). Temperature mode: **0x859B**.
- ADC: signed 16-bit, V = code × FSR / 32768 (125 µV per count at ±4.096 V).
- Temperature: top 14 bits, signed, T = code14 × 0.03125 °C.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SCK → D18, OUT → D19, DIN → D23, CS → D5.
- Pico: VIN → 3V3(OUT), GND → GND, SCK → GP10, DIN → GP11, OUT → GP12, CS → GP13 (SPI1).
- Raspberry Pi 4: VIN → pin 1, GND → pin 6, SCK → pin 23, DIN → pin 19, OUT → pin 21, CS → pin 24.

## Using the driver
```python
from machine import Pin, SPI
from ads1118 import ADS1118
spi = SPI(1, baudrate=1000000, polarity=0, phase=1, sck=Pin(18), mosi=Pin(23), miso=Pin(19))
adc = ADS1118(spi, 5, fsr=4.096)
print(adc.read_volts(0), adc.temperature())
```

## Gotchas
- Wrong SPI mode (mode 0) gives shifted, nonsense readings.
- The first reading after changing channel is the old channel's result unless you wait and read again (the driver does this).
- Never feed the inputs more than VIN + 0.3 V or any negative voltage.
- The temperature sensor measures the chip, handy for thermocouple cold-junction compensation.

## Datasheet
https://www.ti.com/lit/ds/symlink/ads1118.pdf
