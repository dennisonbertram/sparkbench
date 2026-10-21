---
name: part-gravity-crash-sensor
description: Pinout, electrical limits, wiring and MicroPython driver for the DFRobot Gravity Digital Crash Sensor (SEN0138-L / SEN0138-R, roller-lever micro switch with 10 kOhm pull-up and status LED, pins D/VCC/GND). Use when designing, wiring, simulating or writing code for a Gravity crash sensor, bumper or end-stop switch in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Gravity Digital Crash Sensor (DFRobot SEN0138)

## Overview
The **DFRobot Gravity: Digital Crash Sensor** (SKU SEN0138-L, lever on the left; SEN0138-R, lever on the right) is a miniature snap-action micro switch with a roller lever on a 30 × 20 mm board with a 3-pin Gravity header. It is used as a robot bumper, an end-stop or a door/limit switch. There is no chip on it. Per DFRobot's schematic (v1.0):
- **R2 = 10 kΩ** pulls D up to VCC.
- The switch **K** shorts D to GND while the lever is pressed.
- A status **LED with R1 = 1 kΩ** runs from VCC to D, so it lights while the lever is pressed.

So D reads **1 when released** and **0 when pressed** (active low).

## Pinout (Gravity header, board order)
| Pin | Label | Function |
|---|---|---|
| 1 | D | Digital output: high (VCC through 10 kΩ) when released, low when pressed |
| 2 | VCC | Supply |
| 3 | GND | Ground |

## Electrical limits
- DFRobot lists a 5 V working voltage (Arduino/IO shield use). The board is passive (switch, two resistors, an LED), so it also works at 3.3 V; the LED is just dimmer.
- The high level on D equals VCC. **On an ESP32 / Pico power VCC from 3.3 V**, never 5 V, or D idles at 5 V.
- Current: practically zero while released; about 1.8 mA at 3.3 V (about 3.7 mA at 5 V) while pressed (LED through 1 kΩ plus the 10 kΩ pull-up).

## Interface details
- Plain digital input: `Pin(n, Pin.IN)`. No internal pull-up is needed, the board has a 10 kΩ one.
- **0 = pressed (crash), 1 = released.**
- Contacts bounce for a few ms: the driver debounces (10 ms of stable readings).

## Wiring
- ESP32: VCC → 3V3, GND → GND, D → GPIO4.
- Pico: VCC → 3V3(OUT), GND → GND, D → GP15.
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, D → GPIO17 (pin 11).

## Using the driver
```python
from crash_sensor import CrashSensor
import time
crash = CrashSensor(4)   # GPIO wired to D
while True:
    print('CRASH=%d' % crash.is_pressed())
    time.sleep(0.2)
```
`crash.irq(handler)` calls `handler(pin)` on each press (falling edge).

## Gotchas
- Powering it from 5 V on a 3.3 V board puts 5 V on the GPIO through 10 kΩ: use the 3.3 V pin.
- Logic is inverted: the LED lights and D reads 0 while pressed.
- Contacts bounce: expect several interrupts per press unless you debounce.

## Datasheet
Schematic: https://dfimg.dfrobot.com/wiki/22387/SEN0138-L_digital-crash-sensor_schematics_v1.0.pdf
Wiki: https://wiki.dfrobot.com/sen0138-l/
