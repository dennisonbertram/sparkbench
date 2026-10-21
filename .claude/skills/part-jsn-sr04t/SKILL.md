---
name: part-jsn-sr04t
description: Pinout, electrical limits, wiring and MicroPython driver for the JSN-SR04T waterproof ultrasonic distance sensor (JSN-SR04T-2.0, TRIG/ECHO mode). Use when designing, wiring, simulating or writing code for a JSN-SR04T in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build, e.g. water tank level monitoring.
---

# JSN-SR04T waterproof ultrasonic distance sensor (JSN-SR04T-2.0)

## Overview
The **JSN-SR04T** is a sealed, waterproof 40 kHz ultrasonic probe on a cable, plus a small control board. In its default mode it behaves like an HC-SR04: pulse TRIG, time the ECHO pulse. Range about 20–600 cm (datasheet), blind zone 20 cm (many sellers quote 25–450 cm), ±1 cm, 75° cone. Modelled here: the **JSN-SR04T-2.0 waterproof ultrasonic module** (blue control board, 4-pin header 5V / Trig / Echo / GND, R27 open = mode 1, 2.5 m probe cable).

## Pinout (header order)
| Pin | Function |
|---|---|
| 5V | Supply, 3.0–5.5 V (despite the label) |
| Trig | Trigger input: high ≥ 10 µs starts a measurement (RX in serial modes) |
| Echo | Echo output: high for the round trip (TX in serial modes) |
| GND | Ground |

## Electrical limits
- Supply: 3.0–5.5 V DC; working current under 8 mA.
- ECHO swings to the supply voltage: at 5 V it is NOT safe on an ESP32/Pico pin without a divider.
- Operating temperature −20 to +70 °C.

## Interface details
- Mode 1 (R27 open, default): TRIG high ≥ 10 µs → module sends 8 × 40 kHz → ECHO high for the round trip.
- Distance = high time × 340 m/s / 2, i.e. **cm = µs / 58.82**.
- No echo: ECHO stays high about 38 ms (and goes low by 60 ms at the latest). Treat > ~36 ms as out of range.
- Cycle period ≥ 50 ms (driver waits 60 ms).
- R27 = 47 kΩ: automatic 9600-baud serial frames every 100 ms (0xFF, H, L, SUM; distance in mm). R27 = 120 kΩ: send 0x55 for one frame. This part models mode 1 only.

## Wiring
- ESP32: 5V → 3V3, GND → GND, Trig → GPIO25, Echo → GPIO26. (If you power it from 5V/VIN, put a 1 kΩ / 2 kΩ divider on Echo.)
- Pico: 5V → 3V3(OUT), GND → GND, Trig → GP2, Echo → GP3.
- Raspberry Pi 4: 5V → pin 1 (3.3 V), GND → pin 6, Trig → GPIO23, Echo → GPIO24.

## Using the driver
```python
from jsnsr04t import JSNSR04T
s = JSNSR04T(25, 26)          # trig, echo GPIO numbers
d = s.distance_cm()           # float cm, or None if out of range / no echo
print('out of range' if d is None else 'D=%dcm' % round(d))
```

## Gotchas
- Readings under ~20–25 cm are in the blind zone and are wrong.
- At 3.3 V some boards miss triggers with a 10 µs pulse; the driver uses 20 µs (still within spec).
- Aim the probe square at a flat surface; foam, angled or small targets may give no echo.
- Board versions differ (V3.0 uses M1/M2 pads instead of R27); check the silkscreen.

## Datasheet
https://components101.com/sites/default/files/component_datasheet/JSN-SR04-Datasheet.pdf (JSN-SR04T-2.0 datasheet)
