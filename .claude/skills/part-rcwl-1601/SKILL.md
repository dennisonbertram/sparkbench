---
name: part-rcwl-1601
description: Pinout, electrical limits, wiring and MicroPython driver for the RCWL-1601 3.3 V / 5 V ultrasonic distance sensor (HC-SR04 compatible, Adafruit 4007). Use when designing, wiring, simulating or writing code for an RCWL-1601 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# RCWL-1601 ultrasonic distance sensor (RCWL-1601)

## Overview
The **RCWL-1601** is a smaller, low-voltage HC-SR04: same Trig/Echo protocol and pin order, but it runs on **3.0-5.5 V** and its Echo output follows VCC, so on 3.3 V it connects straight to ESP32/Pico pins. Range about 2-450 cm (about 400 cm at 3.3 V), 1 mm resolution, 40 kHz, ±15° beam, 50 ms cycle. Modelled here: the **Adafruit Ultrasonic Distance Sensor - 3V or 5V - HC-SR04 compatible - RCWL-1601 (#4007)**.

## Pinout (header order, sensors facing you)
| Pin | Function |
|---|---|
| Vcc | Supply, 3.0-5.5 V |
| Trig | Trigger input (also printed RX/SCL for unfitted UART/I2C modes) |
| Echo | Echo output, high for the round-trip time (also printed TX/SDA) |
| Gnd | Ground |

## Electrical limits
- Supply: 3.0-5.5 V; current about 2.2 mA.
- Echo high level = Vcc: power from 3.3 V on 3.3 V boards (never 5 V there without a divider).
- Operating temperature: -10 to +90 °C (probe).

## Interface details
- Pull Trig high ≥ 10 µs. Echo then goes high for the sound's round trip.
- Distance cm = echo µs × 0.0343 / 2 (≈ µs / 58.3 at 20 °C).
- Wait ≥ 50 ms between measurements. A 30 ms timeout covers 450 cm.

## Wiring
- ESP32: Vcc → 3V3, Gnd → GND, Trig → GPIO25, Echo → GPIO26.
- Pico: Vcc → 3V3(OUT), Gnd → GND, Trig → GP2, Echo → GP3.
- Raspberry Pi 4: Vcc → pin 1 (3.3 V), Gnd → pin 6, Trig → GPIO5 (pin 29), Echo → GPIO6 (pin 31).

## Using the driver
```python
from rcwl1601 import RCWL1601
s = RCWL1601(25, 26)          # Trig, Echo GPIO numbers
print(s.distance_cm(), 'cm')  # None if no echo
```

## Gotchas
- Soft, angled or very close (< 2 cm) targets give no echo or wild values.
- Speed of sound changes about 0.6 m/s per °C; for better accuracy use 331.3 + 0.606 × T m/s.
- Some sellers' RCWL-1601 boards are I2C-only (Vcc/SCL/SDA/Gnd, address 0x57): check the labels; this part is the Trig/Echo version.
- Do not trigger faster than every 50 ms, or late echoes from the last ping are read as near objects.

## Datasheet
https://www.adafruit.com/product/4007 (Adafruit technical details table, copied from the RCWL datasheet; no public manufacturer PDF)
