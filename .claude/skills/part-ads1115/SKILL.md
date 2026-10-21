---
name: part-ads1115
description: Pinout, electrical limits, wiring and MicroPython driver for the ADS1115 16-bit 4-channel I2C ADC (Texas Instruments ADS1115). Use when designing, wiring, simulating or writing code for an ADS1115 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# ADS1115 16-bit 4-channel ADC (ADS1115)

## Overview
The **ADS1115** from Texas Instruments is a 16-bit delta-sigma ADC with four inputs (4 single-ended or 2 differential), a programmable gain amplifier (full-scale ±0.256 V to ±6.144 V), 8–860 samples/s and an internal reference. It talks I2C. Hobbyists buy it on the **blue 10-pin ADS1115 module** (GY-ADS1115 / HW-526, a clone of the original Adafruit #1085), which has 10k pull-ups on SDA/SCL to VDD and a pull-down on ADDR.

## Pinout (blue 10-pin ADS1115 module, header order)
| Pin | Function |
|---|---|
| VDD | Supply, 2.0–5.5 V (use 3.3 V with an ESP32/Pico) |
| GND | Ground |
| SCL | I2C clock |
| SDA | I2C data |
| ADDR | Address select: GND/unconnected = 0x48, VDD = 0x49, SDA = 0x4A, SCL = 0x4B |
| ALRT | ALERT/RDY open-drain output (optional) |
| A0 | Analog input AIN0 |
| A1 | Analog input AIN1 |
| A2 | Analog input AIN2 |
| A3 | Analog input AIN3 |

## Electrical limits
- Supply: 2.0–5.5 V (absolute max 7 V).
- Analog inputs: GND to VDD; absolute max GND − 0.3 V to VDD + 0.3 V, **regardless of the gain setting**.
- Digital pins (SDA, SCL, ADDR, ALRT): up to 5.5 V.
- Current: about 150 µA converting (200 µA max), 0.5 µA powered down.
- I2C up to 400 kHz (3.4 MHz high-speed mode).

## Interface details
- **I2C address 0x48** (ADDR to GND), 0x49 (VDD), 0x4A (SDA), 0x4B (SCL).
- Four 16-bit registers selected by a pointer byte: 0x00 Conversion, 0x01 Config (reset 0x8583), 0x02 Lo_thresh, 0x03 Hi_thresh. Words are sent MSB first.
- Config bits: OS[15] (write 1 = start single conversion; reads 1 when idle), MUX[14:12] (100–111 = AIN0–AIN3 vs GND; 000/001/010/011 = AIN0-AIN1, AIN0-AIN3, AIN1-AIN3, AIN2-AIN3), PGA[11:9] (000 ±6.144, 001 ±4.096, 010 ±2.048, 011 ±1.024, 100 ±0.512, 101 ±0.256 V), MODE[8] (1 = single-shot), DR[7:5] (100 = 128 SPS), COMP_QUE[1:0] (11 = comparator off).
- Single-shot read: write Config with OS=1, wait 1/DR (7.8 ms at 128 SPS), poll until OS reads 1, read the Conversion register.
- Result is signed two's complement: **V = code × FSR / 32768** (LSB = 187.5, 125, 62.5, 31.25, 15.625, 7.8125 µV for the six ranges).

## Wiring
- ESP32: VDD → 3V3, GND → GND, SDA → D21, SCL → D22; signal to A0, signal ground to GND.
- Pico: VDD → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VDD → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from ads1115 import ADS1115
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
adc = ADS1115(i2c, fsr=4.096)          # 125 uV per count
print('A0 = %.4f V' % adc.read_voltage(0))
print('A0-A1 = %.4f V' % adc.read_diff_voltage(0, 1))
```

## Gotchas
- Choosing ±6.144 V does **not** let you measure above VDD: inputs over VDD + 0.3 V can damage the chip. Use a resistor divider for bigger voltages.
- With VDD = 3.3 V and ±4.096 V range, codes above 3.3 V (26400) are never reached; that is normal.
- Power the module from 3.3 V with 3.3 V boards: its I2C pull-ups go to VDD.
- Single-ended readings only use 0..32767; a few counts below zero near 0 V are normal offset.
- Floating (unconnected) inputs read random values.
- Simulator: the model answers on AIN0 at the ±4.096 V range (125 µV per count); it does not follow MUX/PGA changes, so other channels or gains read the same code in the simulator (not on the real chip).

## Datasheet
https://www.ti.com/lit/ds/symlink/ads1115.pdf
