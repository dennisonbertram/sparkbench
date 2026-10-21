---
name: part-mpr121
description: Pinout, electrical limits, wiring and MicroPython driver for the MPR121 12-key capacitive touch sensor (NXP MPR121, Adafruit breakout 1982). Use when designing, wiring, simulating or writing code for an MPR121 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MPR121 12-key capacitive touch sensor (MPR121)

## Overview
The **MPR121** from NXP (formerly Freescale) turns 12 electrodes (foil, copper tape, wire, fruit...) into touch buttons. It does all the filtering, baseline tracking and threshold comparison itself and reports which electrodes are touched in two status registers over I2C. Hobbyists buy it on the **Adafruit 12-Key Capacitive Touch Sensor Breakout - MPR121 - STEMMA QT (product 1982)**, which adds a 3.3 V regulator, I2C level shifting and pull-ups so it works from 3-5 V boards.

## Pinout (Adafruit 1982, 2021+ STEMMA QT revision)
Power/I2C header:

| Pin | Function |
|---|---|
| VIN | Supply 3-5 V; also the I2C logic level |
| 3Vo | 3.3 V regulator output (leave unconnected) |
| GND | Ground |
| SCL | I2C clock (level-shifted, 10k pull-up) |
| SDA | I2C data (level-shifted, 10k pull-up) |
| INT | Interrupt, active low (IRQ on pre-2021 boards) |
| ADDR | Address select, 10k pull-down |

Electrode header (silkscreen 11 ... 0, GND): ELE11, ELE10, ... ELE0, GND. Two STEMMA QT / Qwiic connectors carry the same GND, VIN, SDA, SCL.

Older (pre-2021) boards order the power header VIN, 3Vo, GND, ADDR, SDA, SCL, IRQ: check your silkscreen.

## Electrical limits
- Chip: 1.71-3.6 V (absolute max 3.6 V); the breakout takes 3-5 V on VIN.
- Current: about 0.4 mA at the 1 ms sample period this driver uses, 3 uA in Stop Mode, plus the INT LED when lit.
- I2C up to 400 kHz.

## Interface details
- **I2C address 0x5A** (ADDR open/GND), 0x5B (ADDR to 3Vo), 0x5C (ADDR to SDA), 0x5D (ADDR to SCL).
- Touch status: read 2 bytes from **0x00**; bits 0-11 = ELE0-ELE11 (1 = touched), bit 12 proximity, bit 15 OVCF (over-current, chip stopped).
- Filtered data: 10-bit, LSB/MSB at 0x04 + 2n. Baseline: upper 8 bits at 0x1E + n (shift left 2).
- Touch when baseline - data > touch threshold (0x41 + 2n); release when below release threshold (0x42 + 2n).
- Setup: write 0x63 to 0x80 (soft reset), ECR 0x5E = 0 (Stop Mode), check 0x5D reads 0x24, write thresholds/filters, then ECR = 0x8C (baseline tracking, all 12 electrodes). Configuration registers can only be written in Stop Mode.

## Wiring
- ESP32: VIN -> 3V3, GND -> GND, SDA -> D21, SCL -> D22.
- Pico: VIN -> 3V3(OUT), GND -> GND, SDA -> GP4, SCL -> GP5.
- Raspberry Pi 4: VIN -> pin 1 (3.3 V), GND -> pin 6, SDA -> pin 3, SCL -> pin 5.
- Electrodes: a wire from each ELE pin to a pad. Unused electrodes can stay open.

## Using the driver
```python
from machine import I2C, Pin
from mpr121 import MPR121
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
mpr = MPR121(i2c)
t = mpr.touched()
print([i for i in range(12) if t & (1 << i)])
```

## Gotchas
- Power the board from 3.3 V on an ESP32 or Pico: SDA/SCL are pulled up to VIN.
- Don't touch the pads for about a second after power-up or reset: the baseline is captured when Run Mode starts.
- Pads trigger by themselves? Raise the thresholds (`MPR121(i2c, touch=20, release=10)`) and shorten or separate the electrode wires.
- `OSError: MPR121 not found` means no answer or register 0x5D was not 0x24: check wiring and the ADDR pin.

## Datasheet
https://www.nxp.com/docs/en/data-sheet/MPR121.pdf
