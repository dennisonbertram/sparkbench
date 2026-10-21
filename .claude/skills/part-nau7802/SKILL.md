---
name: part-nau7802
description: Pinout, electrical limits, wiring and MicroPython driver for the NAU7802 24-bit dual-channel load cell ADC (Nuvoton NAU7802, SparkFun Qwiic Scale SEN-15242). Use when designing, wiring, simulating or writing code for an NAU7802 / Qwiic Scale in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build, e.g. a kitchen or bathroom scale.
---

# NAU7802 24-bit load cell ADC (SparkFun Qwiic Scale)

## Overview
The **Nuvoton NAU7802** is a 24-bit sigma-delta ADC with a PGA (gain 1–128), an on-chip LDO that powers the load cell
bridge (2.4–4.5 V), internal oscillator, offset/gain calibration and an I2C interface. It does the same job as the HX711
but over real I2C, so it can share the bus with other sensors. Hobbyists buy it as the **SparkFun Qwiic Scale - NAU7802
(SEN-15242)**: two Qwiic connectors, 2.2 kΩ I2C pull-ups, a power LED, a 4-way spring terminal for the load cell and a
330 pF filter capacitor across channel 2.

## Pinout (SparkFun Qwiic Scale, header by header)
I2C edge (as printed, top to bottom):
| Pin | Function |
|---|---|
| GND | Ground |
| 3V3 | Supply, 2.7–5.5 V (3.3 V when the Qwiic bus is used — the pull-ups go to this pin) |
| SDA | I2C data (2.2 kΩ pull-up on board) |
| SCL | I2C clock (2.2 kΩ pull-up on board) |
| INT | DRDY output: conversion ready (push-pull, high-active by default, CRP bit flips it) — optional |
| AVDD | LDO output / reference (AVDD), for reference only, not a supply — optional |

Load cell edge (PTH holes, as printed on the back; the spring terminal carries RED/BLK/WHT/GRN too):
| Pin | Function |
|---|---|
| RED/E+ | Bridge excitation + (AVDD) — load cell red wire |
| BLK/E- | Bridge excitation − (GND) — black wire |
| WHT/A- | Channel 1 negative input (VIN1N) — white wire |
| GRN/A+ | Channel 1 positive input (VIN1P) — green (or blue) wire |
| YLW/SD | Shield (GND) — yellow wire / foil, optional |
| B- | Channel 2 negative input (VIN2N), optional |
| B+ | Channel 2 positive input (VIN2P), optional |

## Electrical limits
- DVDD 2.7–5.5 V; about 2.1 mA (internal oscillator + LDO) plus the load cell's excitation current (≈3 mA for a 1 kΩ bridge at 3 V).
- The LDO (VLDO 2.4–4.5 V) must be at least **0.3 V below the supply**: use 3.0 V on a 3.3 V board (the driver default).
- Full-scale input: ±0.5 × VREF / gain. VREF = AVDD on this board, so at 3.0 V and gain 128: ±11.7 mV, 1 count ≈ 1.40 nV.
- PGA common-mode range at gain 64/128: AVSS + 1.5 V to AVDD − 1.5 V (a load cell bridge sits at AVDD/2: fine).

## Interface details
- **I2C address 0x2A** (fixed), standard/fast mode.
- Power-on (datasheet 9.1): write PU_CTRL (0x00) = RR (0x01), then PUD (0x02); wait for **PUR** (bit 3) to read 1 (≈200 µs).
  Then set CTRL1 (0x01) = VLDO<<3 | GAINS, PU_CTRL = AVDDS|PUA|PUD (0x86), R0x15 = 0x30, CTRL2 rate, then **CS** (bit 4) to start conversions.
- Calibration: write CALS (CTRL2 bit 2) = 1; it reads 1 until done; then check **CAL_ERR** (bit 3). Redo after gain/rate/channel changes.
- Data: poll **CR** (PU_CTRL bit 5) or the INT pin, then burst-read 3 bytes from 0x12: signed 24-bit, MSB first.
  Voltage = raw × VREF / (gain × 2^24). Rates 10/20/40/80/320 SPS (CTRL2 CRS).
- After reset or power-up, wait six conversions before trusting the data.

## Wiring
- ESP32: 3V3 → 3V3, GND → GND, SDA → D21, SCL → D22 (or a Qwiic cable).
- Pico: 3V3 → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: 3V3 → pin 1, GND → pin 6, SDA → pin 3, SCL → pin 5.
- Load cell: red → RED/E+, black → BLK/E-, white → WHT/A-, green → GRN/A+ (spring terminal or PTH holes).

## Using the driver
```python
from machine import I2C, Pin
from nau7802 import NAU7802
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
adc = NAU7802(i2c)          # gain 128, LDO 3.0 V, 10 SPS, internal offset calibration
raw = adc.read_raw()        # signed 24-bit counts
print(adc.to_microvolts(raw))
adc.tare()                  # empty scale = zero
adc.calibrate_scale(500)    # with a 500 g weight on it
print(adc.weight(4))        # grams
```

## Simulation
The slider is the bridge output **A+ − A−** in mV; the chip returns raw = V × 128 × 2^24 / 3.0 V (the driver's
gain 128 / LDO 3.0 V setting). The toggle "Chip busy" holds PUR/CR at 0 and CALS at 1 (as a chip that is still
powering up, converting or calibrating), so you can see the driver's timeouts.

## Gotchas
- Readings drift for a few seconds after power-up and with temperature: tare after warm-up and recalibrate after changing gain or rate.
- A reading stuck near ±8388607 means the input is over range: check the load cell wire colours (swap A+/A- if the weight reads negative).
- Don't set the LDO above supply − 0.3 V (the SparkFun Arduino library's 3.3 V default on a 3.3 V supply leaves no headroom).
- Do not power other things from AVDD; it is the bridge excitation/reference.
- More than 3.3 V on 3V3 also lifts the Qwiic bus pull-ups above 3.3 V: keep 3.3 V with an ESP32/Pico.

## Datasheet
https://cdn.sparkfun.com/assets/learn_tutorials/8/8/0/NAU7802_Data_Sheet_V1.7.pdf
