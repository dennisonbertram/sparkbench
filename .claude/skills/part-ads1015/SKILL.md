---
name: part-ads1015
description: Pinout, electrical limits, wiring and MicroPython driver for the ADS1015 12-bit 4-channel I2C ADC (Texas Instruments ADS1015). Use when designing, wiring, simulating or writing code for an ADS1015 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# ADS1015 12-bit 4-channel ADC (ADS1015)

## Overview
The **ADS1015** from Texas Instruments is a 12-bit delta-sigma ADC with four inputs (four single-ended or two differential), a programmable gain amplifier and up to 3300 samples/s. It talks I2C. Hobbyists buy it on the **Adafruit ADS1015 12-Bit ADC breakout (#1083, original 10-pin single-row version)**, which has 10 k pull-ups on SDA, SCL and ALRT, and a 10 k pull-down on ADDR.

## Pinout (Adafruit #1083 original 10-pin board, header order)
| Pin | Function |
|---|---|
| VDD | Supply and logic level, 2.0–5.5 V (3.3 V with ESP32/Pico) |
| GND | Ground |
| SCL | I2C clock (10 k pull-up to VDD) |
| SDA | I2C data (10 k pull-up to VDD) |
| ADDR | Address select: GND/open = 0x48, VDD = 0x49, SDA = 0x4A, SCL = 0x4B |
| ALRT | ALERT/RDY open-drain output (optional) |
| A0 | Analog input AIN0 |
| A1 | Analog input AIN1 |
| A2 | Analog input AIN2 |
| A3 | Analog input AIN3 |

The newer STEMMA QT version of #1083 has two 6-pin rows (VIN, GND, SCL, SDA, ADDR, ALRT / A+, A3, A2, A1, A0, A−) and is a different footprint.

## Electrical limits
- Supply: 2.0–5.5 V. Current about 150 µA converting, 0.5 µA in power-down.
- Analog inputs: GND to VDD; absolute max VDD + 0.3 V and 10 mA, **whatever full-scale range you select**.
- Digital pins (SDA, SCL, ADDR, ALRT): up to 5.5 V.
- I2C up to 3.4 MHz (fast and standard modes are fine).

## Interface details
- **I2C address 0x48** (ADDR low). Four registers via the pointer byte: 0x00 Conversion, 0x01 Config (reset 0x8583), 0x02 Lo_thresh, 0x03 Hi_thresh. All 16-bit, MSB first.
- Config bits: OS[15] (write 1 = start single shot; reads 1 when idle), MUX[14:12] (100–111 = AIN0–AIN3 vs GND; 000/001/010/011 = AIN0−AIN1, AIN0−AIN3, AIN1−AIN3, AIN2−AIN3), PGA[11:9] (000 ±6.144 V, 001 ±4.096 V, 010 ±2.048 V default, 011 ±1.024 V, 100 ±0.512 V, 101 ±0.256 V), MODE[8] (1 = single shot), DR[7:5] (100 = 1600 SPS), COMP_QUE[1:0] (11 = comparator off).
- Conversion time = 1 / DR. Poll OS until it reads 1, then read register 0x00.
- Result: 12-bit two's complement in bits 15:4 (bits 3:0 read 0). code = signed16 >> 4; volts = code × FSR / 2048 (LSB 2 mV at ±4.096 V, 1 mV at ±2.048 V).

## Wiring
- ESP32: VDD → 3V3, GND → GND, SDA → D21, SCL → D22, sensor output → A0.
- Pico: VDD → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5, sensor output → A0.
- Raspberry Pi 4: VDD → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from ads1015 import ADS1015
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
adc = ADS1015(i2c, fsr=4.096)          # ±4.096 V range, 2 mV per count
print('A0=%.3fV' % adc.read_voltage(0))
print(adc.read_differential(0, 1))      # AIN0 − AIN1
```

## Gotchas
- The ±6.144 V and ±4.096 V ranges do **not** let you measure above VDD: inputs over VDD + 0.3 V damage the chip. Use a divider for higher voltages.
- The ADS1015 is 12-bit: the code is the top 12 bits of the 16-bit register. Drivers written for the ADS1115 (16-bit, max 860 SPS) give values 16× too big and wait the wrong time.
- Power VDD from the microcontroller's 3.3 V: the board's I2C pull-ups go to VDD, so a 5 V VDD would pull SDA/SCL to 5 V.
- Simulator: the slider drives the Conversion register as the AIN0 single-ended voltage at ±4.096 V (2 mV/LSB); it does not follow MUX or PGA changes, so simulate with `fsr=4.096` and channel 0.

## Datasheet
https://www.ti.com/lit/ds/symlink/ads1015.pdf
