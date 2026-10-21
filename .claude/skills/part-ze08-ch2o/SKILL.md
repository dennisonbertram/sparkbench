---
name: part-ze08-ch2o
description: Pinout, electrical limits, wiring and MicroPython driver for the Winsen ZE08-CH2O formaldehyde sensor (ZE08-CH2O). Use when designing, wiring, simulating or writing code for a ZE08-CH2O in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# ZE08-CH2O formaldehyde sensor (ZE08-CH2O)

## Overview
The **ZE08-CH2O** from Winsen is an electrochemical formaldehyde (CH2O, HCHO) module: range 0–5 ppm (0–5000 ppb), resolution ≤ 0.01 ppm, built-in temperature compensation. By default it sends the concentration in **ppb** over a 9600-baud UART once a second; it also has a 0.4–2 V analog output and a PWM output. Hobbyists buy the bare **Winsen ZE08-CH2O module** with its 7-pin 1.25 mm cable.

## Pinout (module connector, pins 1–7)
| Pin | Name | Function |
|---|---|---|
| 1 | HD | Zero calibration, factory use only: leave unconnected |
| 2 | DAC | Analog output 0.4–2 V for 0–5 ppm (optional) |
| 3 | GND | Ground |
| 4 | VIN | Supply 3.7–9 V (reverse-polarity protected) |
| 5 | RXD | Serial input, 0–3.3 V (only needed to send commands) |
| 6 | TXD | Serial output, 0–3.3 V, 9600 baud |
| 7 | PWM | PWM output (optional) |

The connector is 1.25 mm pitch, so it is wired with its cable and jumper leads, not plugged into a breadboard.

## Electrical limits
- Supply: 3.7–9 V (5 V recommended). Do not run it from 3.3 V.
- UART: 3 V logic levels, safe straight into an ESP32 or Pico.
- Operating 0–50 °C, 15–90 %RH non-condensing. Warm-up ≤ 3 min (5 min on first use); response ≤ 60 s.

## Interface details
- UART 9600 baud, 8 data bits, 1 stop bit, no parity.
- **Active upload (default)**, every second: `FF 17 04 00 CH CL RH RL SUM` — 0x17 = CH2O, 0x04 = unit ppb, 0x00 = no decimals; concentration = CH × 256 + CL ppb; full range = RH × 256 + RL (0x1388 = 5000 ppb).
- Checksum: SUM = (NOT (byte1 + … + byte7)) + 1, 8 bits (manual example `FF 17 04 00 00 25 13 88 25`).
- Q&A mode: send `FF 01 78 41 00 00 00 00 46`; then `FF 01 86 00 00 00 00 00 79` returns `FF 86 UGH UGL 00 00 PPBH PPBL SUM` (µg/m³ and ppb). Back to active upload: `FF 01 78 40 00 00 00 00 47`.

## Wiring
- ESP32: VIN → 5V (VIN/USB), GND → GND, TXD → GPIO16 (UART2 RX), RXD → GPIO17 (UART2 TX, optional).
- Pico: VIN → VBUS (5 V), GND → GND, TXD → GP1 (UART0 RX), RXD → GP0 (UART0 TX, optional).
- Raspberry Pi 4: VIN → pin 2 (5 V), GND → pin 6, TXD → pin 10 (RXD), RXD → pin 8 (TXD, optional).

## Using the driver
```python
from machine import UART, Pin
from ze08 import ZE08
uart = UART(2, baudrate=9600, tx=Pin(17), rx=Pin(16))
ppb = ZE08(uart).read_ppb()
print('CH2O=%d ppb (%.3f ppm)' % (ppb, ppb / 1000))
```

## Gotchas
- Leave HD unconnected: pulling it low re-zeroes the sensor in whatever air it is in.
- Alcohol, hydrogen, H2S and methanol read as formaldehyde (hand sanitiser will max it out).
- Readings drift for the first minutes after power-up; keep it out of strong drafts.
- Swap TXD/RXD if nothing arrives: module TXD goes to the board's RX.

## Datasheet
https://static.chipdip.ru/lib/395/DOC036395650.pdf
