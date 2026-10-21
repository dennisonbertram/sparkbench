---
name: part-lm393-light-sensor
description: Pinout, electrical limits, wiring and MicroPython driver for the LM393 light sensor module (photoresistor + LM393 comparator, digital DO output only). Use when designing, wiring, simulating or writing code for an LM393 / LDR light sensor module in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# LM393 light sensor module (DO only)

## Overview
The **LM393 photosensitive light sensor module** is a small blue board with:
- a **photoresistor (LDR)** in a divider with a fixed resistor
- an **LM393 comparator**, a blue **sensitivity trimmer**, a power LED and a DO LED

It has one output, **DO**, a yes/no light switch. On the common board:
- **LOW** (DO LED lit) when the light is **brighter** than the trimmer threshold
- **HIGH** (DO LED off) when it is **darker** than the threshold

Some sellers' boards are the other way round. DO does not measure lux: it only says which side of the threshold the light is on.

## Pinout (3-pin header as printed)
| Pin | Name | Function |
|-----|------|----------|
| 1 | VCC | Supply, 3.3–5 V |
| 2 | GND | Ground |
| 3 | DO | Digital output: LOW = bright, HIGH = dark (pulled up to VCC on the board) |

## Electrical limits
- Supply: **3.3–5 V** (module rating; the LM393 itself runs on 2–36 V). A few mA with the LEDs on.
- The LM393 output is open-collector (TI datasheet: sinks at least 6 mA at 1.5 V); the board pulls DO up to VCC.
- **On an ESP32 or Pico, power the module from 3.3 V** so DO never goes above 3.3 V.

## Interface details
- The comparator compares the LDR divider with the trimmer voltage and switches DO when the light crosses the threshold. Response is about 1 µs, so DO follows the light directly; no timing to respect.
- There is no calibration or lux scale. Set the threshold with the trimmer.

## Wiring
| Module | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| VCC | 3V3 | 3V3(OUT) | 3.3 V (pin 1) |
| GND | GND | GND | GND (pin 6) |
| DO | any GPIO, e.g. GPIO25 | any GP, e.g. GP2 | any GPIO, e.g. GPIO24 (pin 18) |

## Using the driver
```python
from lm393_light import LM393Light
import time
s = LM393Light(25)            # DO GPIO; active_low=False for boards whose DO goes HIGH in light
while True:
    print('Light: %s' % ('BRIGHT' if s.bright() else 'DARK'))
    time.sleep(0.5)
```

## Gotchas
- **DO is backwards**: LOW means bright on the common board. Check yours: cover the LDR and watch the DO LED and the pin.
- **Set the threshold**: put the sensor in the light level you want to switch at and turn the trimmer until the DO LED just changes.
- If DO flickers near the threshold (e.g. under mains-powered lamps), read it a few times or add a delay before acting.
- Need an actual light level? Use the 4-pin version's AO pin with an ADC, or a lux sensor (BH1750, VEML7700).

## Datasheet
https://www.ti.com/lit/ds/symlink/lm393.pdf (LM393 comparator on the board).
