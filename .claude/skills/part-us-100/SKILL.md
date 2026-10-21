---
name: part-us-100
description: Pinout, electrical limits, wiring and MicroPython driver for the US-100 ultrasonic distance sensor in UART mode (US-100). Use when designing, wiring, simulating or writing code for a US-100 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# US-100 ultrasonic distance sensor, UART mode (US-100)

## Overview
The **US-100** looks like an HC-SR04 but runs on 2.4–5.5 V and has a temperature sensor for speed-of-sound compensation. It measures about 2–450 cm (best at 10–250 cm), accurate to about 3 mm + 1 %. With the **mode jumper on the back fitted** it talks 9600-baud serial instead of trigger/echo pulses. Modelled here: the **Adafruit US-100 Ultrasonic Distance Sensor - 3V or 5V Logic (#4019)**, the same as the common clone module.

## Pinout (header order)
| Pin | Function |
|---|---|
| VCC | Supply, 2.4–5.5 V |
| Trig/TX | UART mode: module's serial **input**. Connect to the board's **TX** |
| Echo/RX | UART mode: module's serial **output**. Connect to the board's **RX** |
| GND | Ground |
| GND | Second ground (joined to the first; optional) |

## Electrical limits
- Supply: 2.4–5.5 V (Adafruit spec); logic levels follow VCC, so power it from 3.3 V on an ESP32 or Pico.
- Current: about 2 mA.
- Operating temperature: −20 to +70 °C.

## Interface details
- UART 9600 baud, 8-N-1. Jumper must be fitted.
- Distance: send **0x55**, read 2 bytes (high first): distance mm = high × 256 + low.
- Temperature: send **0x50**, read 1 byte: °C = byte − 45.
- Allow 100–300 ms for the distance reply.

## Wiring
Note the labels: TX goes to TX and RX goes to RX (Adafruit: "this is not the case with this sensor" about the usual crossover).
- ESP32: VCC → 3V3, GND → GND, Trig/TX → GPIO17 (TX2), Echo/RX → GPIO16 (RX2), UART(2).
- Pico: VCC → 3V3(OUT), GND → GND, Trig/TX → GP0 (UART0 TX), Echo/RX → GP1 (UART0 RX), UART(0).
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, Trig/TX → pin 8 (TXD), Echo/RX → pin 10 (RXD).

## Using the driver
```python
from machine import UART, Pin
from us100 import US100
u = UART(2, baudrate=9600, tx=Pin(17), rx=Pin(16))
s = US100(u)
print(s.distance_mm(), 'mm', s.temperature(), 'C')
```

## Gotchas
- No reply at all: the jumper is missing (pulse mode), or TX/RX are crossed the "usual" way.
- Soft, angled or very close (< 2 cm) targets give no echo or wild values; ignore readings outside about 20–4500 mm.
- The temperature is the module's own, whole degrees only.

## Datasheet
https://ocw.cs.pub.ro/courses/_media/pm/prj2023/alucaci/us_100.pdf (Adafruit #4019 product sheet; protocol also in Adafruit's CircuitPython US100 library)
