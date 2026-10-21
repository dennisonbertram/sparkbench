---
name: part-aht10
description: Pinout, electrical limits, wiring and MicroPython driver for the AHT10 temperature & humidity sensor module (Aosong/ASAIR AHT10). Use when designing, wiring, simulating or writing code for an AHT10 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# AHT10 temperature & humidity sensor (AHT10)

## Overview
The **AHT10** from Aosong (ASAIR) measures temperature (−40 to 85 °C) and relative humidity (0–100 %, ±2 % typical) and talks I2C. Each reading is 20 bits. Unlike the newer AHT20, the AHT10 sends **no CRC byte**. Hobbyists buy it on the common blue **4-pin AHT10 module** (VIN, GND, SCL, SDA). The module has a 3.3 V regulator (XC6206) and MOSFET level shifters on SDA/SCL, so it runs from 3.3 V or 5 V.

## Pinout (AHT10 module, header order)
| Pin | Function |
|---|---|
| VIN | Supply, 3.3–5 V (goes to the on-board 3.3 V regulator) |
| GND | Ground |
| SCL | I2C clock (level shifted) |
| SDA | I2C data (level shifted) |

Some clones print VCC instead of VIN or put SDA before SCL. Check the silkscreen.

## Electrical limits
- Module supply: 3.3–5 V. The bare AHT10 chip only takes 1.8–3.6 V (absolute max 3.6 V). Never put 5 V on a bare chip or on a board without the regulator.
- Current: about 23 µA while measuring, 0.25 µA asleep (chip). The regulator adds a little.
- I2C up to 400 kHz.

## Interface details
- **I2C address 0x38**. The chip's ADR pin can move it to 0x39, but the common module ties it to GND, so treat it as fixed.
- After power-on wait at least 20 ms, then send the init command **0xE1 0x08 0x00** and read one byte = status: bit 7 busy, bit 3 calibration enabled.
- Measure: write **0xAC 0x33 0x00**, wait more than 75 ms, then read 6 bytes: status, 20-bit humidity (byte 1, byte 2, high nibble of byte 3), 20-bit temperature (low nibble of byte 3, bytes 4, 5). If status bit 7 is still set, wait and read again.
- Humidity: RH = raw / 2^20 × 100 %. Temperature: T = raw / 2^20 × 200 − 50 °C.
- Soft reset: write **0xBA**, takes under 20 ms.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from aht10 import AHT10
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
t, h = AHT10(i2c).read()
print('T=%.1fC H=%.0f%%' % (t, h))
```

## Gotchas
- There is no CRC, so a loose wire can give a wrong reading without an error. Use short, firm SDA/SCL wires.
- AHT20 drivers send 0xBE to initialise, but the AHT10 uses 0xE1. The 0xAC measurement command is the same on both.
- Only one AHT10 module per bus at 0x38. A second one needs another I2C bus or a multiplexer.
- Keep it away from the regulator and the microcontroller, which warm the air nearby. Don't read more often than about once every 2 s, because the sensor heats itself.
- Above 80 % RH for a long time the reading drifts up. It recovers slowly in normal air.

## Datasheet
https://server4.eca.ir/eshop/AHT10/Aosong_AHT10_en_draft_0c.pdf
