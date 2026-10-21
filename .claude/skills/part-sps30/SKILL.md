---
name: part-sps30
description: Pinout, electrical limits, wiring and MicroPython driver for the Sensirion SPS30 particulate matter sensor (SPS30) in I2C mode. Use when designing, wiring, simulating or writing code for an SPS30 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# SPS30 particulate matter sensor (SPS30)

## Overview
The **Sensirion SPS30** is a laser-scattering dust sensor with a built-in fan. Every second it reports mass concentration PM1.0, PM2.5, PM4.0 and PM10 (0–1000 µg/m³), number concentration PM0.5–PM10 (#/cm³) and the typical particle size (µm). It speaks UART or I2C; this part uses **I2C** (SEL tied to GND). Hobbyists buy the bare sensor with its **5-wire JST ZHR-5 cable** (e.g. SparkFun SEN-15103). The sensor has no pull-up resistors.

## Pinout (JST ZHR-5 connector, pin 1 to pin 5)
| Pin | Function |
|---|---|
| VDD | Supply, 5 V ± 10 % (4.5–5.5 V) |
| SDA | I2C data (RX in UART mode), open-drain |
| SCL | I2C clock (TX in UART mode), open-drain |
| SEL | Interface select: GND = I2C, floating = UART (max 4.0 V) |
| GND | Ground (also the metal housing) |

## Electrical limits
- Supply 4.5–5.5 V; 55 mA measuring (80 mA for the first 200 ms as the fan starts), 330 µA idle, 38 µA sleep.
- I/O: VIH ≥ 2.31 V, VOH 3.3 V, pins tolerate up to 5.5 V; SEL max 4.0 V.
- I2C standard mode only (100 kHz), no clock stretching; keep the cable under 10 cm.

## Interface details
- **I2C address 0x69.** Commands are 16-bit pointers sent MSB first with no CRC; each 2 data bytes written or read are followed by a CRC-8 (poly 0x31, init 0xFF; CRC(0xBEEF) = 0x92).
- Start measurement: write `00 10 03 00 AC` (0x03 = big-endian IEEE754 float output), < 20 ms.
- Data-ready: write `02 02`, read 3 bytes `00 flag CRC` (flag 1 = new data, every second).
- Read values: write `03 00`, read 60 bytes = 10 floats, each as `b0 b1 CRC b2 b3 CRC`: PM1.0, PM2.5, PM4.0, PM10 [µg/m³], NC0.5, NC1.0, NC2.5, NC4.0, NC10 [#/cm³], typical particle size [µm].
- Stop 0x0104, fan cleaning 0x5607, reset 0xD304 (100 ms), sleep 0x1001 / wake 0x1103 (firmware ≥ 2.0).

## Wiring
- Pull-ups: 10 kΩ from SDA to 3.3 V and from SCL to 3.3 V (the sensor has none; do not pull up to 5 V on a 3.3 V board).
- ESP32: VDD → 5V/VIN, GND → GND, SEL → GND, SDA → D21, SCL → D22.
- Pico: VDD → VBUS, GND → GND, SEL → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VDD → pin 2 (5 V), GND → pin 6, SEL → pin 9 (GND), SDA → pin 3, SCL → pin 5 (the Pi has 1.8 kΩ pull-ups to 3.3 V fitted).

## Using the driver
```python
from machine import I2C, Pin
from sps30 import SPS30
i2c = I2C(0, sda=Pin(21), scl=Pin(22), freq=100000)
s = SPS30(i2c)
s.start()
m = s.read()          # waits for the data-ready flag
print(m['pm2_5'], m['pm10'], m['typical_size'])
```

## Gotchas
- SEL must be at GND when the sensor powers up, or it stays in UART mode and never answers at 0x69.
- Readings settle after about 8–30 s from start; the first values after start() may be low.
- A CRC mismatch nearly always means missing pull-ups, a long cable, or a bus speed above 100 kHz.
- Leave the metal housing floating: it is connected to GND internally.
- The fan auto-cleans weekly by default while measuring; start_fan_cleaning() forces a 10 s cleaning.

## Datasheet
https://sensirion.com/media/documents/8600FF88/64A3B8D6/Sensirion_PM_Sensors_Datasheet_SPS30.pdf
