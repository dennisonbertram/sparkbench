---
name: part-ky-028
description: Pinout, electrical limits, wiring and MicroPython driver for the KY-028 digital temperature module (NTC thermistor + LM393 comparator, AO + DO). Use when designing, wiring, simulating or writing code for a KY-028 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# KY-028 digital temperature module (KY-028)

## Overview
The **KY-028** is a small black 4-pin module with an **NTC thermistor** (black bead on long legs), an **LM393 comparator**, a blue 3296 multi-turn trimmer (threshold), a power LED (LED1) and a "threshold" LED (LED2). It is sold in the 37-in-1 / 40-in-1 sensor kits, for example the **Joy-IT SensorKit KY-028**.
- **AO**: the thermistor divider voltage itself. Joy-IT notes it is **inverted**: warmer gives a *lower* AO voltage.
- **DO**: the LM393 output (with the module's pull-up). It goes **HIGH** while the temperature is past the trimmer threshold and LED2 lights.
- It is a **thermostat-style threshold switch**. AO is a relative reading: divider resistor values differ between makers, so there is no reliable formula from AO to °C. For calibrated temperatures use a KY-013, DS18B20 or an I2C sensor.

## Pinout (module header, as printed on the board)
| Pin | Name | Function |
|-----|------|----------|
| 1 | AO | Analog thermistor voltage (lower = warmer) |
| 2 | G | Ground |
| 3 | + | Supply, 3.3–5 V |
| 4 | DO | Digital output, HIGH = temperature past threshold |

## Electrical limits
- Supply: **3.3–5 V** (Joy-IT wires it to 5 V on Arduino and to 3.3 V on Raspberry Pi / Pico). The LM393 itself runs on 2–36 V.
- Current: a few mA, mostly the two LEDs.
- Thermistor range −55 °C to +125 °C (Joy-IT); the rest of the board is not meant to get that hot or cold.
- AO and DO swing up to the supply voltage. **On an ESP32, Pico or Raspberry Pi, power the module from 3.3 V** so neither output can go above 3.3 V.

## Interface details
- DO = LM393 comparing the thermistor voltage with the trimmer voltage. Warm the bead to the temperature you want to detect, then turn the trimmer until LED2 just switches. The pot moves only the threshold, not AO.
- Near the threshold DO can chatter (the LM393 has no hysteresis on this board): debounce in software if you switch a relay from it.
- AO: average many ADC samples (`voltage()` does 32). Compare readings with each other (falling = warming) rather than converting to °C.

## Wiring
| Module | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| + | 3V3 | 3V3(OUT) (pin 36) | 3.3 V (pin 1) |
| G | GND | GND | GND (pin 6) |
| DO | any GPIO, e.g. GPIO25 | any GP, e.g. GP18 | any GPIO, e.g. GPIO24 (pin 18) |
| AO | GPIO32–39 (ADC1) | GP26/27/28 (ADC) | External ADC (e.g. KY-053 / ADS1115) |

On the ESP32 use ADC1 pins (ADC2 does not work while Wi-Fi is on). The Raspberry Pi has no ADC: use DO alone or add one.

## Using the driver
```python
from ky028 import KY028
import time
t = KY028(32, 25)   # AO GPIO, DO GPIO
while True:
    print('AO=%.2fV hot=%s' % (t.voltage(), t.over_threshold()))
    time.sleep(1)
```
`voltage()` averages 32 samples (`read_uv()` on ESP32, else `read_u16()` × 3.3 V / 65535). `over_threshold()` is True while DO is HIGH.

## Gotchas
- **Trimmer first**: out of the box DO is often stuck HIGH or LOW. It is a 25-turn pot, so turn it many times while watching LED2.
- **AO is inverted**: a falling voltage means it is getting warmer.
- **Not calibrated**: board variants use different divider resistors, so do not reuse the KY-013 formula on AO.
- **5 V supply + 3.3 V board** puts 5 V on the GPIO pins. Use 3.3 V.
- Keep the thermistor's bare legs apart and away from other metal; do not dunk the module in liquid.

## Datasheet
https://www.ti.com/lit/ds/symlink/lm393.pdf (LM393 comparator). Module documentation: https://sensorkit.joy-it.net/en/sensors/ky-028
