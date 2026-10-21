---
name: part-grove-hall-sensor
description: Pinout, electrical limits, wiring and MicroPython driver for the Seeed Grove - Hall Sensor (SKU 101020046, Allegro A1101 unipolar Hall-effect switch, active-low SIG output with LED). Use when designing, wiring, simulating or writing code for a Grove Hall Sensor in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Grove - Hall Sensor (Allegro A1101)

## Overview
The **Seeed Grove - Hall Sensor (SKU 101020046)** detects a magnet. It uses the **Allegro A1101**, a continuous-time unipolar Hall-effect switch: when the **south pole** of a magnet comes close to the chip's branded face, its NMOS output turns on and pulls **SIG LOW**; take the magnet away and SIG goes HIGH again. A Schmitt trigger gives about 55 G hysteresis, so the output is a clean on/off. A red LED on the board lights while a magnet is detected. Typical use: RPM counting, door/lid detection.

## Pinout (Grove connector, pin 1 to 4)
| Pin | Name | Wire colour | Function |
|-----|------|-------------|----------|
| 1 | SIG | yellow | Digital output: LOW = magnet, HIGH = no magnet |
| 2 | NC | white | Not connected |
| 3 | VCC | red | Supply 3.8-24 V (use 5 V) |
| 4 | GND | black | Ground |

Source: Seeed wiki wiring table (yellow = D2, white = not connected, red = 5V, black = GND) and the Seeed schematic (Twig Hall Sensor v0.9b: U1 A1101, J1 TWIG connector, R1 1 kOhm, D1 red LED, C1 100 nF).

## Electrical limits
- Supply: **3.8-24 V** (A1101 datasheet, Seeed wiki). 3.3 V is below the minimum: power it from **5 V**. Absolute max 30 V, reverse-battery protected to -30 V.
- Supply current: 3.8-4.1 mA typical, 7.5 mA max for the chip, plus about 3 mA for the LED while a magnet is present.
- Output: open-drain NMOS, sinks up to 25 mA, 215 mV typical / 400 mV max at 20 mA. Rise/fall time max 400 ns. Power-on time max 4 us.
- Magnetic switch points (A1101, 25 C): operate BOP 50-100-160 G, release BRP 10-45-130 G, hysteresis 20-55-80 G.
- Operating temperature: -40 to +85 C.

## Interface details
- Plain digital output, no protocol. Active low: `0` = magnet, `1` = no magnet.
- The board pulls SIG up to VCC through **R1 (1 kOhm) in series with the red LED**. So SIG idles HIGH without any pull-up from the microcontroller; Seeed's own demo uses `INPUT`. The driver configures SIG as a plain input.
- With VCC at 5 V and SIG on a 3.3 V GPIO, the LED's forward drop (about 1.5-1.8 V) means SIG cannot pull the pin much above 3.3 V and only microamps flow into the pin's protection diode, but it is still above the 3.3 V rating: Sparkbench warns about it. If you want zero overvoltage, put a level shifter between SIG and the pin.
- Only the south pole facing the branded face switches it (unipolar). The north pole does nothing.

## Wiring
Use a Grove-to-female-jumper cable, or a Grove base shield digital port (Seeed's example uses D2).

| Sensor | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| SIG (yellow) | GPIO4 | GP15 (pin 20) | GPIO17 (pin 11) |
| NC (white) | not connected | not connected | not connected |
| VCC (red) | 5V / VIN | VBUS (pin 40) | 5 V (pin 2) |
| GND (black) | GND | GND | GND |

## Using the driver
```python
from grove_hall_sensor import GroveHallSensor
import time
hall = GroveHallSensor(4)          # GPIO wired to SIG
while True:
    print('MAGNET=%d' % hall.detected())
    time.sleep(0.2)
```
`hall.value()` gives the raw level (0 = magnet). `hall.irq(handler)` calls `handler(pin)` each time a magnet arrives (falling edge), handy for counting wheel turns.

## Gotchas
- Nothing happens? Flip the magnet: only the south pole works, on the printed face of the chip.
- **Active LOW:** magnet reads 0, no magnet reads 1. The LED lights when a magnet is detected.
- Powered from 3.3 V it is below the A1101's 3.8 V minimum and may not switch reliably: use 5 V.
- Never add a stronger pull-up from SIG to 5 V when SIG goes to a 3.3 V board.

## Datasheet
https://files.seeedstudio.com/wiki/Grove-Hall_Sensor/res/datasheet.pdf (Allegro A1101). Board: https://wiki.seeedstudio.com/Grove-Hall_Sensor/
