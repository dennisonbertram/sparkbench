---
name: part-tf-luna
description: Pinout, electrical limits, wiring and MicroPython driver for the Benewake TF-Luna LiDAR distance sensor (TF-Luna, UART mode). Use when designing, wiring, simulating or writing code for a TF-Luna in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# TF-Luna LiDAR distance sensor (TF-Luna)

## Overview
The **Benewake TF-Luna** is a single-point time-of-flight LiDAR. It measures 0.2–8 m (1 cm resolution, ±6 cm up to 3 m, ±2 % from 3 to 8 m). By default it streams readings over a 3.3 V UART at **115200 baud**, 100 frames a second. Grounding pin 5 switches it to I2C (address 0x10) instead. Hobbyists buy the bare module with its **6-wire GH1.25 cable**, so you connect it with jumper leads.

## Pinout (TF-Luna cable, pin 1 → 6)
| Pin | Name | Function |
|---|---|---|
| 1 | +5V | Supply, 3.7–5.2 V |
| 2 | RXD/SDA | UART receive (from the board's TX) / I2C SDA |
| 3 | TXD/SCL | UART transmit (to the board's RX) / I2C SCL |
| 4 | GND | Ground |
| 5 | CONFIG | Open or 3.3 V = UART mode; GND = I2C mode |
| 6 | MUX | On/off-mode output, or data-ready in I2C mode (unused in UART mode) |

## Electrical limits
- Supply: 3.7–5.2 V. Power it from 5 V (VBUS/VIN), because 3.3 V is too low.
- Current: ≤70 mA average, 150 mA peak.
- Signal level: LVTTL 3.3 V, safe on ESP32/Pico GPIO.
- No reverse-polarity or over-voltage protection.

## Interface details
- UART 115200 8N1 (pin 5 open).
- Default output frame (9-byte/cm), 100 Hz: `59 59 Dist_L Dist_H Amp_L Amp_H Temp_L Temp_H Checksum`.
- Checksum = low 8 bits of the sum of bytes 0–7.
- Distance in cm. Amp = signal strength: below 100 the reading is unreliable and the distance reads 0 cm, and 65535 means overexposed.
- Chip temperature = Temp / 8 − 256 °C.
- Commands: `5A Len ID Payload Checksum`, e.g. frame rate 10 Hz `5A 06 03 0A 00 xx`, save settings `5A 04 11 6F`.

## Wiring
- ESP32: +5V → 5V/VIN, GND → GND, TXD → GPIO16 (RX2), RXD → GPIO17 (TX2), CONFIG unconnected.
- Pico: +5V → VBUS, GND → GND, TXD → GP1 (UART0 RX), RXD → GP0 (UART0 TX), CONFIG unconnected.
- Raspberry Pi 4: +5V → pin 2, GND → pin 6, TXD → pin 10 (RXD), RXD → pin 8 (TXD).

## Using the driver
```python
from machine import UART, Pin
from tfluna import TFLuna
uart = UART(2, baudrate=115200, tx=Pin(17), rx=Pin(16))
d, amp, t = TFLuna(uart).read()
print('D=%dcm AMP=%d T=%.1fC' % (d, amp, t))
```

## Gotchas
- Swap TX/RX: the sensor's TXD goes to the board's RX.
- If pin 5 touches GND, the sensor goes quiet on UART (it is in I2C mode).
- Readings under 20 cm fall in the blind zone. Small or dark targets give low Amp.
- The stream runs constantly. The driver drops stale bytes and waits for the next frame that passes the checksum.

## Datasheet
https://en.benewake.com/uploadfiles/2025/04/20250430174501874.pdf (user manual: https://en.benewake.com/uploadfiles/2024/04/20240426135946148.pdf)
