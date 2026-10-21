---
name: part-e18-d80nk
description: Pinout, electrical limits, wiring and MicroPython driver for the E18-D80NK / E18-D80NK-N adjustable infrared proximity switch (3-80 cm, 5 V, NPN open-collector output). Use when designing, wiring, simulating or writing code for an E18-D80NK in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# E18-D80NK adjustable IR proximity switch (E18-D80NK)

## Overview
The **E18-D80NK** is an orange 18 mm threaded tube with an IR emitter and receiver in the front. It sends **modulated** IR and demodulates the reflection, so ordinary room light and sunlight barely disturb it. When something is within the range set by the potentiometer on the back, its NPN output switches on.
- **OUT is pulled LOW when an object is detected**. With nothing in range it is open, so it **needs a pull-up**
- Range about **3-80 cm**, set with the rear potentiometer. White objects are seen furthest and black ones closest
- Gives on/off only, not a distance
- Supply: **5 V DC**, 10-15 mA (E18-D80NK-N guide). Output can sink up to 100 mA
- Red LED on the back lights while it detects

Modelled product: **E18-D80NK-N** (20 cm lead with a DuPont plug: red VCC, black GND, yellow OUT).

## Pinout (3-wire lead)
| # | Name | Wire colour (E18-D80NK-N) | Older E18-D80NK lots | Function |
|---|---|---|---|---|
| 1 | VCC | red | brown | Supply, 5 V |
| 2 | GND | black | blue | Ground |
| 3 | OUT | yellow | black | NPN open collector, LOW = object |

**Wire colours vary between batches and sellers.** Check the label or the seller's sheet. The guide warns that swapping supply and ground can permanently damage the sensor.

## Electrical limits
- Supply **5 V DC** only. Use the board's 5V / VBUS pin, not 3V3.
- OUT is an NPN open collector, normally open. The datasheet says **"add a pull-up resistor at the signal output"** (about 1 kΩ suggested). On a 3.3 V board, pull up to **3V3**: either enable the GPIO's internal pull-up (as the driver does) or fit 1-10 kΩ to 3V3. **Never pull it up to 5 V on an ESP32 or Pico.**
- Some vendors say their units already have a 10 kΩ pull-up to VCC inside. With nothing connected to OUT, measure OUT to GND. If it reads about 5 V, put a divider between OUT and the GPIO (10 kΩ from OUT to the GPIO, 20 kΩ from the GPIO to GND).
- Beware the **6-36 V versions** sold under the same name. Their output can rise to the supply voltage.

## Interface details
Plain digital input, no protocol:
```
OUT = 0  -> object within the set range
OUT = 1  -> clear (via the pull-up)
```
Response time is under 2 ms. Use a falling-edge interrupt for counting objects on a conveyor.

## Wiring
| Sensor | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| VCC (red) | 5V / VIN | VBUS (pin 40) | 5V (pin 2) |
| GND (black) | GND | GND | GND (pin 6) |
| OUT (yellow) | GPIO25 (internal pull-up) | GP2 (internal pull-up) | GPIO17 (pin 11), pull-up on |

## Using the driver
```python
from e18d80nk import E18D80NK
import time
sensor = E18D80NK(25)        # GPIO wired to OUT; enables the internal pull-up
while True:
    print('Object: %s' % ('YES' if sensor.detected() else 'no'))
    time.sleep(0.5)
```
`detected()` is True while something is in range. `raw()` returns the pin level. `irq(handler)` calls `handler(pin)` when an object appears, or when it goes away with `on_detect=False`. Pass `pull_up=False` if you fitted an external pull-up to 3V3.

## Gotchas
- **Without a pull-up OUT floats** and readings are random. This is the most common "it doesn't work" problem.
- **Do not pull OUT up to 5 V** on a 3.3 V board.
- **Range setting**: with nothing in front, turn the pot until the rear LED goes off. Then check that your target at the wanted distance turns it on.
- Shiny or white objects trigger far away. Black, matte or very thin objects may be missed.
- For a real distance in cm use an ultrasonic (HC-SR04) or time-of-flight (VL53L0X) sensor.

## Datasheet
E18-D80NK-N instruction guide: https://www.mantech.co.za/Datasheets/Products/MD0052-E18-D80NK.pdf (also https://m.media-amazon.com/images/I/711Cn4VOqlL.pdf).
Wire order and colours: the same guides (red VCC, black GND, yellow OUT), plus components101 for the older brown/blue/black colour code.
