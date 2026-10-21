---
name: part-grove-relay
description: Pinout, electrical limits, wiring and MicroPython code for the Seeed Grove - Relay v1.2 (SKU 103020005; HLS8L-DC3V-S-C 3 V relay on an XC6206 3.0 V regulator, S8050 driver, Grove SIG/NC/VCC/GND, active-high). Use when designing, wiring, simulating or writing code for a Grove Relay in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Seeed Grove - Relay (v1.2)

## Overview
A single **HLS8L-DC3V-S-C** relay (HLS8-T73 series, 3 V coil, 25 Ω) on a Grove board. An **XC6206P302MR** LDO makes a 3.0 V coil supply from VCC, so the module works from 3.3 V or 5 V. SIG drives an **S8050** NPN transistor through 4.7 kΩ (47 kΩ pull-down to GND, so a floating SIG keeps the relay off); a 1N4148 flyback diode and a red LED (470 Ω) sit across the coil. **SIG high = relay on.** The relay itself is SPDT, but the board's 2-way screw terminal only brings out **NO ("ON") and COM**: it is a normally-open switch. Hobbyists buy it as **Seeed Grove - Relay, SKU 103020005**.

## Pinout (Grove connector J2, schematic order)
| Pin | Wire | Function |
|---|---|---|
| SIG | yellow | Control input, high = relay on |
| NC | white | Not connected |
| VCC | red | Supply 3.3–5 V |
| GND | black | Ground |

Load side: 2-way screw terminal **ON (NO)** and **COM** on the opposite edge, so the module is wired with a Grove-to-jumper cable, not plugged into the breadboard.

## Electrical limits
- VCC 3.3–5 V (Seeed wiki, v1.2). About 100–130 mA while the relay is on (coil 120 mA at 3 V plus LED), a few µA when off.
- Relay coil (HLS8-T73 3 VDC, 0.36 W): 25 Ω ±10 %, pull-in 2.25 V max, drop-out 0.3 V min, max 3.9 V. The on-board 3.0 V LDO feeds it.
- Load: Seeed rates the board 5 A at 250 VAC / 30 VDC (the bare relay is rated higher; use the board figure). Electrical life 100,000 operations.
- Operate 10 ms max, release 5 ms max.
- SIG: 3.3 V or 5 V logic, about 0.5 mA into the 4.7 kΩ base resistor.

## Interface details
- Plain digital input: no driver, just `machine.Pin`.
- Active high, with an on-board pull-down: the relay stays off while the microcontroller boots.

## Wiring
- ESP32: SIG → GPIO26, VCC → 3V3, GND → GND.
- Pico: SIG → GP16, VCC → 3V3(OUT), GND → GND.
- Raspberry Pi 4: SIG → pin 11 (GPIO17), VCC → pin 1 (3.3 V), GND → pin 6.
- Load: supply + → COM, ON (NO) → load → supply −. Mains only by an adult or qualified person, in a closed insulated enclosure.

## Using it
```python
from machine import Pin
import time
relay = Pin(26, Pin.OUT, value=0)  # SIG
relay.value(1)   # load on (ON-COM closed)
time.sleep(2)
relay.value(0)   # load off
```

## Gotchas
- Only NO is brought out: the load is off whenever the relay is unpowered. There is no NC terminal on this board.
- The coil draws about 120 mA: power VCC from the board's 3V3/5V pin, not from a GPIO.
- Relays are slow and wear out: never PWM them.
- Older v1.1 boards are 5 V only; v1.2 (with the XC6206 regulator) works at 3.3 V.
- Motors and pumps are inductive: stay well below the 5 A rating.

## Datasheet
https://files.seeedstudio.com/wiki/Grove-Relay/res/Relay_Datasheet.pdf (HLS8-T73 series relay); schematic https://files.seeedstudio.com/wiki/Grove-Relay/res/Grove%20-%20Relay%20Schematic.pdf
