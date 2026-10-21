---
name: part-a02yyuw
description: Pinout, electrical limits, wiring and MicroPython driver for the DFRobot A02YYUW waterproof ultrasonic distance sensor (SEN0311, UART version). Use when designing, wiring, simulating or writing code for an A02YYUW in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build, e.g. water tank level monitoring.
---

# A02YYUW waterproof ultrasonic distance sensor, UART (DFRobot SEN0311)

## Overview
The **A02YYUW** is a sealed (IP67) ultrasonic ranging module: 3–450 cm, 1 mm resolution, ±1 cm accuracy, 3 cm blind zone, 60° beam. It needs no commands: it streams a 4-byte UART frame about every 100 ms. Modelled here: the **DFRobot A02YYUW Waterproof Ultrasonic Sensor (SEN0311, UART version)** with its PH2.0-4P cable. (PWM and RS485 versions exist and are different parts.)

## Pinout (connector order)
| Pin | Wire | Function |
|---|---|---|
| VCC | red | Supply, 3.3–5 V |
| GND | black | Ground |
| RX | yellow | Output mode select (input): floating/high = processed value, low = real-time value. Optional |
| TX | white | Serial output, 9600 baud. Connect to the board's **RX** |

## Electrical limits
- Supply: 3.3–5 V; standby ≤ 5 mA, average ≤ 8 mA.
- TX logic follows VCC: power it from 3.3 V on an ESP32 or Pico.
- Operating temperature −15 to 60 °C.

## Interface details
- UART 9600 baud, 8-N-1, TTL level.
- Frame: `0xFF DATA_H DATA_L SUM`; distance mm = DATA_H × 256 + DATA_L; SUM = (0xFF + DATA_H + DATA_L) & 0xFF.
- Example from DFRobot: `FF 07 A1 A7` → 0x07A1 = 1953 mm.
- Processed mode response 100–300 ms; real-time mode 100 ms.

## Wiring
- ESP32: VCC → 3V3, GND → GND, TX → GPIO16 (RX2), RX → GPIO17 (TX2) or leave unconnected, UART(2).
- Pico: VCC → 3V3(OUT), GND → GND, TX → GP1 (UART0 RX), RX → GP0 (UART0 TX) or leave unconnected, UART(0).
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, TX → pin 10 (RXD).

## Using the driver
```python
from machine import UART, Pin
from a02yyuw import A02YYUW
u = UART(2, baudrate=9600, tx=Pin(17), rx=Pin(16))
s = A02YYUW(u)
print(s.distance_mm(), 'mm')
```
`distance_mm()` flushes stale bytes, resyncs on the 0xFF header, checks the checksum and returns mm or `None` on timeout.

## Gotchas
- No data: TX wired to the board's TX instead of RX, wrong baud, or a PWM/RS485 version of the sensor.
- The low distance byte can itself be 0xFF, so always verify the checksum when resyncing.
- Old frames queue up while your code sleeps; flush before reading.
- Don't trust readings under 30 mm or over 4500 mm; keep the 60° cone clear of tank walls.

## Datasheet
https://wiki.dfrobot.com/sen0311/docs/21651 (DFRobot SEN0311 wiki: communication protocol; specification and pinout on https://wiki.dfrobot.com/sen0311/)
