---
name: part-ky-027
description: Pinout, electrical limits, wiring and MicroPython driver for the KY-027 magic light cup module (mercury tilt switch with 10 kOhm pull-up plus an LED without a series resistor). Use when designing, wiring, simulating or writing code for a KY-027 / HW-499 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# KY-027 magic light cup module (KY-027)

## Overview
The **KY-027** (Keyes sensor-kit board, also sold as **HW-499**, usually as a pair) carries two independent circuits:
- a glass **mercury tilt switch** between S and G with a **10 kΩ pull-up** (R1, marked 103) from S to +. **S is HIGH while the switch is open and LOW while the mercury closes it.** Which tilt closes it depends on how the board is held.
- a 5 mm **LED** from L (anode) to G (cathode). **There is no series resistor on the board.**

Two modules side by side, with PWM fading, make light seem to "pour" from one cup to the other when tilted.

## Pinout (4-pin header, as printed on the board)
| Pin | Name | Function |
|---|---|---|
| 1 | G | Ground (switch and LED cathode) |
| 2 | + | Supply for the S pull-up, 3.3-5 V |
| 3 | S | Tilt switch: 1 = open, 0 = closed |
| 4 | L | LED anode: high or PWM = on (needs a series resistor) |

## Electrical limits
- Supply 3.3-5 V. The supply only feeds the 10 kΩ pull-up (0.33 mA at 3.3 V).
- S is pulled up to +, so **powered from 5 V, S rises to 5 V**: too much for an ESP32 or Pico GPIO. With a 3.3 V board connect + to 3V3.
- LED: series resistor **120 Ω at 3.3 V, 220 Ω at 5 V** (vendor values, about 10 mA).

## Interface details
Plain digital I/O, no protocol:
```
S = 1  -> switch open
S = 0  -> switch closed (S shorted to G by the mercury)
L = 1  -> LED on (through your series resistor); PWM to dim
```
The mercury bounces for a few milliseconds at each change; the driver waits for 50 ms of a stable level.

## Wiring
| Module | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| G | GND | GND | GND (pin 6) |
| + | 3V3 | 3V3(OUT) (pin 36) | 3V3 (pin 1) |
| S | GPIO25 | GP2 | GPIO23 (pin 16) |
| L | 120 Ω to GPIO26 | 120 Ω to GP3 | 120 Ω to GPIO24 (pin 18) |

## Using the driver
```python
from ky027 import KY027
import time
cup = KY027(25, 26)           # GPIOs wired to S and (through 120 Ohm) L
while True:
    c = cup.closed()          # debounced switch state
    cup.led(c)                # LED follows the switch
    time.sleep(0.5)
```
`raw()` reads S instantly; `brightness(0..255)` fades the LED with PWM.

## Gotchas
- **No LED resistor on the board**: a GPIO straight to L overloads the LED and the pin.
- **Do not power + from 5 V on a 3.3 V board**: the pull-up takes S to the + voltage.
- **Readings look inverted?** It depends on how the board is held; turn it round or invert the test.
- The switch contains **mercury**: do not break the glass; dispose of a damaged board as hazardous waste.
- For an angle in degrees use an accelerometer (MPU6050, ADXL345).

## Datasheet
No chip datasheet exists (switch, resistor and LED). Vendor data: https://sensorkit.joy-it.net/en/sensors/ky-027 (LED series resistors 120 Ω / 220 Ω).
Pin order: https://arduinomodules.info/ky-027-magic-light-cup-module/ (G, +, S, L). Circuit: https://www.codrey.com/arduino-projects/magic-cup-light-module-quick-tries/ (10 kΩ pull-up from + to S, switch to GND).
