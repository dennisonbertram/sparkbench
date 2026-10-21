---
name: part-sds011
description: Pinout, electrical limits, wiring and MicroPython driver for the SDS011 laser PM2.5/PM10 dust sensor (Nova Fitness SDS011). Use when designing, wiring, simulating or writing code for an SDS011 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# SDS011 laser PM2.5/PM10 dust sensor (SDS011)

## Overview
The **Nova Fitness SDS011** counts airborne particles with a laser and a built-in fan and reports **PM2.5 and PM10** (0.0–999.9 µg/m³, 0.1 µg/m³ resolution, ±15 % / ±10 µg/m³) once a second over a 9600-baud UART. Hobbyists buy the **SDS011 module itself** (71×70×23 mm, 7-pin 2.54 mm header), usually bundled with a USB-serial adapter.

## Pinout (SDS011 module, header order, from the datasheet)
| Pin | Name | Function |
|---|---|---|
| 1 | NC | Not connected |
| 2 | 1um | PM2.5 PWM output (optional) |
| 3 | 5V | Supply, 4.7–5.3 V |
| 4 | 2.5um | PM10 PWM output (optional) |
| 5 | GND | Ground |
| 6 | R | Sensor UART RX (3.3 V TTL) → board TX |
| 7 | T | Sensor UART TX (3.3 V TTL) → board RX |

## Electrical limits
- Supply: 4.7–5.3 V, ripple < 20 mV, > 1 W; 70 ± 10 mA running, < 4 mA asleep.
- UART levels 3.3 V TTL: safe for ESP32 and Pico directly.
- Operating: −10 to 50 °C, ≤ 70 % RH. Laser life about 8000 h.

## Interface details
- UART 9600 baud, 8N1. Factory default **active mode**: one 10-byte frame per second:
  `AA C0 PM25_L PM25_H PM10_L PM10_H ID1 ID2 SUM AB`.
- SUM = low 8 bits of the six data bytes (PM25_L … ID2).
- PM2.5 = (PM25_H × 256 + PM25_L) / 10 µg/m³; PM10 likewise.
- Commands are 19 bytes: `AA B4 <cmd> <14 data bytes incl. ID FF FF> SUM AB` (SUM over the 15 data bytes).
  Query data: `AA B4 04 00…00 FF FF 02 AB`; sleep: `AA B4 06 01 00 … FF FF 05 AB`; work: `AA B4 06 01 01 … FF FF 06 AB`.
  Replies to settings start `AA C5`.

## Wiring
- ESP32: 5V → VIN (5 V), GND → GND, T → GPIO16 (RX2), R → GPIO17 (TX2).
- Pico: 5V → VBUS, GND → GND, T → GP1 (UART0 RX), R → GP0 (UART0 TX).
- Raspberry Pi 4: 5V → pin 2, GND → pin 6, T → pin 10 (RXD), R → pin 8 (TXD).

## Using the driver
```python
from machine import UART, Pin
from sds011 import SDS011
uart = UART(2, baudrate=9600, tx=Pin(17), rx=Pin(16))
s = SDS011(uart)
r = s.read()          # (pm2_5, pm10) or None until a frame arrives
if r:
    print('PM2.5=%.1f PM10=%.1f' % r)
```
`sleep()`, `wake()`, `query()`, `set_query_mode()`, `set_active_mode()`, `set_period(minutes)` send the protocol commands.

## Gotchas
- Never power it from 3V3: the fan and laser need 5 V.
- Swap T/R if nothing arrives: sensor T goes to the board's RX.
- Data are stable about 30 s after power-up or wake; sleep between readings to save the laser.
- Reporting mode and working period are stored in the sensor; sleep is not (it wakes on power-up).
- Keep the inlet/outlet unobstructed and out of direct light.

## Datasheet
https://cdn-reichelt.de/documents/datenblatt/X200/SDS011-DATASHEET.pdf
Control protocol: https://cdn.sparkfun.com/assets/parts/1/2/2/7/5/Laser_Dust_Sensor_Control_Protocol_V1.3.pdf
