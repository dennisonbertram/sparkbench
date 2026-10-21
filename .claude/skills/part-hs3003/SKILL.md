---
name: part-hs3003
description: Pinout, electrical limits, wiring and MicroPython driver for the HS3003 humidity & temperature sensor (Renesas HS300x, MikroElektronika Temp&Hum 18 Click). Use when designing, wiring, simulating or writing code for an HS3003 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# HS3003 humidity & temperature sensor (HS3003)

## Overview
The **Renesas HS3003** measures relative humidity (0–100 %RH, ±2.5 %RH typical, 20–80 %RH) and temperature (−40 to 125 °C, ±0.25 °C typical, 0–70 °C) with 14-bit results over I2C. Hobbyists buy it on the **MikroElektronika Temp&Hum 18 Click (MIKROE-4892)**, a mikroBUS board with 4.7 kΩ pull-ups on SDA/SCL, a VCC SEL jumper (3V3 / 5V) and a power LED.

## Pinout (Temp&Hum 18 Click, two 8-pin mikroBUS headers)
| Left header | Function | Right header | Function |
|---|---|---|---|
| AN | not connected | PWM | not connected |
| RST | not connected | INT | not connected |
| CS | not connected | TX | not connected |
| SCK | not connected | RX | not connected |
| MISO | not connected | SCL | I2C clock (4.7 kΩ pull-up to VCC) |
| MOSI | not connected | SDA | I2C data (4.7 kΩ pull-up to VCC) |
| 3V3 | Supply with VCC SEL on 3V3 | 5V | Supply with VCC SEL on 5V |
| GND | Ground | GND | Ground |

Only 3V3, GND, SCL and SDA are needed (VCC SEL on 3V3).

## Electrical limits
- Chip supply 2.3–5.5 V (1.8 V extended, −20 to 125 °C). Absolute maximum 6.0 V.
- The pull-ups go to the selected VCC: keep VCC SEL on **3V3** for an ESP32, Pico or Raspberry Pi.
- Current: about 25 µA average at one 14-bit measurement per second, 0.6 µA asleep, plus about 3 mA for the power LED.
- I2C up to 400 kHz.

## Interface details
- **I2C address 0x44** (fixed).
- No command bytes. **Measurement Request**: a zero-length write (address + W, then STOP), `i2c.writeto(0x44, b'')`.
- Wait at least **33.9 ms** (14-bit RH + T, the factory default) before the **Data Fetch**: read 4 bytes.
- Byte 0 bits 7:6 = status (00 valid, 01 stale = already fetched / not ready). Humidity = 14 bits in bytes 0–1; temperature = bytes 2–3 shifted right by 2 (the last 2 bits are undefined).
- RH = H / 16383 × 100 %RH; T = T / 16383 × 165 − 40 °C. No CRC.

## Wiring
- ESP32: 3V3 → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: 3V3 → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: 3V3 → pin 1, GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from hs3003 import HS3003
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
t, h = HS3003(i2c).read()
print('T=%.1fC H=%.0f%%' % (t, h))
```

## Gotchas
- Status 01 (stale) means the result was already read or the conversion has not finished: wait and fetch again. Right after power-up a stale result is invalid.
- Don't fetch faster than the conversion time; the driver waits 40 ms.
- Changing resolution needs the programming-mode command sent within 10 ms of power-up (0xA0 0x00 0x00); the driver keeps the 14-bit default.
- Leave the protective cover on and keep the board away from warm regulators.

## Datasheet
https://cdn.sparkfun.com/assets/0/0/0/2/1/HS3003_datasheet.pdf
