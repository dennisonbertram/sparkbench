---
name: part-grove-vibration-motor
description: Pinout, electrical limits, wiring and MicroPython code for the Seeed Grove Vibration Motor v1.2 (SKU 105020003; ANDA-B1020 coin motor switched by an S9013 transistor, SIG/NC/VCC/GND). Use when designing, wiring, simulating or writing code for a Grove vibration motor in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Grove Vibration Motor (v1.2)

## Overview
A **10 mm coin vibration motor** (ANDA-B1020, 3 V rated, 60 mA typical) on a Grove board with its own transistor driver. Hobbyists buy it as the **Seeed Studio Grove - Vibration Motor (SKU 105020003)**. Per the Seeed v1.2 Eagle schematic, SIG goes through **1 kΩ** to the base of an **S9013 NPN** transistor (**100 kΩ** base pull-down). The motor runs from **VCC through a 12 Ω** resistor into the collector. The flyback diode footprint (D1) is **not fitted (DNP)**.

## Pinout (Grove connector order)
| Pin | Wire | Function |
|---|---|---|
| SIG | yellow | Control input: high = vibrate, low/unconnected = off, PWM = strength |
| NC | white | Not connected |
| VCC | red | Supply 3.0–5.5 V (motor current comes from here) |
| GND | black | Ground |

## Electrical limits
- Supply: 3.0–5.5 V (Seeed spec, 5 V typical). Motor rated 3.0 V, operating 2.4–3.6 V; the 12 Ω resistor and transistor drop take up the extra on 5 V.
- Motor current: about 50 mA at 3.3 V, about 80 mA at 5 V; starting current up to 110 mA (ANDA-B1020: 70 mA max rated, 110 mA max start).
- SIG draws only about 2.6 mA at 3.3 V ((3.3 − 0.7 V) / 1 kΩ), so any 3.3 V GPIO can drive it safely.

## Interface details
- Plain digital output: `Pin.value(1)` = vibrate, `Pin.value(0)` = stop. No driver library needed.
- Strength: `machine.PWM(Pin(n), freq=1000, duty_u16=...)`. The motor needs about 2.3 V across it to start, so low duty may not spin it.

## Wiring
- ESP32: VCC → 3V3 (or 5V for a stronger buzz), GND → GND, SIG → D25.
- Pico: VCC → 3V3(OUT) or VBUS, GND → GND, SIG → GP2.
- Raspberry Pi 4: VCC → pin 1 (3.3 V) or pin 2 (5 V), GND → pin 6, SIG → pin 18 (GPIO24).
- The board has a 2 mm Grove socket. Use a Grove-to-female-jumper cable (yellow = SIG, white = NC, red = VCC, black = GND).

## Using it
```python
from machine import Pin, PWM
import time
motor = Pin(25, Pin.OUT, value=0)  # SIG
motor.value(1); time.sleep(0.5); motor.value(0)   # one buzz
pwm = PWM(Pin(25), freq=1000, duty_u16=40000)     # gentler buzz
```

## Gotchas
- Pin 2 of the Grove cable (white) is NC: the signal is on the yellow wire (pin 1).
- No flyback diode is fitted. Keep PWM at about 1 kHz or lower.
- Motor brushes make electrical noise. Keep the motor away from analog sensor wires, and share GND.
- Old v1.0 boards drive the motor straight from the I/O pin with no transistor. This note covers v1.2 and later.

## Datasheet
https://files.seeedstudio.com/wiki/Grove-Vibration_Motor/res/ANDA-B1020_datasheet.pdf (motor); schematic https://files.seeedstudio.com/wiki/Grove-Vibration_Motor/res/Grove-Vibration_Motor_Eagle_Files.zip; product wiki https://wiki.seeedstudio.com/Grove-Vibration_Motor/
