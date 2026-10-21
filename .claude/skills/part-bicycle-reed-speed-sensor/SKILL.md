---
name: part-bicycle-reed-speed-sensor
description: Pinout, electrical limits, wiring and MicroPython driver for a 2-wire magnetic reed bicycle speed / cadence sensor with spoke magnet (CatEye Computer Mount and Wired Speed Sensor Kit 1603390 for Velo 7 / Velo 9 / Enduro, and the generic wired bike-computer sensors like it). Use when designing, wiring, simulating or writing code for a bike speedometer, wheel RPM or pedal cadence sensor in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Bicycle reed speed sensor (2-wire, with magnet)

## Overview
A wired bike-computer speed sensor is a plastic housing on the front fork with a sealed, normally-open **reed switch** inside, plus a **magnet** clamped to a spoke. Every wheel revolution the magnet passes the sensor and the switch closes for a moment, "making contact between the two wires in the cable" (Sheldon Brown). There is no chip and no supply: one pulse per revolution, counted by a GPIO.
- Modelled product: **CatEye Computer Mount and Wired Speed Sensor Kit (part 1603390, Velo 7 / Velo 9 / Enduro)**; CatEye's manual calls it a "No contact magnetic sensor" and wants the magnet-to-sensor gap under 5 mm.
- Speed (km/h) = rpm x wheel circumference (mm) x 60 / 1 000 000. 700x23C = 2096 mm, 26 inch MTB around 2050-2100 mm: measure a wheel roll-out for accuracy.
- Mounted on a chainstay with the magnet on the crank arm it reads pedal **cadence** (1 pulse per crank turn).

## Pinout (the two wires / the two contacts in the handlebar mount, not polarised)
| Sparkbench pin | Wire | Function |
|---|---|---|
| SPEED | either sensor wire | To a GPIO with the internal pull-up on. Reads 1 idle, 0 while the magnet is at the sensor |
| GND | the other wire | To ground |

It is wired with jumper leads (`cabled`): cut the cable off the handlebar mount, or clip onto the mount's two spring contacts.

## Electrical limits
- Just a reed switch: with the GPIO pull-up only tens of microamps flow. Pull up to **3.3 V**, never 5 V on an ESP32 / Pico pin.
- No supply pin, no polarity.
- A long cable along the fork picks up noise: if you see stray counts add a 10 kOhm pull-up to 3.3 V and 10-100 nF from SPEED to GND at the board.

## Interface details
- One closure per wheel revolution; the closed time is short (a few % of the turn), so count edges with `Pin.irq`, don't poll.
- Reed contacts chatter on closing and opening. The driver watches both edges and counts a falling edge only if the line was high for `debounce_ms` (2 ms) and `min_period_ms` (20 ms, i.e. up to 3000 rpm) has passed since the last count.
- Speed is the average period between closures (exact), not pulses per window (jitters by one pulse). It drops to 0 when no pulse arrives for `timeout_ms` (3 s, about 2.5 km/h on a 700c wheel).

## Wiring
| Sensor | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| SPEED | GPIO4 (pull-up on) | GP15 (pull-up on) | GPIO17 (pull-up on) |
| GND | GND | GND | GND |

## Using the driver
```python
from bike_speed import BikeSpeedSensor
import time
s = BikeSpeedSensor(4, circumference_mm=2096)   # 700x23C wheel
while True:
    r = s.rpm()
    print('Speed=%.1f km/h  %.0f rpm  %.2f km' % (s.speed_kmh(r), r, s.distance_m() / 1000))
    time.sleep(1)
```
Call `rpm()` once per update and pass it to `speed_kmh(r)`: each `rpm()` call starts a new averaging window. `revolutions()` / `distance_m()` give the odometer, `reset_distance()` clears it.

## Gotchas
- Line up the magnet's centre with the marking line on the sensor, gap under 5 mm; too far and nothing counts.
- Some magnets give two closures per pass when mounted crosswise (Sheldon Brown's "doubled readings" fault): turn the magnet so its axis is along the direction of travel if speed reads double.
- Mount the magnet near the hub; far out on the spoke it moves fast and the closure gets very short.
- Hall-effect (3-wire, powered) sensors are a different part; this one has exactly two wires.

## Datasheet
CatEye Velo 7 / Velo 9 manual: https://www.manualsdir.com/manuals/458398/cateye-cc-vl520_cc-vl820-velo-7_velo-9.html ; how the sensor works: https://www.sheldonbrown.com/cyclecomputer-troubleshoot.html
