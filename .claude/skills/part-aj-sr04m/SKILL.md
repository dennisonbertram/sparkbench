---
name: part-aj-sr04m
description: Pinout, electrical limits, wiring and MicroPython driver for the AJ-SR04M waterproof ultrasonic distance sensor in trigger/echo mode (AJ-SR04M, R19 open). Use when designing, wiring, simulating or writing code for an AJ-SR04M in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build, e.g. water tank level monitoring.
---

# AJ-SR04M waterproof ultrasonic sensor, trigger/echo mode (AJ-SR04M)

## Overview
The **AJ-SR04M** is a waterproof ultrasonic rangefinder. A sealed 40 kHz transceiver probe sits on a 2.5 m cable, and a separate blue control board drives it. It measures 20–800 cm with a 20 cm blind zone and about 2 mm resolution. Its beam is about 75° wide. In its factory **mode 1 (R19 open)** it works like an HC-SR04, with a trigger pulse in and an echo pulse out. Modelled here: the common **AJ-SR04M waterproof ultrasonic module** (blue board, 4-pin header) with R19 left open.

## Pinout (header order)
| Pin | Function |
|---|---|
| 5V | Supply, DC 3–5.5 V (despite the label) |
| Trig | Trigger input: a high pulse of more than 10 µs starts a measurement (RX in serial modes) |
| Echo | Echo output: high for the round-trip time (TX in serial modes); swings to the supply voltage |
| GND | Ground |

## Electrical limits
- Supply: 3–5.5 V DC.
- Current: about 30 mA while measuring (40 mA peaks), under 2 mA standby.
- Echo high level = supply voltage. Power the module from 3.3 V to keep it safe for ESP32 and Pico pins.
- Operating temperature: −20 to 75 °C. Only the probe and cable are waterproof, not the control board.

## Interface details
- Mode 1 (R19 open): drive Trig high for more than 10 µs. The module sends a 40 kHz burst, and then Echo goes high for the sound's round trip.
- Distance (cm) = echo time (µs) / 58.3 at about 20 °C (343 m/s). With temperature correction: cm = t × (331.3 + 0.606·T) / 20000.
- 800 cm takes about 47 ms of echo, so use a 60 ms timeout and leave at least 60 ms between triggers.
- Other modes are set at power-up by the R19 resistor: 300 kΩ = low-power trigger mode (needs a >1 ms trigger), 120 kΩ = automatic serial every 120 ms, 47 kΩ = serial on a 0x01 byte, 0 Ω = ASCII output. All serial modes run at 9600 8N1. This part models mode 1 only.

## Wiring
- ESP32: 5V → 3V3, GND → GND, Trig → GPIO5, Echo → GPIO18.
- Pico: 5V → 3V3(OUT), GND → GND, Trig → GP2, Echo → GP3.
- Raspberry Pi 4: 5V → pin 1 (3.3 V), GND → pin 6, Trig → pin 16 (GPIO23), Echo → pin 18 (GPIO24).
- If you power it from 5 V, put a divider on Echo (e.g. 10 kΩ from Echo to the GPIO and 20 kΩ from the GPIO to GND).

## Using the driver
```python
from aj_sr04m import AJSR04M
s = AJSR04M(5, 18)          # Trig GPIO, Echo GPIO
d = s.distance_cm()         # None if no echo
print(d)
```

## Gotchas
- No readings at all: check that R19 is open (mode 1) and that the probe cable is plugged into the white socket on the back.
- Anything closer than 20 cm is in the blind zone and gives wrong values.
- Soft, angled or narrow targets may give no echo. In a tank, keep the probe clear of the walls because the beam is wide.
- Triggering faster than about every 60 ms picks up stale echoes.

## Datasheet
https://www.fabian.com.mt/viewer/42585/pdf.pdf (AJ-SR04M user manual: modes and timing). Electrical parameters: https://www.fabian.com.mt/viewer/42586/pdf.pdf
