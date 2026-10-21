---
name: part-si1145
description: Pinout, electrical limits, wiring and MicroPython driver for the SI1145 UV index / IR / visible light sensor (Silicon Labs Si1145). Use when designing, wiring, simulating or writing code for an SI1145 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# SI1145 UV index / IR / visible light sensor (SI1145)

## Overview
The **Si1145** from Silicon Labs measures visible and infrared light (raw 16-bit ADC counts) and calculates a **UV index** from them (it has no true UV photodiode; the algorithm is calibrated for sunlight). It can also pulse an external IR LED for proximity sensing. It talks I2C. Hobbyists buy it on the **Adafruit SI1145 Breakout Board (#1777)**, which adds a 3.3 V regulator and 10 kΩ pull-ups so it runs from 3–5 V.

## Pinout (Adafruit #1777, header order)
| Pin | Function |
|---|---|
| Vin | Supply, 3–5 V (on-board 3.3 V regulator) |
| GND | Ground |
| 3Vo | 3.3 V regulator output — leave unconnected |
| INT | Interrupt output, open-drain, active low (optional) |
| LED | IR LED driver for proximity (optional) |
| SCL | I2C clock (10 kΩ pull-up on board) |
| SDA | I2C data (10 kΩ pull-up on board) |

## Electrical limits
- Chip supply 1.71–3.6 V; the breakout's regulator accepts 3–5 V on Vin.
- SCL/SDA/INT absolute max 3.6 V on the chip; the board pulls them up to 3.3 V.
- Current: about 4.3 mA while measuring, under 1 µA in standby.

## Interface details
- **I2C address 0x60** (fixed). PART_ID (0x00) reads **0x45**.
- After power-up wait ≥ 25 ms, then write **0x17 to HW_KEY (0x07)**.
- Parameters are set through a mailbox: write the value to PARAM_WR (0x17), then COMMAND (0x18) = 0xA0 | parameter offset.
- UV setup: UCOEF0..3 (0x13–0x16) = 0x29, 0x89, 0x02, 0x00; CHLIST (parameter 0x01) = 0xB0 (EN_UV | EN_ALS_IR | EN_ALS_VIS).
- One reading: COMMAND = 0x06 (ALS_FORCE), then read little-endian words: VIS 0x22/0x23, IR 0x24/0x25, AUX/UVINDEX 0x2C/0x2D.
- **UV index = AUX_DATA / 100.** VIS and IR are raw ADC counts (not lux).
- RESPONSE (0x20): upper bit set = error/overflow (e.g. 0x8C VIS overflow); a NOP command (0x00) clears it.

## Wiring
- ESP32: Vin → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: Vin → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: Vin → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from si1145 import SI1145
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
uv, vis, ir = SI1145(i2c).read()
print('UV=%.2f VIS=%d IR=%d' % (uv, vis, ir))
```

## Gotchas
- Forgetting HW_KEY = 0x17 or the UCOEF values gives zero/garbage UV readings.
- The UV index is only meaningful in sunlight; indoor lamps read near 0 regardless of their UV.
- A cover glass or plastic window changes the UV coefficients — keep the sensor exposed.
- In direct sun the default ADC range can overflow (data 0xFFFF); switch the ALS ranges to high-signal mode if you need raw VIS/IR outdoors.
- Do not connect 3Vo to your board's 3.3 V supply.

## Datasheet
https://cdn-shop.adafruit.com/datasheets/Si1145-46-47.pdf
