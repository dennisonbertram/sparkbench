---
name: part-aht30
description: Pinout, electrical limits, wiring and MicroPython driver for the AHT30 temperature & humidity sensor (Aosong/ASAIR AHT30, purple 4-pin VIN/GND/SCL/SDA module). Use when designing, wiring, simulating or writing code for an AHT30 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# AHT30 temperature & humidity sensor (AHT30)

## Overview
The **AHT30** from Aosong (ASAIR) measures temperature and relative humidity (0–100 %) and talks I2C at a fixed address, 0x38. It replaces the AHT20/AHT21: it uses the same measure command and data format, but it needs no calibration or initialisation command. Hobbyists buy it as the **purple AHT30 module**, a GY-style board with a four-pin 2.54 mm header. The board carries a 3.3 V regulator (662K), 4.7 kΩ pull-ups (a 472 resistor array) and a two-MOSFET I2C level shifter. Typical accuracy is ±2–3 %RH and ±0.3–0.5 °C.

## Pinout (purple AHT30 module, as printed)
| Pin | Function |
|---|---|
| VIN | Supply to the on-board 3.3 V regulator (use your board's 3.3 V) |
| GND | Ground |
| SCL | I2C clock (4.7 kΩ pull-up on the module) |
| SDA | I2C data (4.7 kΩ pull-up on the module) |

## Electrical limits
- Chip supply: 2.2–5.5 V (absolute max 5.5 V). SDA and SCL must stay between −0.3 V and VDD + 0.3 V.
- Module: VIN 2.5–5.5 V (the chip's 2.2 V minimum plus the regulator's dropout).
- Current: about 570 µA while measuring, under 0.2 µA asleep.
- I2C: 10–400 kHz is recommended.
- The host-side pull-ups go to VIN, so power VIN at your microcontroller's logic voltage: 3.3 V on ESP32/Pico.

## Interface details
- **I2C address 0x38** (fixed).
- After power-on, wait at least 5 ms.
- Measure: write **0xAC 0x33 0x00** and wait 80 ms. Then read 7 bytes: status, 20 bits of humidity, 20 bits of temperature, and a CRC.
- If status bit 7 (busy) is 1, the data is from the previous measurement, so read again. Bit 3 means calibration is on, and bit 4 means the OTP CRC is OK. A normal status is 0x18.
- CRC-8 over the first 6 bytes: polynomial 0x31 (1+x⁴+x⁵+x⁸), initial value 0xFF.
- RH = S_RH / 2²⁰ × 100 %. T = S_T / 2²⁰ × 200 − 50 °C. Example: S_T = 0x2FFAB gives −12.5 °C.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SCL → D22, SDA → D21.
- Pico: VIN → 3V3(OUT), GND → GND, SCL → GP5, SDA → GP4.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SCL → pin 5, SDA → pin 3.
- You do not need extra pull-up resistors.

## Using the driver
```python
from machine import I2C, Pin
from aht30 import AHT30
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
t, h = AHT30(i2c).read()
print('T=%.1fC H=%.0f%%' % (t, h))
```

## Gotchas
- If VIN gets 5 V, the level shifter pulls SDA/SCL up to 5 V, which is too much for an ESP32 or Pico. Use 3.3 V.
- A CRC mismatch nearly always means a loose SDA/SCL wire.
- Measure no more than once a second, or the sensor warms itself. Keep it away from the regulator and the microcontroller.
- Only one AHT30 can sit on a bus (fixed address 0x38). The same goes for AHT10/AHT20/AHT21, which use the same address.
- Readings can run low for a while after soldering. Bake the sensor at 60 °C if it reads high after exposure to damp, or rehydrate it at 75 %RH if it reads low.

## Datasheet
https://raw.githubusercontent.com/libdriver/aht30/main/datasheet/aht30_datasheet.pdf (Aosong AHT30, Sept 2023, Chinese)
