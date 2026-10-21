---
name: part-ads7830
description: Pinout, electrical limits, wiring and MicroPython driver for the ADS7830 8-channel 8-bit I2C ADC (Texas Instruments ADS7830). Use when designing, wiring, simulating or writing code for an ADS7830 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# ADS7830 8-channel 8-bit I2C ADC (ADS7830)

## Overview
The **ADS7830** from Texas Instruments is an 8-bit SAR analog-to-digital converter with 8 single-ended inputs (or 4 differential pairs) and an I2C interface (up to 70 kSPS in 3.4 MHz HS mode). Hobbyists buy it on the **Adafruit ADS7830 8-Channel 8-Bit ADC with I2C (#5836)**. On that board REF is tied to VIN, COM to GND, there are 10 kΩ pull-ups on SDA/SCL (to VIN), and AD0/AD1 have 10 kΩ pull-downs.

## Pinout (Adafruit #5836, header by header as printed)
Bottom header, left to right:
| Pin | Function |
|---|---|
| VIN | Supply 3–5 V, also the ADC reference |
| GND | Ground |
| SCL | I2C clock |
| SDA | I2C data |
| REF | Reference (tied to VIN by the Ext Ref jumper), leave open |
| COM | Common negative input (tied to GND by the Ext Com jumper), leave open |
| AD0 | Address bit 0 (pulled low) |
| AD1 | Address bit 1 (pulled low) |

Top header, left to right: **A7 A6 A5 A4 A3 A2 A1 A0** (analog inputs).

The board has 16 pins, so wire it with jumper leads.

## Electrical limits
- Supply: 2.7–3.6 V or 4.75–5.25 V (chip specified ranges; absolute max 6 V). The board is sold for 3–5 V.
- Inputs: 0 V to VREF full scale; absolute range −0.2 V to VIN + 0.2 V.
- Current: about 0.1–0.3 mA (400 kHz I2C), plus the power LED.

## Interface details
- **I2C address 0x48** (1001 0 A1 A0): AD0 high gives 0x49, AD1 high gives 0x4A, both give 0x4B.
- Write one **command byte**: `SD C2 C1 C0 PD1 PD0 x x`, then read **one byte** (straight binary).
- Single-ended (SD = 1) channel bits C2..C0: CH0=000, CH1=100, CH2=001, CH3=101, CH4=010, CH5=110, CH6=011, CH7=111.
- PD1 PD0: 00 = power down between conversions, 01 = internal ref OFF / ADC ON, 10 = ref ON / ADC OFF, 11 = ref ON / ADC ON.
- On the Adafruit board REF = VIN, so use **PD1 = 0** (e.g. 0x84 = CH0, 0xC4 = CH1, 0x94 = CH2 …).
- Volts = code × VREF / 256 (12.9 mV per step at 3.3 V; 9.8 mV with the internal 2.5 V reference).

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from ads7830 import ADS7830
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
adc = ADS7830(i2c, vref=3.3)   # vref = the voltage on VIN
print(adc.read_raw(0), adc.read_voltage(0))
```

## Gotchas
- Power VIN from 3.3 V when you use a 3.3 V board: the SDA/SCL pull-ups go to VIN.
- The reading is relative to VIN, so a noisy supply makes the readings noisy.
- Do not turn on the internal reference (PD1 = 1) while REF is tied to VIN. Cut the Ext Ref jumper first.
- The channel bits are not in binary order. Use the table above.

## Datasheet
https://www.ti.com/lit/ds/symlink/ads7830.pdf
