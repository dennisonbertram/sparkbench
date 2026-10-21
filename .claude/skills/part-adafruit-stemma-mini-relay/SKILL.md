---
name: part-adafruit-stemma-mini-relay
description: Pinout, electrical limits, wiring and MicroPython code for the Adafruit STEMMA Non-Latching Mini Relay (product 4409; NEXEM/EM Devices EE2 2-Form-C signal relay driven by an MMBT2222 from SIG, JST PH 3-pin GND/VIN/SIG, active-high, NC/COM/NO push-in terminal). Use when designing, wiring, simulating or writing code for the Adafruit STEMMA relay in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Adafruit STEMMA Non-Latching Mini Relay (#4409)

## Overview
A small signal relay board with a 3-pin **JST PH 2 mm STEMMA** connector. The relay is a **NEXEM (EM Devices) EE2-series non-latching relay, minimum-footprint NUH type** (2 Form C, gold-overlay silver contacts); its coil goes from VIN to the collector of an **MMBT2222** NPN transistor. SIG drives the base through **1 kΩ**, with a **10 kΩ pull-down** to GND, so a floating SIG keeps the relay off. A 1N4148 flyback diode sits across the coil, a 10 µF capacitor on VIN, and a red LED (1 kΩ, solder jumper SJ1 to disable) lights while the relay is on. **SIG high = relay on.** Hobbyists buy it as **Adafruit STEMMA Non-Latching Mini Relay - JST PH 2mm, product ID 4409**.

## Pinout (JST PH connector X4, schematic pin order)
| Pin | Wire | Function |
|---|---|---|
| GND | black | Ground |
| VIN | red | Supply 3–5 V for the coil driver (not the load) |
| SIG | white | Control input, high = relay on |

The same three signals are on an optional 0.1" pad row JP1 (SIG, VIN, GND). The load side is a 3-way **WAGO 2060 push-in terminal NC / COM / NO** on the far edge (24–18 AWG; press the button to release), plus an unpopulated 3.5 mm footprint for the relay's second pole. Because of the connector on each end, wire the module with a JST PH 3-pin to male header cable.

## Electrical limits
- VIN 3–5 V (Adafruit). About 50 mA while on at 3.3 V; about 80–90 mA at 5 V (coil 64 Ω ±10 % for the 3 V EE2 coil, plus LED and base current). Essentially zero when off.
- Coil (EE2 non-latch, 3 V nominal, 140 mW): must operate 2.25 V, must release 0.3 V.
- Contacts (Adafruit rating, resistive): 2 A at 30 VDC or about 40 VAC, 0.6 A at 110 VDC, 0.5 A at 120 VAC, 0.3 A at 250 VAC. Relay maximum 60 W / 125 VA. Keep loads at 60 W or less and derate for motors, solenoids and lamps.
- Operate about 2 ms, release about 1 ms (relay datasheet, excluding bounce).
- SIG: 3.3 V or 5 V logic; about 2.5 mA at 3.3 V into 1 kΩ.

## Interface details
- Plain digital input: no driver, just `machine.Pin`.
- Active high with an on-board 10 kΩ pull-down: the relay stays off while the microcontroller boots.
- Non-latching: if VIN is lost the relay returns to COM–NC.

## Wiring
- ESP32: SIG → GPIO26, VIN → 3V3, GND → GND.
- Pico: SIG → GP16, VIN → 3V3(OUT), GND → GND.
- Raspberry Pi 4: SIG → pin 11 (GPIO17), VIN → pin 1 (3.3 V), GND → pin 6.
- Load: supply + → COM, NO → load → supply − (load on when SIG is high). Use NC instead for "on unless switched".

## Using it
```python
from machine import Pin
import time
relay = Pin(26, Pin.OUT, value=0)  # SIG
relay.value(1)   # COM-NO closed, red LED on
time.sleep(2)
relay.value(0)   # back to COM-NC
```

## Gotchas
- VIN only powers the coil driver; the switched load needs its own supply through COM/NO/NC.
- This is a small signal relay: not for mains appliances, heaters or big motors (60 W max).
- Relays are slow and wear out: never PWM them.
- High voltages (> 24 V) are for experienced adults only, in a closed insulated enclosure.

## Datasheet
http://www.worldproducts.com/pdfs/NEXEM/NEXEM-MiniatureRelayCatalog.pdf (EE2 series, pages 35–37); schematic https://github.com/adafruit/Adafruit-STEMMA-Non-Latching-Mini-Relay-PCB ; guide https://learn.adafruit.com/adafruit-stemma-non-latching-mini-relay
