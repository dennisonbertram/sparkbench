---
name: part-hpma115s0
description: Pinout, electrical limits, wiring and MicroPython driver for the HPMA115S0 laser PM2.5/PM10 particle sensor (Honeywell HPMA115S0-XXX). Use when designing, wiring, simulating or writing code for an HPMA115S0 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# HPMA115S0 laser PM2.5/PM10 particle sensor (HPMA115S0-XXX)

## Overview
The **Honeywell HPMA115S0-XXX** (HPM Series, standard size, 43×36×23.7 mm) measures **PM2.5 and PM10** (0–1000 µg/m³, 1 µg/m³ steps; PM2.5 ±15 µg/m³ below 100 µg/m³, ±15 % above) with a laser and a built-in fan, and reports over a 9600-baud UART. Hobbyists buy the bare sensor with an 8-pin Molex 51021-0800 (1.25 mm) cable.

## Pinout (connector pins 1–8, from datasheet Table 3)
| Pin | Name | Function |
|---|---|---|
| 1 | VOUT | 3.3 V output (100 mA max), leave open |
| 2 | VCC | Supply input, 5 V ±0.2 V |
| 3 | N/A (NC3) | Not used |
| 4 | N/A (NC4) | Not used |
| 5 | RES | Reserved, leave open |
| 6 | TX | Sensor UART TX (0–3.3 V) → board RX |
| 7 | RX | Sensor UART RX (0–3.3 V) ← board TX |
| 8 | GND | Ground |

## Electrical limits
- Supply 5 V ±0.2 V, < 80 mA running, < 20 mA standby, 600 mA max inrush; ripple ≤ 20 mV (add 22 µF + 100 nF + 10 nF if the rail is noisy).
- UART levels 0–3.3 V: direct to ESP32 / Pico.
- Operating −20 to 50 °C, 0–95 %RH non-condensing.

## Interface details
- UART 9600 baud, 8N1.
- **Auto-send** (factory default), 32 bytes: `42 4D 00 1C` + 13 big-endian 16-bit words + checksum.
  Word 0 reserved, **word 1 = PM2.5** (bytes 6–7), **word 2 = PM10** (bytes 8–9), words 3–12 reserved.
  Checksum (bytes 30–31) = 16-bit sum of bytes 0–29.
- **Commands**: `68 LEN CMD [DATA] CS`, CS = (65536 − (HEAD+LEN+CMD+DATA)) mod 256. ACK `A5 A5`, NACK `96 96`.
  - Read result `68 01 04 93` → `40 05 04 DF1 DF2 DF3 DF4 CS`; PM2.5 = DF1×256+DF2, PM10 = DF3×256+DF4
  - Start measurement `68 01 01 96`; stop measurement (fan off) `68 01 02 95`
  - Stop auto-send `68 01 20 77`; enable auto-send `68 01 40 57`
  - Set adjustment coefficient (30–200, default 100) `68 02 08 64 2A`; read it `68 01 10 87` → `40 02 10 64 4A`

## Wiring
- ESP32: VCC → VIN (5 V), GND → GND, TX → GPIO16 (RX2), RX → GPIO17 (TX2).
- Pico: VCC → VBUS, GND → GND, TX → GP1 (UART0 RX), RX → GP0 (UART0 TX).
- Raspberry Pi: VCC → pin 2 (5 V), GND → pin 6, TX → pin 10 (RXD), RX → pin 8 (TXD).

## Using the driver
```python
from machine import UART, Pin
from hpma115s0 import HPMA115S0
uart = UART(2, baudrate=9600, tx=Pin(17), rx=Pin(16))
s = HPMA115S0(uart)
r = s.read()            # (pm2_5, pm10) from the next auto-send frame, or None
if r:
    print('PM2.5=%d PM10=%d' % r)
```
Polled mode: `s.stop_auto_send()` then `s.read_measurement()`. `start()`, `stop()`, `enable_auto_send()`, `set_coefficient(k)`, `read_coefficient()` send the datasheet commands.

## Gotchas
- Never feed VCC from 3V3, and never feed anything into VOUT: it is an output.
- Swap TX/RX if nothing arrives (sensor TX → board RX).
- In auto-send mode, the sensor's frames can collide with command replies; stop auto-send before polling.
- The bare connector is 1.25 mm pitch: use the matching Molex cable, not breadboard jumpers.
- Keep the inlet and fan outlet unobstructed and mount in a datasheet orientation.
- Simulator note: Sparkbench models the auto-send stream and the ACK replies. It does not model the polled `40 05 04` reply, so use the auto-send example in simulation.

## Datasheet
https://prod-edam.honeywell.com/content/dam/honeywell-edam/sps/siot/en-us/products/sensors/particulate-matter-sensors-hpm-series/documents/sps-siot-particulate-hpm-series-datasheet-32322550-ciid-165855.pdf
