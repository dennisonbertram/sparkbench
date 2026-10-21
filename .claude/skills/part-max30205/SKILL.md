---
name: part-max30205
description: Pinout, electrical limits, wiring and MicroPython driver for the MAX30205 human body temperature sensor (MAX30205). Use when designing, wiring, simulating or writing code for a MAX30205 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MAX30205 body temperature sensor (MAX30205)

## Overview
The **MAX30205** from Maxim (now Analog Devices) is a clinical-grade digital thermometer: 16-bit, 0.00390625 °C per LSB, ±0.1 °C from 37 to 39 °C, specified for 0 to 50 °C. It talks I2C and has an open-drain overtemperature output (OS). Hobbyists buy it on the **ProtoCentral MAX30205 Body Temperature Sensor Breakout Board**, which adds an AP2112K 3.3 V regulator, BSS138 level shifters with 10 kΩ pull-ups to VIN, and solder jumpers for A0–A2.

## Pinout (ProtoCentral breakout, header order)
| Pin | Function |
|---|---|
| SDA | I2C data (level-shifted, pulled up to VIN) |
| SCL | I2C clock (level-shifted, pulled up to VIN) |
| OS | Overtemperature output, open-drain, active low by default (optional) |
| 3V3 | 3.3 V regulator output; leave unconnected |
| GND | Ground |
| VIN | Supply 3.0–5.5 V into the regulator |

## Electrical limits
- Chip: 2.7–3.3 V (absolute max 4 V on VDD, SDA, SCL); the board's regulator lets VIN be 3.0–5.5 V.
- Current: about 600 µA converting, ≤ 3.5 µA in shutdown.
- The header pull-ups go to VIN (the board's VCC jumper defaults to VIN), so on a 3.3 V board power VIN from 3.3 V.
- Accuracy is only specified from 0 to 50 °C.

## Interface details
- **I2C address 0x48** (8-bit 90h) with A0, A1, A2 at GND (board default). Moving A0/A1/A2 to VDD adds 1/2/4 (0x49–0x4F); A0/A1 can also go to SDA/SCL for 32 addresses (datasheet Table 1).
- Registers (pointer byte, then 2 data bytes MSB first): 0x00 temperature (read-only), 0x01 configuration (1 byte), 0x02 THYST (POR 75 °C), 0x03 TOS (POR 80 °C).
- Temperature: 16-bit two's complement, T = raw × 0.00390625 °C (normal format, config bit D5 = 0). In extended format (D5 = 1) add 64 °C.
- Continuous conversion by default, 44 ms typical / 50 ms max per conversion; first result ready 50 ms after power-up.
- Config bits: D0 shutdown, D1 comparator/interrupt, D2 OS polarity, D4:D3 fault queue, D5 data format, D6 timeout disable, D7 one-shot (only works in shutdown).
- Bus timeout: holding SDA low for ~50 ms resets the interface (enabled by default).

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from max30205 import MAX30205
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
sensor = MAX30205(i2c)          # 0x48
print('T=%.2fC' % sensor.temperature())
sensor.set_alarm(38.0, 37.5)    # OS low above 38 °C, released below 37.5 °C
```
`one_shot()` puts the chip in shutdown and takes single low-power readings.

## Gotchas
- 5 V on VIN means 5 V pull-ups on SDA/SCL: never with an ESP32 or Pico.
- It measures its own die: press the sensor face firmly against the skin and let it settle for a few minutes; air readings are well below body temperature.
- Reading the config register as 2 bytes returns the same byte twice.
- Do not leave A0–A2 floating if you cut the address jumpers.

## Datasheet
https://www.analog.com/media/en/technical-documentation/data-sheets/MAX30205.pdf
