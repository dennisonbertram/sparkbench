---
name: part-dht20
description: Pinout, electrical limits, wiring and MicroPython driver for the DHT20 I2C temperature & humidity sensor (Aosong/ASAIR DHT20, Adafruit 5183). Use when designing, wiring, simulating or writing code for a DHT20 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# DHT20 I2C temperature & humidity sensor (DHT20)

## Overview
The **DHT20** from Aosong (ASAIR) looks like a DHT11 but talks **I2C** instead of the DHT one-wire protocol. Inside is an AHT20 chip. It measures temperature (−40 to 80 °C, ±0.5 °C typical) and relative humidity (0–100 %, ±3 % typical). Each reading is 20 bits and ends with a CRC byte. The modelled product is the **Adafruit DHT20 - AHT20 Pin Module (product 5183)**: the bare 4-pin sensor with 4.7 kΩ I2C pull-ups built in.

## Pinout (left to right, looking at the grille)
| Pin | Name | Function |
|---|---|---|
| 1 | VDD | Supply, 2.5–5.5 V (use your board's logic voltage) |
| 2 | SDA | I2C data (pull-up built in) |
| 3 | GND | Ground |
| 4 | SCL | I2C clock (pull-up built in) |

This is not the DHT11/DHT22 pin order. Don't plug it into old DHT wiring.

## Electrical limits
- Supply: 2.2–5.5 V per datasheet; Adafruit rates their part at 2.5–5.5 V.
- Current: about 1 mA while measuring, 250 nA asleep.
- SDA/SCL must not go above VDD + 0.3 V, so power it from 3.3 V with an ESP32/Pico.
- Put a 100 nF capacitor between VDD and GND near the sensor (datasheet 4.6).

## Interface details
- **I2C address 0x38**, fixed.
- After power-on wait ≥ 100 ms. Read one byte = status. If `status & 0x18 != 0x18`, initialise registers 0x1B, 0x1C, 0x1E (Aosong's routine, in the driver).
- Wait 10 ms, then write **0xAC 0x33 0x00**, wait 80 ms, poll until status bit 7 (busy) clears, then read 7 bytes: status, 20-bit humidity (bytes 1, 2, high nibble of 3), 20-bit temperature (low nibble of 3, bytes 4, 5), CRC.
- CRC-8 over the first 6 bytes: polynomial 0x31 (1 + x⁴ + x⁵ + x⁸), initial value 0xFF.
- RH = S_RH / 2²⁰ × 100 %. T = S_T / 2²⁰ × 200 − 50 °C.

## Wiring
- ESP32: VDD → 3V3, SDA → D21, GND → GND, SCL → D22.
- Pico: VDD → 3V3(OUT), SDA → GP4, GND → GND, SCL → GP5.
- Raspberry Pi 4: VDD → pin 1 (3.3 V), SDA → pin 3, GND → pin 6, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from dht20 import DHT20
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
t, h = DHT20(i2c).read()
print('T=%.1fC H=%.0f%%' % (t, h))
```

## Gotchas
- MicroPython's built-in `dht` module does NOT work with the DHT20. It is an I2C part, so use this driver.
- A CRC mismatch nearly always means a loose SDA/SCL wire.
- The address can't be changed, and it clashes with an AHT10/AHT20 on the same bus.
- Read about every 2 s; faster readings warm the sensor.
- Hand-solder only (no reflow); after soldering, let it rehydrate in normal room air for a couple of days.

## Datasheet
https://cdn-shop.adafruit.com/product-files/5183/5193_DHT20.pdf
