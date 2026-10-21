---
name: part-m5stack-unit-vibrator
description: Pinout, electrical limits, wiring and MicroPython code for the M5Stack Unit Vibrator (SKU U059; N20 DC motor with a metal eccentric weight, switched by an AO3400A N-MOSFET, Grove HY2.0-4P GND/5V/DIN/NC). Use when designing, wiring, simulating or writing code for an M5Stack vibrator / vibration motor unit in a Sparkbench project or any ESP32 / M5Stack / Raspberry Pi Pico / Raspberry Pi build.
---

# M5Stack Unit Vibrator (U059)

## Overview
A strong haptic / vibration unit from M5Stack: an **N20 DC motor (8800 rpm no-load) with a brass eccentric weight**, switched on its low side by an **AO3400A N-channel MOSFET**. Per the M5Stack schematic, DIN goes through **1 kΩ** to the MOSFET gate, with a **51 kΩ** gate pull-down; a **1N4148WS** flyback diode and a 100 nF capacitor sit across the motor, which runs from the Grove 5 V. Hobbyists buy it as the **M5Stack Unit Vibrator (SKU U059)**, with a 20 cm Grove cable. It turns one way only (no braking or reverse).

## Pinout (Grove HY2.0-4P, order and names from the M5Stack PinMap)
| Pin | Wire | Function |
|---|---|---|
| GND | black | Ground (share with the microcontroller) |
| 5V | red | Motor supply, 5 V (about 425 mA at 50 % PWM) |
| DIN | yellow | Control: high = vibrate, low/unconnected = off, PWM = strength |
| NC | white | Not connected |

## Electrical limits
- Supply 5 V. M5Stack measured **424 mA at 5 V with 10 kHz PWM at 50 % duty**; full-on and start-up draw more. That is more than a dev board's 5V pin should feed alongside the MCU: use a separate 5 V supply (1 A or more) with a common ground, or an M5Stack Core's Grove port.
- DIN: logic-level MOSFET gate (VGS(th) 0.65–1.45 V, RDS(on) < 48 mΩ at 2.5 V), so 3.3 V and 5 V logic both switch it fully. Gate current is only the 51 kΩ pull-down (about 65 µA at 3.3 V).
- MOSFET rating 30 V / 5.7 A, far above the motor's needs.

## Interface details
- Plain digital output: `Pin.value(1)` = vibrate, `Pin.value(0)` = stop. No driver library needed.
- Strength: `machine.PWM(Pin(n), freq=10000, duty_u16=...)`. M5Stack recommends **10 kHz**; their example uses 50 % duty. Very low duty may not start the motor.
- UiFlow2's `VibratorUnit.once(freq, duty, duration)` instead pulses the motor at 10–55 Hz for a "buzzing" haptic effect.

## Wiring
- M5Stack Core (Port B): plug in the Grove cable; DIN = GPIO26.
- ESP32: GND → GND, DIN → GPIO26, 5V → separate 5 V supply (+), supply − → GND.
- Pico: GND → GND, DIN → GP15, 5V → separate 5 V supply, grounds joined.
- Raspberry Pi 4: GND → pin 6, DIN → pin 11 (GPIO17), 5V → separate 5 V supply, grounds joined.

## Using it
```python
from machine import Pin, PWM
import time
motor = Pin(26, Pin.OUT, value=0)  # DIN
motor.value(1); time.sleep(0.3); motor.value(0)    # one buzz
pwm = PWM(Pin(26), freq=10000, duty_u16=32768)     # 50 % strength
```

## Gotchas
- This is a big N20 motor, not a coin motor: about 0.4 A or more. Do not run it from a 3.3 V pin, and be careful with a USB-powered dev board's 5V pin.
- The white wire is not connected. On an M5Stack Core's Port B, drive the yellow wire (GPIO26), not GPIO36.
- The spinning brass weight is exposed: keep fingers, hair and wires clear and mount the unit firmly (LEGO-compatible holes).
- Motor brushes make electrical noise; keep it away from analog sensor wiring.

## Datasheet
https://www.aosmd.com/res/datasheets/AO3400A.pdf (AO3400A MOSFET). Product page: https://docs.m5stack.com/en/unit/vibrator. Schematic: https://static-cdn.m5stack.com/resource/docs/products/unit/unit_fan/unit_fan_sch_01.webp
