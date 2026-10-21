---
name: part-bme280
description: Pinout, electrical limits, wiring and MicroPython driver for the BME280 temperature, humidity & pressure sensor (Bosch BME280). Use when designing, wiring, simulating or writing code for a BME280 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# BME280 temperature, humidity & pressure sensor (BME280)

## Overview
The **BME280** from Bosch Sensortec measures relative humidity (0–100 %RH, ±3 %), barometric pressure (300–1100 hPa, ±1 hPa) and temperature (−40 to +85 °C, ±1 °C). It talks I2C or SPI. Hobbyists buy it on the purple **GY-BME280-3.3** module: no regulator (3.3 V only), 10 kΩ pull-ups on SDA/SCL, CSB pulled high (I2C) and SDO pulled low (address 0x76).

## Pinout (GY-BME280-3.3, header order)
| Pin | Function |
|---|---|
| VCC | Supply, 3.3 V only (1.71–3.6 V) |
| GND | Ground |
| SCL | I2C clock (SPI SCK) |
| SDA | I2C data (SPI SDI) |
| CSB | Chip select: high/open = I2C, low = SPI (optional) |
| SDO | Address select: open/GND = 0x76, VCC = 0x77 (optional) |

## Electrical limits
- Supply: 1.71–3.6 V; absolute maximum 4.25 V. The GY-BME280-3.3 has no regulator, so never feed it 5 V.
- Current: up to 0.71 mA while converting pressure, 0.1 µA asleep; about 3.6 µA at one forced reading per second.
- I2C up to 3.4 MHz.

## Interface details
- **I2C address 0x76** (SDO low), 0x77 (SDO high). Chip ID register 0xD0 = **0x60** (0x58 = BMP280, no humidity).
- Calibration: dig_T1..dig_P9 at 0x88–0x9F (little-endian 16-bit), dig_H1 at 0xA1, dig_H2..dig_H6 at 0xE1–0xE7 (H4/H5 are 12-bit values sharing 0xE5).
- Write **ctrl_hum 0xF2** (osrs_h) first, then **ctrl_meas 0xF4** (osrs_t, osrs_p, mode = 01 forced). Humidity settings only take effect after the ctrl_meas write.
- Wait ≥ 9.3 ms (x1/x1/x1), poll status 0xF3 bit 3, then burst-read 8 bytes from 0xF7: press (20-bit), temp (20-bit), hum (16-bit).
- Compensation (datasheet section 8.1, double precision): temperature first (it sets t_fine), then pressure (Pa) and humidity (%RH, clamped 0–100).

## Wiring
- ESP32: VCC → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VCC → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from bme280 import BME280
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
t, p, h = BME280(i2c, addr=0x76).read()
print('T=%.1fC P=%.1fhPa H=%.1f%%' % (t, p, h))
```

## Gotchas
- Many cheap "BME280" listings ship a BMP280 instead: if 0xD0 reads 0x58, there is no humidity sensor.
- Keep it away from the regulator and the microcontroller; self-heating raises temperature and lowers humidity.
- Raw register values are meaningless without the per-chip calibration; always read it at start-up.
- Two sensors on one bus: tie one board's SDO to VCC (0x77).

## Datasheet
https://www.bosch-sensortec.com/media/boschsensortec/downloads/datasheets/bst-bme280-ds002.pdf
