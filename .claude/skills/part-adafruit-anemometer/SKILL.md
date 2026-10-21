---
name: part-adafruit-anemometer
description: Pinout, electrical limits, wiring and MicroPython driver for the Adafruit anemometer wind speed sensor with analog voltage output (product 1733, QS-FS cup anemometer, 0.4-2.0 V for 0-32.4 m/s, 7-24 V supply). Use when designing, wiring, simulating or writing code for a wind speed sensor / anemometer in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Adafruit anemometer wind speed sensor (product 1733)

## Overview
A three-cup aluminium anemometer (QS-FS wind speed sensor, analog voltage type) for weather stations. Built-in electronics turn the cup speed into a **linear voltage**: **0.4 V at 0 m/s** up to **2.0 V at 32.4 m/s**. There is no chip to talk to: read the blue wire with an ADC.
- Range 0-32.4 m/s (voltage version), start wind speed 0.2 m/s (Adafruit) / up to 0.8 m/s (datasheet), resolution 0.1 m/s
- Accuracy ±(0.3 + 0.03 × V) m/s (datasheet), worst case about 1 m/s (Adafruit)
- **Supply 7-24 V DC** (Adafruit used 9 V); it does not run from 3.3 V or 5 V
- 99 cm cable with a twist-lock 4-pin plug at the sensor; not IP rated per Adafruit

## Pinout (cable wires; plug pin 1-3, pin 4 not connected)
| Wire | Sparkbench pin | Function |
|---|---|---|
| Brown | PWR | Supply, 7-24 V DC from a separate supply |
| Black | GND | Power and signal ground (tie to the microcontroller GND) |
| Blue | SIG | Analog wind speed output, 0.4-2.0 V |

The sensor has bare wire leads, so it is wired with jumper leads / a screw terminal rather than plugged into the breadboard.

## Electrical limits
- PWR: 7 V min, 24 V max. Use a 9 V or 12 V adapter; never connect it to the board's 3V3/5V pin.
- SIG: 0.4-2.0 V, safe for a 3.3 V ADC input directly (no divider needed).
- Common ground: the supply's negative, the black wire and the microcontroller GND must all be joined.

## Interface details
```
wind (m/s) = (V_sig − 0.4) × 32.4 / 1.6 = (V_sig − 0.4) × 20.25
```
Examples: 0.4 V = 0 m/s, 0.99 V ≈ 12 m/s, 1.2 V = 16.2 m/s, 2.0 V = 32.4 m/s. km/h = m/s × 3.6. Readings a little under 0.4 V are calm air (offset/ADC error).

## Wiring
| Sensor | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| Brown (PWR) | external 7-24 V + | external 7-24 V + | external 7-24 V + |
| Black (GND) | GND + supply − | GND + supply − | GND + supply − |
| Blue (SIG) | GPIO32-39 (ADC1) | GP26/27/28 (ADC) | External ADC (ADS1115 / MCP3008) |

Use an ADC1 pin on the ESP32 (ADC2 stops working while Wi-Fi is on). The Pi 4 has no ADC.

## Using the driver
```python
from anemometer import Anemometer
import time
wind = Anemometer(34)            # GPIO the blue wire is on
while True:
    print('Wind=%.1f m/s' % wind.speed())
    time.sleep(1)
```
The driver averages 32 samples, using calibrated `read_uv()` where available (ESP32), otherwise `read_u16()` × 3.3 V / 65535 (pass `vref=` for a different reference).

## Gotchas
- **Power it from 7-24 V**, not the board. On 3.3/5 V the output is meaningless.
- ESP32 ADCs are least accurate near 0 V-0.15 V and above ~2.5 V; 0.4-2.0 V sits in the good range, but calibration still helps (check the 0.4 V calm reading).
- Gusts: average over several seconds for a steady reading, keep the max for gust speed.
- Mount it level and clear of buildings; seal the plug if it is exposed to rain.

## Datasheet
https://cdn-shop.adafruit.com/product-files/1733/C2192-002_datasheet.pdf (QS-FS wind speed sensor) and https://www.adafruit.com/product/1733
