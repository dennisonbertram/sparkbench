---
name: part-ze07-co
description: Pinout, electrical limits, wiring and MicroPython driver for the Winsen ZE07-CO electrochemical carbon monoxide sensor module (ZE07-CO). Use when designing, wiring, simulating or writing code for a ZE07-CO in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# ZE07-CO carbon monoxide sensor (ZE07-CO)

## Overview
The **ZE07-CO** from Winsen is an electrochemical carbon monoxide module: range 0–500 ppm, resolution 0.1 ppm, built-in temperature compensation. By default it sends the concentration over a 9600-baud UART once a second (in 0.1 ppm steps); it also has a 0.4–2 V analog (DAC) output. Hobbyists buy the bare **Winsen ZE07-CO module** (25.4 × 22.4 mm board with the blue sensor can).

## Pinout (two pin rows on the underside)
| Pin | Name | Function |
|---|---|---|
| 1 | RES1 | Reserved: leave unconnected |
| 2 | NC2 | Not connected |
| 3 | RES3 | Reserved |
| 4 | RES4 | Reserved |
| 5 | GND | Ground |
| 6 | NC6 | Not connected (square pad of the 10-pin row) |
| 7 | RXD | UART input, 0–3.0 V (only needed to send commands) |
| 8 | TXD | UART output, 0–3.0 V, 9600 baud |
| 9 | RES9 | Reserved |
| 10 | DAC | Analog output 0.4–2 V for 0–500 ppm (optional) |
| 11–13 | NC11–NC13 | Not connected |
| 14 | GND2 | Second ground |
| 15 | VIN | Supply 5–12 V |

Pins 1–5 are one row, 6–15 the other, so the module is wired with jumper leads (or soldered to a carrier), not plugged into a breadboard.

## Electrical limits
- Supply: 5–12 V (5 V is easiest). **No reverse-polarity protection.** Do not run it from 3.3 V.
- UART: 3 V TTL levels, safe straight into an ESP32 or Pico.
- Operating −10–55 °C, 15–90 %RH non-condensing. Warm-up ≤ 3 min (5 min on first use); response ≤ 60 s.

## Interface details
- UART 9600 baud, 8 data bits, 1 stop bit, no parity.
- **Initiative upload (default)**, every second: `FF 04 03 01 CH CL RH RL SUM` — 0x04 = CO, 0x03 = unit ppm, 0x01 = one decimal; CO = (CH × 256 + CL) × 0.1 ppm; full range = RH × 256 + RL (0x1388 → 500.0 ppm).
- Checksum: SUM = (NOT (byte1 + … + byte7)) + 1, 8 bits (manual example `FF 04 03 01 00 25 13 88 38` = 3.7 ppm).
- Q&A mode: send `FF 01 78 41 00 00 00 00 46`; then `FF 01 86 00 00 00 00 00 79` returns `FF 86 CH CL 00 00 CH CL SUM` (× 0.1 ppm). Back to initiative upload: `FF 01 78 40 00 00 00 00 47`.

## Wiring
- ESP32: VIN → 5V (VIN/USB), GND → GND, TXD → GPIO16 (UART2 RX), RXD → GPIO17 (UART2 TX, optional).
- Pico: VIN → VBUS (5 V), GND → GND, TXD → GP1 (UART0 RX), RXD → GP0 (UART0 TX, optional).
- Raspberry Pi 4: VIN → pin 2 (5 V), GND → pin 6, TXD → pin 10 (RXD), RXD → pin 8 (TXD, optional).

## Using the driver
```python
from machine import UART, Pin
from ze07 import ZE07
uart = UART(2, baudrate=9600, tx=Pin(17), rx=Pin(16))
raw = ZE07(uart).read_raw()          # 0.1 ppm counts
print('CO=%d.%d ppm' % (raw // 10, raw % 10))
```
`read_ppm()` returns a float in ppm; `query_ppm()` is for Q&A mode.

## Gotchas
- Swapping VIN and GND destroys it: there is no reverse-polarity protection.
- Alcohol and other reducing gases read as CO (hand sanitiser nearby will push it up).
- Not a certified CO alarm: do not rely on it for life safety.
- Swap TXD/RXD if nothing arrives: module TXD goes to the board's RX.

## Datasheet
https://www.winsen-sensor.com/d/files/manual/ze07-co.pdf
