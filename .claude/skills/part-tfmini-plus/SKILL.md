---
name: part-tfmini-plus
description: Pinout, electrical limits, wiring and MicroPython driver for the TFmini Plus LiDAR distance sensor (Benewake TFmini Plus, IP65, UART mode). Use when designing, wiring, simulating or writing code for a TFmini Plus in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# TFmini Plus LiDAR distance sensor (TFmini Plus)

## Overview
The **Benewake TFmini Plus** is a single-point time-of-flight LiDAR in an IP65 (dust-tight, splash-proof) enclosure. It measures 0.1–12 m (90 % white target) with ±5 cm accuracy up to 6 m and ±1 % beyond, 3.6° field of view, and streams 100 readings a second (1–1000 Hz adjustable) over a 3.3 V UART at 115200 baud. Hobbyists buy it as the **SparkFun TFMini Plus - Micro LiDAR Module (SEN-15179)**: the Benewake module with a 30 cm GH1.25-4P cable.

## Pinout (GH1.25-4P connector, manual Table 4)
| Pin | Wire | Function |
|---|---|---|
| 1 +5V | red | Supply, 5 V ±0.5 V |
| 2 RXD | white | Sensor serial input, 3.3 V LVTTL |
| 3 TXD | blue | Sensor serial output, 3.3 V LVTTL |
| 4 GND | black | Ground |

Note: this order is NOT the TFmini-S order (TFmini-S starts with GND).

## Electrical limits
- Supply: 5 V ±0.5 V (4.5–5.5 V).
- Current: ≤110 mA average (about 50 mA short-range mode, 180 mA long-range mode), **500 mA peak** – the manual says the supply must deliver that peak. Use a separate 5 V supply with a common ground.
- Logic: 3.3 V LVTTL, so it connects directly to ESP32 / Pico pins.
- Operating temperature −20…60 °C.

## Interface details
- UART 115200 baud, 8N1. Default frame rate 100 Hz (settable to 1000/n Hz).
- 9-byte frame: `0x59 0x59 Dist_L Dist_H Strength_L Strength_H Temp_L Temp_H Checksum`, checksum = low 8 bits of the sum of bytes 0–7.
- Distance in cm (mm after the `5A 05 05 06 6A` command). **Distance 0 = unreliable** (signal strength < 100 or = 65535).
- Chip temperature: °C = Temp / 8 − 256.
- Commands: `0x5A len id payload… checksum` (little-endian payload, checksum = low byte of the sum). E.g. frame rate 100 Hz = `5A 06 03 64 00 C7`; save settings = `5A 04 11 6F` (required after any change).

## Wiring
- ESP32: red → external 5 V supply +, black → supply − and ESP32 GND, blue TXD → GPIO16 (UART2 RX), white RXD → GPIO17 (UART2 TX).
- Pico: red → external 5 V, black → GND (shared), blue TXD → GP1 (UART0 RX), white RXD → GP0 (UART0 TX).
- Raspberry Pi 4: red → external 5 V, black → pin 6 (shared GND), blue TXD → pin 10 (RXD), white RXD → pin 8 (TXD).

## Using the driver
```python
from machine import UART, Pin
from tfmini_plus import TFminiPlus
uart = UART(2, baudrate=115200, tx=Pin(17), rx=Pin(16))
lidar = TFminiPlus(uart)
d, strength, temp = lidar.read()
print('D=%s cm' % d)   # None when unreliable; lidar.error says why
```

## Gotchas
- Swapped TX/RX is the most common "no data" fault: sensor TXD (blue) goes to the board's RX.
- Frames arrive 900 bytes a second; the driver flushes before each read so a slow loop still gets the newest distance.
- Under 10 cm is a blind zone; glass, water and mirrors give wrong readings; a spot straddling two objects reads in between.
- Settings are lost unless you send save (`5A 04 11 6F`).

## Datasheet
https://cdn.sparkfun.com/assets/1/4/2/1/9/TFmini_Plus_A02_Product_Manual_EN.pdf
