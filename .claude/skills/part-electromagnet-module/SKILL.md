---
name: part-electromagnet-module
description: Pinout, electrical limits, wiring and MicroPython code for the 5 V electromagnet module (Keyestudio Electromagnet Module KS0320 with a P20/15 / KK-P20/15 holding magnet). Use when designing, wiring, simulating or writing code for an electromagnet module in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Electromagnet module (KS0320, P20/15 magnet)

## Overview
A **5 V holding electromagnet** (20 mm diameter x 15 mm, the P20/15 size sold as KK-P20/15 or ZYE1-P20/15) on a small board with an **on-board SOT-23 transistor switch** and a **flyback diode** across the coil. Hobbyists buy it as the **Keyestudio Electromagnet Module KS0320** (black board). SIG high energises the coil and it holds about 1 kg of iron. SIG low releases it. PWM on SIG weakens the pull.

## Pinout (KS0320, header order as printed on the board)
| Pin | Function |
|---|---|
| GND | Ground |
| VCC | 5 V coil supply |
| NC | Not connected |
| SIG | Control input: high = magnet on, low = off, PWM = strength |

## Electrical limits
- Supply: 5 V DC (Keyestudio spec "Working Voltage: DC 5V"). At 3.3 V the pull is much weaker.
- Coil current: 0.3 A maximum and 3 W maximum per Keyestudio. Seeed's Grove module with the same P20/15 magnet quotes 400 mA, so budget about 0.4 A.
- Magnet (ZYE1-P20/15 datasheet): Φ20 mm x 15 mm, 3 W, 25 N rated holding force on flat iron at least 5 mm thick.
- SIG only drives the transistor, so a 3.3 V GPIO is enough. The coil current never flows through the GPIO.

## Interface details
- Plain digital output: `Pin.value(1)` = hold, `Pin.value(0)` = release. No driver library needed.
- Strength: `machine.PWM(Pin(n), freq=1000, duty_u16=...)`. Keyestudio's second example uses PWM on SIG to vary the field.

## Wiring
- ESP32: VCC → VIN/5V, GND → GND, SIG → D25, NC unconnected.
- Pico: VCC → VBUS (pin 40), GND → GND, SIG → GP2.
- Raspberry Pi 4: VCC → pin 2 (5 V), GND → pin 6, SIG → pin 18 (GPIO24).

## Using it
```python
from machine import Pin, PWM
import time
magnet = Pin(25, Pin.OUT, value=0)   # SIG
magnet.value(1); time.sleep(2); magnet.value(0)   # grab, then drop
pwm = PWM(Pin(25), freq=1000, duty_u16=30000)     # weaker hold
```

## Gotchas
- The coil draws up to about 0.4 A. Use the 5 V / USB rail or a separate 5 V supply with a shared ground, never the 3.3 V pin.
- The coil heats up if it stays on for a long time. Switch it off when it is not holding anything.
- It only holds well on flat, thick iron or steel. Aluminium, brass and most stainless steel are not attracted.
- Never connect a bare electromagnet coil straight to a GPIO. This module exists because the coil needs a transistor and a flyback diode.

## Datasheet
https://files.seeedstudio.com/wiki/Bazaar_file/101020073/ZYE1-P%20electro%20holding%20magnets.pdf (ZYE1-P20/15 magnet); module wiki https://wiki.keyestudio.com/KS0320_Keyestudio_Electromagnet_Module_(Black_and_Environmental-friendly)
