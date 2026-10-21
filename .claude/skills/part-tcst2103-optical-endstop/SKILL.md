---
name: part-tcst2103-optical-endstop
description: Pinout, electrical limits, wiring and MicroPython driver for the TCST2103 optical endstop module (red RepRap / RAMPS 1.4 slot-sensor board, Vishay TCST2103 photo-interrupter, 3-pin header V S G). Use when designing, wiring, simulating or writing code for an optical endstop / slotted limit sensor in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# TCST2103 optical endstop (TCST2103)

## Overview
The **optical endstop** is the small red 3D-printer board marked *End-Stop*. A **Vishay TCST2103** transmissive sensor holds an IR LED facing an NPN phototransistor across a **3.1 mm slot**. When a flag on the moving axis slides into the slot, it blocks the beam and the signal goes HIGH.
- **S = HIGH while the slot is blocked** (triggered), LOW while clear
- Supply: **5 V** (resistors sized for 5 V)
- No comparator: S is the phototransistor's collector with a 2.2 kΩ pull-up to V

## Pinout (3-pin JST-XH header, as printed on the back: V, S, G)
| Pin | Name | Function |
|---|---|---|
| 1 | V | Supply, 5 V |
| 2 | S | Signal: 1 = slot blocked, 0 = clear (2.2 kΩ pull-up to V) |
| 3 | G | Ground |

## Electrical limits
- Board resistors: R1 = 180 Ω (IR LED, about 20 mA at 5 V), R2 = 2.2 kΩ (pull-up on S), plus an indicator LED with 1 kΩ.
- TCST2103 (datasheet): LED IF max 60 mA, VF typ 1.25 V; collector current 2 mA min / 4 mA typ at IF = 20 mA, VCE = 5 V; VCEsat ≤ 0.4 V; ton ≈ 10 µs, toff ≈ 8 µs.
- Draws about 25-30 mA in total.
- **S swings to the 5 V supply.** On a 3.3 V board, put a divider between S and the GPIO (10 kΩ S→GPIO, 20 kΩ GPIO→GND). A blocked slot then gives about 3.1 V at the pin.
- Running the board from 3.3 V roughly halves the LED current, and S may no longer pull fully low. Use 5 V.

## Interface details
A plain digital level. There is no protocol:
```
S = 1  -> flag in the slot (endstop triggered)
S = 0  -> slot clear
```
Read it with `Pin.value()` or an IRQ on the rising edge. The output is analog-ish: a flag that only half covers the beam gives an in-between voltage.

## Wiring
| Module | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| V | 5V (VIN) | VBUS (pin 40) | 5V (pin 2) |
| S | GPIO25 via 10 kΩ, 20 kΩ to GND | GP2 via 10 kΩ, 20 kΩ to GND | GPIO17 (pin 11) via 10 kΩ, 20 kΩ to GND |
| G | GND | GND | GND (pin 6) |

## Using the driver
```python
from tcst2103_endstop import TCST2103Endstop
import time
endstop = TCST2103Endstop(25)          # GPIO wired (through the divider) to S
while True:
    print('Endstop: %s' % ('TRIGGERED' if endstop.triggered() else 'open'))
    time.sleep_ms(200)
```
- `triggered()` gives the live state.
- `value()` gives the raw level.
- `triggered_stable()` debounces for `debounce_ms`.
- `irq(handler)` fires when the slot becomes blocked. Pass `on_trigger=False` to fire when it clears.

## Gotchas
- **Never connect S straight to a 3.3 V GPIO with the board on 5 V.** Use the divider.
- The cable's wire colours are arbitrary. Follow the V / S / G silkscreen.
- Use an opaque flag that passes fully through the slot. IR-translucent plastic or a flag that stops half-way can leave S between logic levels.
- Some clones fit the indicator LED in a different landing, so it may light on blocked or on clear. Trust S, not the LED.
- Strong sunlight into the slot can hold the phototransistor on. The TCST2103 has a daylight filter, but shade it if readings look wrong.

## Datasheet
https://www.vishay.com/docs/81147/tcst2103.pdf
Pin order: board photo (back silkscreen V S G, R1 181, R2 222) at https://botland.store/limit-sensors-for-3d-printers/2659-optical-limit-sensor-endstop-reprap-3d-ramps-14-5904422359195.html; circuit from https://www.instructables.com/Improved-Optical-End-Stop/
