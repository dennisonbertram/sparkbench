---
name: part-aht25
description: Pinout, electrical limits, wiring and MicroPython driver for the AHT25 temperature & humidity sensor (Aosong/ASAIR AHT25, 4-pin plug-in module). Use when designing, wiring, simulating or writing code for an AHT25 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# AHT25 temperature & humidity sensor (AHT25)

## Overview
The **AHT25** from Aosong (ASAIR) measures temperature and relative humidity (0–100 %) and talks I2C at a fixed address, 0x38. It is sold as a small black board with four 2.54 mm pins: the **ASAIR AHT25 temperature & humidity sensor**. It runs on 2.2–5.5 V, with typical accuracy of ±2 %RH and ±0.3 °C over −40 to 80 °C. It has **no I2C pull-ups**.

## Pinout (ASAIR AHT25, pin 1 to 4, top view)
| Pin | Function |
|---|---|
| VDD | Supply, 2.2–5.5 V (use your board's 3.3 V) |
| SDA | I2C data (needs an external 4.7 kΩ pull-up to VDD) |
| GND | Ground |
| SCL | I2C clock (needs an external 4.7 kΩ pull-up to VDD) |

Note that this order (VDD, SDA, GND, SCL) differs from the usual VCC/GND/SCL/SDA breakouts.

## Electrical limits
- Supply: 2.2–5.5 V (absolute max 5.5 V). SDA and SCL must stay between −0.3 V and VDD + 0.3 V.
- Current: about 980 µA while measuring and 250 nA asleep.
- The datasheet says the MCU and the sensor must use the same supply voltage, so power it from 3.3 V on ESP32/Pico.

## Interface details
- **I2C address 0x38** (fixed).
- Power-on: wait at least 100 ms, then read one status byte. If `(status & 0x18) != 0x18`, initialise registers 0x1B, 0x1C and 0x1E with Aosong's routine: write `reg 00 00`, wait 5 ms, read 3 bytes, wait 10 ms, write `0xB0|reg b1 b2`. Then wait 10 ms.
- Measure: write **0xAC 0x33 0x00**, wait 80 ms, and poll the status byte until bit 7 (busy) is 0. Then read 7 bytes: status, then 20 bits of humidity, then 20 bits of temperature, then CRC.
- CRC-8 over the first 6 bytes: polynomial 0x31 (1+x⁴+x⁵+x⁸), initial value 0xFF.
- RH = S_RH / 2²⁰ × 100 %. T = S_T / 2²⁰ × 200 − 50 °C.

## Wiring
- ESP32: VDD → 3V3, SDA → D21, GND → GND, SCL → D22, plus 4.7 kΩ from SDA and from SCL to 3V3.
- Pico: VDD → 3V3(OUT), SDA → GP4, GND → GND, SCL → GP5, plus 4.7 kΩ pull-ups to 3V3.
- Raspberry Pi 4: VDD → pin 1 (3.3 V), SDA → pin 3, GND → pin 6, SCL → pin 5. The Pi already has 1.8 kΩ pull-ups on these pins.
- Put a 100 nF capacitor between VDD and GND, close to the sensor.

## Using the driver
```python
from machine import I2C, Pin
from aht25 import AHT25
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
t, h = AHT25(i2c).read()
print('T=%.1fC H=%.0f%%' % (t, h))
```

## Gotchas
- With no pull-ups, the scan finds nothing or reads fail. Add the two 4.7 kΩ resistors.
- A CRC mismatch nearly always means a loose SDA/SCL wire.
- Read it no more than once every 2 s, or the sensor warms itself. Keep it away from the regulator and the microcontroller.
- Above 80 %RH for long periods the reading drifts (about +3 %RH after 60 h); it recovers slowly in normal air.
- Only one AHT25 can sit on a bus (fixed address 0x38). Do not reflow-solder it; hand-solder each pin in under 5 s, or use a 4-pin socket.

## Datasheet
https://akizukidenshi.com/goodsaffix/AHT25.pdf (Aosong AHT25 datasheet V1.0, May 2021)
