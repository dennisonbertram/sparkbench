---
name: part-ccs811
description: Pinout, electrical limits, wiring and MicroPython driver for the CCS811 eCO2 / TVOC air quality sensor (ams CCS811, CJMCU-811 module). Use when designing, wiring, simulating or writing code for a CCS811 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# CCS811 air quality sensor (CCS811)

## Overview
The **ams CCS811** is a metal-oxide gas sensor with its own microcontroller. It reports **eCO2** (equivalent CO2, 400–8192 ppm) and **TVOC** (total volatile organic compounds, 0–1187 ppb), estimated from VOCs — it does not measure real CO2. It talks I2C. Hobbyists buy it on the purple **CJMCU-811** module, which has **no voltage regulator**: VCC goes straight to the chip, so power it from 3.3 V only.

## Pinout (CJMCU-811 module, header order)
| Pin | Function |
|---|---|
| VCC | Supply, 1.8–3.6 V (use 3.3 V; no regulator on the board, never 5 V) |
| GND | Ground |
| SCL | I2C clock |
| SDA | I2C data |
| WAK | nWAKE, active low: must be low for the chip to answer on I2C (tie to GND or drive low from a GPIO) |
| INT | nINT, active-low interrupt output (optional) |
| RST | nRESET, active-low reset input (optional) |
| ADD | Address select: 10 kΩ pull-down on the board, so unconnected/low = 0x5A, high = 0x5B |

## Electrical limits
- Supply: 1.8–3.6 V absolute (3.3 V typical). The CJMCU-811 has no regulator.
- Current: about 26 mA in mode 1 (46 mW at 1.8 V); about 0.7 mW average in mode 3.
- I2C 10–400 kHz; the chip uses clock stretching (use 100 kHz on hardware I2C).
- Power-on to ready: 20 ms.

## Interface details
- **I2C address 0x5A** (ADD low, default on the CJMCU-811), 0x5B (ADD high).
- Read HW_ID (0x20): must be **0x81**.
- STATUS (0x00): bit 7 FW_MODE, bit 4 APP_VALID, bit 3 DATA_READY, bit 0 ERROR (details in ERROR_ID 0xE0).
- At power-up the chip is in boot mode: write the single byte **0xF4** (APP_START) to start the application.
- MEAS_MODE (0x01): DRIVE_MODE in bits 6:4 — write **0x10** for mode 1 (a sample every second).
- ALG_RESULT_DATA (0x02), up to 8 bytes: eCO2 MSB, LSB (ppm), TVOC MSB, LSB (ppb), STATUS, ERROR_ID, RAW_DATA (2).
- ENV_DATA (0x05): humidity and temperature in 1/512 units (temperature offset +25 °C) for compensation.
- BASELINE (0x11): 2 bytes to save and restore the clean-air baseline (AN000370).

## Wiring
- ESP32: VCC → 3V3, GND → GND, SDA → D21, SCL → D22, WAK → a GPIO driven low (or GND).
- Pico: VCC → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5, WAK → a GPIO driven low (or GND).
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5, WAK → pin 9 (GND).

## Using the driver
```python
from machine import I2C, Pin
from ccs811 import CCS811
wak = Pin(4, Pin.OUT)
wak.value(0)
i2c = I2C(0, sda=Pin(21), scl=Pin(22), freq=100000)
sensor = CCS811(i2c, wake=wak)
if sensor.data_ready():
    eco2, tvoc = sensor.read()
    print('eCO2=%dppm TVOC=%dppb' % (eco2, tvoc))
```

## Gotchas
- WAK left floating or high: the chip sleeps and does not answer (OSError ENODEV / "HW_ID is not 0x81").
- Never feed the CJMCU-811 5 V: VCC is wired straight to the chip (3.6 V maximum).
- New sensors need a 48-hour burn-in, and 20 minutes of run-in after every power-up, before readings are meaningful; eCO2 sits at 400 ppm at first.
- eCO2 is estimated from VOCs; it is not a real CO2 measurement (use an SCD4x or MH-Z19 for that).
- Feed real humidity and temperature with set_environment() for better accuracy; the chip itself heats up.
- If your module has no SDA/SCL pull-ups, add 4.7–10 kΩ to 3.3 V.

## Datasheet
https://cdn.sparkfun.com/assets/learn_tutorials/1/4/3/CCS811_Datasheet-DS000459.pdf
