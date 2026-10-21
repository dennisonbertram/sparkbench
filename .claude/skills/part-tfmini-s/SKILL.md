---
name: part-tfmini-s
description: Pinout, electrical limits, wiring and MicroPython driver for the TFmini-S LiDAR distance sensor (Benewake TFmini-S, UART mode). Use when designing, wiring, simulating or writing code for a TFmini-S in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# TFmini-S LiDAR distance sensor (TFmini-S)

## Overview
The **Benewake TFmini-S** is a single-point time-of-flight LiDAR. It measures 0.1–12 m (white target; 0.1–7 m on a dark 10 % target) with 1 cm resolution, ±6 cm accuracy up to 6 m and ±1 % beyond, and a 2° beam. Out of the box it streams 100 readings a second over a 3.3 V UART at 115200 baud (it can be switched to I2C by command; this part models UART mode). Hobbyists buy it as the **SparkFun TFmini-S - Micro LiDAR Module (SEN-16977)**: the bare Benewake module with a GH1.25-4P cable.

## Pinout (GH1.25-4P connector, pin order from the manual, Table 5)
| Pin | Wire | Function |
|---|---|---|
| 1 GND | black | Ground |
| 2 +5V | red | Supply, 5 V ±0.1 V |
| 3 RXD | white | Sensor serial input (RXD/SDA), 3.3 V LVTTL |
| 4 TXD | green | Sensor serial output (TXD/SCL), 3.3 V LVTTL |

## Electrical limits
- Supply: 5 V ±0.1 V only (no 3.3 V version). **No reverse-polarity or over-voltage protection.**
- Current: ~50 mA (short range) to ≤140 mA average, 200 mA peak; 0.7 W.
- Logic: 3.3 V LVTTL, so it connects directly to ESP32 / Pico pins.
- Operating temperature 0–60 °C.

## Interface details
- UART 115200 baud, 8 data bits, 1 stop bit, no parity. Default frame rate 100 Hz (settable to 1000/n Hz).
- 9-byte frame: `0x59 0x59 Dist_L Dist_H Strength_L Strength_H Temp_L Temp_H Checksum`, checksum = low 8 bits of the sum of bytes 0–7.
- Distance in cm. 65535 (−1) = strength < 100 (unreliable), 65534 (−2) = strength saturated, 65532 (−4) = ambient light saturated.
- Chip temperature: °C = Temp / 8 − 256.
- Commands: `0x5A len id payload… checksum` (little-endian payload, checksum = low byte of the sum). E.g. frame rate 100 Hz = `5A 06 03 64 00 C7`; save settings = `5A 04 11 6F` (wait 1 s afterwards).

## Wiring
- ESP32: red → 5V (VIN/VBUS), black → GND, green TXD → GPIO16 (UART2 RX), white RXD → GPIO17 (UART2 TX).
- Pico: red → VBUS (pin 40), black → GND, green TXD → GP1 (UART0 RX), white RXD → GP0 (UART0 TX).
- Raspberry Pi 4: red → pin 2 (5 V), black → pin 6, green TXD → pin 10 (RXD), white RXD → pin 8 (TXD).

## Using the driver
```python
from machine import UART, Pin
from tfmini_s import TFminiS
uart = UART(2, baudrate=115200, tx=Pin(17), rx=Pin(16))
lidar = TFminiS(uart)
d, strength, temp = lidar.read()
print('D=%s cm' % d)   # None when unreliable; lidar.error says why
```

## Gotchas
- Swapped TX/RX is the most common "no data" fault: sensor TXD goes to the board's RX.
- Frames arrive 900 bytes a second; the driver flushes before each read so a slow loop still gets the newest distance.
- Under 10 cm is a blind zone; glass, water and mirrors give wrong readings.
- Two sensors facing each other interfere; more than two pointing the same way also interfere.
- After changing a setting, send save (`5A 04 11 6F`) or it is lost at power-off.

## Datasheet
https://cdn.sparkfun.com/assets/8/a/f/a/c/16977-TFMini-S_-_Micro_LiDAR_Module-Product_Manual.pdf
