---
name: part-dht12
description: Pinout, electrical limits, wiring and MicroPython driver for the DHT12 I2C temperature & humidity sensor (Aosong DHT12, bare 4-lead sensor). Use when designing, wiring, simulating or writing code for a DHT12 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# DHT12 temperature & humidity sensor (DHT12)

## Overview
The **DHT12** from Aosong is the upgrade of the DHT11. It measures temperature (−20 to 60 °C, ±0.5 °C) and relative humidity (20–95 %, ±5 %) with 0.1 resolution. It has two modes: standard I2C, or a DHT11-compatible single wire. This part uses I2C. Hobbyists buy it as the bare 4-lead sensor with 2.54 mm pins. The sensor has **no pull-up resistors**.

## Pinout (looking at the slotted front, left to right)
| Pin | Name | Function |
|---|---|---|
| 1 | VDD | Supply, 2.7–5.5 V |
| 2 | SDA | I2C data, needs a 1–10 kΩ pull-up to VDD |
| 3 | GND | Ground |
| 4 | SCL | I2C clock, needs a 1–10 kΩ pull-up to VDD. If SCL is low at power-up, the sensor uses single-wire mode |

## Electrical limits
- Supply: 2.7–5.5 V (5 V typical). Use 3.3 V with an ESP32 or Pico so the bus pull-ups go to 3.3 V.
- Current: about 800 µA while measuring, 150 µA average, 30 µA asleep.
- I2C at **400 kHz or slower**. Wait 2 s after power-up, then read at most once every 2 s.

## Interface details
- **I2C address 0x5C.** The datasheet writes it as 0xB8, the 8-bit write address. The address is fixed, so only one DHT12 can sit on a bus.
- **Read:** write the register address 0x00, send a repeated start, then read 5 bytes. In MicroPython this is `i2c.readfrom_mem(0x5C, 0, 5)`.
- Bytes: humidity integer, humidity tenths, temperature integer, temperature tenths, checksum.
- **Temperature sign:** bit 7 of the temperature-tenths byte is 1 when the temperature is negative. Bits 6–0 hold the tenths.
- **Checksum:** the low 8 bits of the sum of the first four bytes. Datasheet example: `38 08 1A 06 60` = 56.8 %RH and 26.6 °C. With `86` as the fourth byte, the temperature is −26.6 °C.
- Each read returns the measurement taken at the previous read. To get a fresh value, read twice, 2 s apart.

## Wiring
- ESP32: VDD → 3V3, GND → GND, SDA → D21, SCL → D22. Add 4.7 kΩ from SDA to 3V3 and from SCL to 3V3.
- Pico: VDD → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5. Add 4.7 kΩ pull-ups to 3V3.
- Raspberry Pi 4: VDD → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5. The Pi already has 1.8 kΩ pull-ups on these pins.

## Using the driver
```python
from machine import I2C, Pin
from dht12 import DHT12
i2c = I2C(0, sda=Pin(21), scl=Pin(22), freq=100000)
t, h = DHT12(i2c).read()
print('T=%.1fC H=%.1f%%' % (t, h))
```

## Gotchas
- If you get a checksum error, check the pull-ups and look for a loose wire.
- If nothing answers at 0x5C, the sensor may have started in single-wire mode because SCL was low at power-up. Fit the SCL pull-up, then power-cycle the sensor.
- The temperature is sign-magnitude (sign in bit 7 of byte 3), not two's complement.
- Some sellers label AM2320 boards as DHT12. Both answer at 0x5C, but the AM2320 needs a different protocol (Modbus-style with CRC-16). Use the part-am2320 skill for that sensor.

## Datasheet
https://raw.githubusercontent.com/d2r2/go-aosong/master/docs/DHT12.pdf
