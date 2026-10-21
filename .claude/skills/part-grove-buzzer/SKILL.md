---
name: part-grove-buzzer
description: Pinout, electrical limits, wiring and MicroPython code for the Seeed Grove Buzzer v1.1b (SKU 107020000; active 12 mm buzzer switched by an S9013 transistor, SIG/NC/VCC/GND). Use when designing, wiring, simulating or writing code for a Grove buzzer in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Grove Buzzer (v1.1b)

## Overview
An **active buzzer** (built-in oscillator, resonant 2300 ± 300 Hz, at least 85 dB) on a Grove board with its own transistor driver. Hobbyists buy it as the **Seeed Studio Grove - Buzzer (SKU 107020000)**. Per the Seeed v1.1b Eagle schematic, SIG goes through **1 kΩ** to the base of an **S9013 NPN** transistor. The buzzer's + lead is on **VCC** and its - lead goes to the collector, so SIG high = beep. There is **no base pull-down**.

## Pinout (Grove connector order)
| Pin | Wire | Function |
|---|---|---|
| SIG | yellow | Control input: high = beep, low = silent |
| NC | white | Not connected |
| VCC | red | Supply 3.3 V or 5 V (buzzer current comes from here) |
| GND | black | Ground |

## Electrical limits
- Supply: 3.3 V or 5 V (Seeed spec). Louder on 5 V.
- Buzzer current: a few tens of mA from VCC through the S9013 (rated 500 mA, 25 V).
- SIG draws only about 2.6 mA at 3.3 V ((3.3 − 0.7 V) / 1 kΩ), so any 3.3 V GPIO can drive it safely.

## Interface details
- Plain digital output: `Pin.value(1)` = beep, `Pin.value(0)` = quiet. No driver library needed.
- It is an active buzzer. PWM on SIG only chops its built-in tone on and off, so it cannot play clean notes.

## Wiring
- ESP32: VCC → 3V3 (or 5V for more volume), GND → GND, SIG → D25.
- Pico: VCC → 3V3(OUT) or VBUS, GND → GND, SIG → GP2.
- Raspberry Pi 4: VCC → pin 1 (3.3 V) or pin 2 (5 V), GND → pin 6, SIG → pin 18 (GPIO24).
- The board has a 2 mm Grove socket. Use a Grove-to-female-jumper cable (yellow = SIG, white = NC, red = VCC, black = GND).

## Using it
```python
from machine import Pin
import time
buzzer = Pin(25, Pin.OUT, value=0)  # SIG, start silent
buzzer.value(1); time.sleep(0.2); buzzer.value(0)   # one beep
```

## Gotchas
- Pin 2 of the Grove cable (white) is NC. The signal is on the yellow wire (pin 1).
- No pull-down on SIG. Create the pin with `value=0` so it does not chirp while the board boots.
- Do not expect melodies: it is an active buzzer with a fixed ~2.3 kHz tone.
- Old v1.0 boards drive the buzzer straight from SIG with no transistor. This note covers v1.1 and later.

## Datasheet
https://files.seeedstudio.com/wiki/Grove_Buzzer/resources/S9013.pdf (transistor); schematic https://files.seeedstudio.com/wiki/Grove_Buzzer/resources/Grove-Buzzer_V1.1_eagle.zip; product wiki https://wiki.seeedstudio.com/Grove-Buzzer/
