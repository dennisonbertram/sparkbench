---
name: part-am2320
description: Pinout, electrical limits, wiring and MicroPython driver for the AM2320 I2C temperature & humidity sensor (Aosong AM2320, Adafruit 3721). Use when designing, wiring, simulating or writing code for an AM2320 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# AM2320 temperature & humidity sensor (AM2320)

## Overview
The **AM2320** from Aosong measures temperature (−40 to 80 °C, ±0.5 °C) and relative humidity (0–99.9 %, ±3 %) with 0.1 resolution. It speaks a Modbus-style command protocol over I2C, with a CRC-16 on every reply. It can also run a DHT22-style single-wire mode, but this part uses I2C. Hobbyists buy it as the bare 4-lead sensor, e.g. **Adafruit AM2320 (product 3721)**. The sensor has **no pull-up resistors**.

## Pinout (Adafruit 3721, left to right looking at the slotted front)
| Pin | Function |
|---|---|
| VDD | Supply, 3.1–5.5 V |
| SDA | I2C data, needs a 3–10 kΩ pull-up to VDD |
| GND | Ground |
| SCL | I2C clock, needs a 3–10 kΩ pull-up to VDD |

## Electrical limits
- Supply: 3.1–5.5 V (5 V typical). Use 3.3 V with ESP32 or Pico so the bus pull-ups go to 3.3 V.
- Current: about 950 µA while measuring, 350 µA average, 10 µA asleep.
- I2C at **100 kHz or slower**. Read at most once every 2 s.

## Interface details
- **I2C address 0x5C** (the datasheet writes it as 0xB8, the 8-bit write address). It is fixed, so only one AM2320 can sit on a bus.
- **Wake:** send the address (an empty write). The sensor does **not** ACK, so MicroPython raises OSError. Ignore it. The sensor then stays awake for about 3 ms.
- **Read:** write `03 00 04` (function 0x03, start register 0x00, 4 registers). Wait at least 1.5 ms, then read 8 bytes: `03 04 RH_H RH_L T_H T_L CRC_L CRC_H`.
- CRC-16/Modbus (init 0xFFFF, reflected polynomial 0xA001) over the first 6 bytes, sent low byte first. Datasheet example: `03 04 03 39 01 15` → `E1 FE` = 82.5 %RH, 27.7 °C.
- Humidity = raw / 10 %. Temperature: bit 15 is the sign (1 = negative), and bits 14–0 hold |T| × 10. This is sign-magnitude, not two's complement.
- Each read starts a new measurement, so the values you get were measured at the previous read.

## Wiring
- ESP32: VDD → 3V3, GND → GND, SDA → D21, SCL → D22. Add 4.7 kΩ from SDA to 3V3 and from SCL to 3V3.
- Pico: VDD → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5. Add 4.7 kΩ pull-ups to 3V3.
- Raspberry Pi 4: VDD → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5. The Pi already has 1.8 kΩ pull-ups on these pins.

## Using the driver
```python
from machine import I2C, Pin
from am2320 import AM2320
i2c = I2C(0, sda=Pin(21), scl=Pin(22), freq=100000)
t, h = AM2320(i2c).read()
print('T=%.1fC H=%.1f%%' % (t, h))
```

## Gotchas
- `i2c.scan()` usually does **not** show the AM2320, because it is asleep. That is normal.
- If you get a header or CRC error, check the pull-ups, check for a loose wire, and check that the bus runs at 100 kHz or slower.
- Holding SCL low at power-up selects single-bus mode, so keep the SCL pull-up in place.
- In Sparkbench's simulator, the temperature slider covers 0–80 °C only. The driver still decodes negative temperatures from a real sensor.

## Datasheet
https://cdn-shop.adafruit.com/product-files/3721/AM2320.pdf
