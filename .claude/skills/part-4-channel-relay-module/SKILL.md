---
name: part-4-channel-relay-module
description: Pinout, electrical limits, wiring and MicroPython code for the 4-channel 5 V active-low relay module (Songle SRD-05VDC-SL-C relays, GND/IN1-IN4/VCC header, JD-VCC jumper). Use when designing, wiring, simulating or writing code for a 4-channel relay module in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# 4-channel 5 V relay module (SRD-05VDC-SL-C x4)

## Overview
Four **Songle SRD-05VDC-SL-C** relays (SPDT, form C) on one board, each driven through a PC817 optocoupler and a transistor, with flyback diodes and a status LED per channel. A GPIO switches up to four independent loads (lamps, pumps, fans). Hobbyists buy it as the **4-channel 5V relay module with optocoupler, low level trigger** (the common blue board): a 6-pin input header (GND, IN1, IN2, IN3, IN4, VCC), a 3-pin JD-VCC / VCC / GND jumper header, and a 3-way screw terminal (NO / COM / NC) per relay. The inputs are **active low**: IN low = relay on.

## Pinout (input header order)
| Pin | Function |
|---|---|
| GND | Ground (share with the microcontroller) |
| IN1 | Relay 1 control: low = on, high = off |
| IN2 | Relay 2 control: low = on, high = off |
| IN3 | Relay 3 control: low = on, high = off |
| IN4 | Relay 4 control: low = on, high = off |
| VCC | Module supply, 5 V (optocoupler side; also the coils while the JD-VCC jumper is fitted) |

Jumper header: **JD-VCC** (relay coil supply), **VCC**, **GND**. The jumper cap on JD-VCC-VCC (default) runs everything from VCC. Output terminals per channel: **NO** (connected to COM while the relay is on), **COM**, **NC** (connected to COM while the relay is off).

## Electrical limits
- Supply 5 V. SRD-05VDC-SL-C coil: 70 Ω, 71.4 mA at 5 V, pull-in 3.75 V max, drop-out 0.5 V min, max 6 V. All four on: about 290 mA.
- Inputs: optocoupler LED from VCC, about 5 mA sunk per active input (vendor figure); 3.3 V or 5 V logic.
- Contacts (form C, resistive): 10 A 125 VAC, 10 A 28 VDC; inductive 3 A. Max 250 VAC / 110 VDC.
- Operate 10 ms max, release 5 ms max; electrically about 30 operations/min.

## Interface details
- Plain digital inputs: no driver needed, just `machine.Pin`. Each IN is independent.
- Active low: `value(0)` = relay on, `value(1)` = relay off. An input left floating reads as off, an input driven low (including a GPIO that boots low) turns its relay on.
- Isolation: remove the JD-VCC jumper, feed a separate 5 V to JD-VCC (with its GND on the jumper header) and the logic supply to VCC.

## Wiring
- ESP32: VCC → 5V (VIN), GND → GND, IN1 → D25, IN2 → D26, IN3 → D27, IN4 → D13.
- Pico: VCC → VBUS (5 V from USB), GND → GND, IN1 → GP2, IN2 → GP3, IN3 → GP4, IN4 → GP5.
- Raspberry Pi 4: VCC → pin 2 (5 V), GND → pin 6, IN1 → pin 11 (GPIO17), IN2 → pin 13 (GPIO27), IN3 → pin 15 (GPIO22), IN4 → pin 16 (GPIO23).
- Load: supply + → COM, NO → load → supply −. Mains only by an adult or qualified person, in a closed insulated enclosure.

## Using it
```python
from machine import Pin
import time
relays = [Pin(n, Pin.OUT, value=1) for n in (25, 26, 27, 13)]  # value=1 = off
relays[0].value(0)   # load 1 on
time.sleep(2)
relays[0].value(1)   # load 1 off
```

## Gotchas
- **Active low.** Always create the pins with `value=1`, otherwise a relay clicks on at start-up.
- Power VCC from 5 V, never 3V3: four coils draw about 290 mA together. With a USB-powered board, several relays at once may brown it out; use a separate 5 V supply on JD-VCC.
- If a relay will not switch off from a 3.3 V board, remove the JD-VCC jumper, power JD-VCC from 5 V and VCC from 3.3 V.
- Relays are slow and wear out: don't PWM them. Use a MOSFET for speed control.
- Motors and pumps are inductive loads: derate to 3 A, and add a snubber/diode across DC motors on the load side.

## Datasheet
https://www.circuitbasics.com/wp-content/uploads/2015/11/SRD-05VDC-SL-C-Datasheet.pdf
