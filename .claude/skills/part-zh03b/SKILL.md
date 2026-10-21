---
name: part-zh03b
description: Pinout, electrical limits, wiring and MicroPython driver for the Winsen ZH03B laser particulate (PM1.0 / PM2.5 / PM10 dust) sensor (ZH03B, UART). Use when designing, wiring, simulating or writing code for a ZH03B in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# ZH03B laser dust sensor (ZH03B)

## Overview
The **ZH03B** from Winsen is a laser-scattering particulate module with a built-in fan. It measures **PM1.0, PM2.5 and PM10** in µg/m³ (0–1000 µg/m³, particles 0.3–10 µm) and by default sends them over a 9600-baud UART once a second. It also has a question-and-answer mode, a sleep (dormant) mode and a PWM output for PM2.5. Hobbyists buy the bare **Winsen ZH03B module** with its 8-pin 1.25 mm cable.

## Pinout (module connector, pins 1–8)
| Pin | Name | Function |
|---|---|---|
| 1 | VDD | Supply 5 V (4.9–5.5 V) |
| 2 | GND | Ground |
| 3 | NC3 | Not connected |
| 4 | RXD | Serial input, 3.3 V TTL (only needed to send commands) |
| 5 | TXD | Serial output, 3.3 V TTL, 9600 baud |
| 6 | NC6 | Reserved: leave unconnected |
| 7 | NC7 | Not connected |
| 8 | PWM | PWM output for PM2.5, 3.3 V (optional) |

The connector is 1.25 mm pitch, so it is wired with its cable and jumper leads, not plugged into a breadboard.

## Electrical limits
- Supply: 4.9–5.5 V, under 120 mA working (fan + laser), under 20 mA asleep. Do not run it from 3.3 V.
- UART and PWM: 3.3 V logic, safe straight into an ESP32 or Pico.
- Operating −10–50 °C, 0–80 %RH non-condensing. Stable about 30 s after power-on; response T90 < 45 s.

## Interface details
- UART 9600 baud, 8 data bits, 1 stop bit, no parity.
- **Initiative upload (default)**, every second, 24 bytes: `42 4D 00 14`, then nine 16-bit big-endian fields, then a 16-bit checksum. Fields 4/5/6 (bytes 11–16) are **PM1.0, PM2.5, PM10** in µg/m³; the others are reserved. Checksum = 16-bit sum of bytes 1–22, high byte first (manual example sums to 0x031F).
- **Q&A mode**: send `FF 01 78 41 00 00 00 00 46`; then `FF 01 86 00 00 00 00 00 79` returns `FF 86 PM2.5(2) PM10(2) PM1.0(2) SUM` with SUM = (NOT(byte1+…+byte7)) + 1. Note the different field order. Back to upload: `FF 01 78 40 00 00 00 00 47`.
- **Dormant**: `FF 01 A7 01 00 00 00 00 57` sleeps, `FF 01 A7 00 00 00 00 00 58` wakes; reply `FF A7 01 … 58` on success.
- **PWM**: 1 s period, PM2.5 = 1000 × TH / (TH + TL) µg/m³.

## Wiring
- ESP32: VDD → 5V (VIN/USB), GND → GND, TXD → GPIO16 (UART2 RX), RXD → GPIO17 (UART2 TX, optional).
- Pico: VDD → VBUS (5 V), GND → GND, TXD → GP1 (UART0 RX), RXD → GP0 (UART0 TX, optional).
- Raspberry Pi 4: VDD → pin 2 (5 V), GND → pin 6, TXD → pin 10 (RXD), RXD → pin 8 (TXD, optional).

## Using the driver
```python
from machine import UART, Pin
from zh03b import ZH03B
uart = UART(2, baudrate=9600, tx=Pin(17), rx=Pin(16))
r = ZH03B(uart).read()
print('PM1=%d PM2.5=%d PM10=%d' % (r['pm1_0'], r['pm2_5'], r['pm10']))
```

## Gotchas
- It needs real 5 V and up to 120 mA: power it from the USB 5 V rail, not a 3.3 V pin.
- The upload frame looks like a Plantower PMS frame but is shorter (length 0x14, 24 bytes): PMS drivers will not parse it.
- Q&A replies order the values PM2.5, PM10, PM1.0 and use a different checksum from the upload frame.
- Keep 2 cm clear around the fan outlet, keep it out of strong airflow, and do not take the shield off.
- Swap TXD/RXD if nothing arrives: module TXD goes to the board's RX.

## Datasheet
https://www.winsen-sensor.com/d/files/ZH03B.pdf
