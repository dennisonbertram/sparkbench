---
name: part-adxl335
description: Pinout, electrical limits, wiring and MicroPython driver for the ADXL335 3-axis analog accelerometer (GY-61 module). Use when designing, wiring, simulating or writing code for an ADXL335 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# ADXL335 3-axis analog accelerometer (ADXL335)

## Overview
The **ADXL335** from Analog Devices measures acceleration on X, Y and Z over at least **±3 g** and gives each axis as an **analog voltage**. It senses gravity too, so it works as a tilt sensor. Hobbyists buy it on the **GY-61** module, which adds a 3.3 V LDO, the filter capacitors and a 5-pin header.
- Outputs are **ratiometric** to the chip supply VS: zero g = **VS / 2**, sensitivity about **VS / 10 per g** (300 mV/g typical at 3 V; 360 mV/g at 3.6 V)
- On the GY-61 VS = 3.3 V, so 0 g ≈ **1.65 V** and ≈ **330 mV/g** (±3 g = 0.66–2.64 V)
- 350 µA supply current, turn-on about 1 ms

## Pinout (GY-61, header order, pin 1 first)
| Pin | Silkscreen | Function |
|-----|------|----------|
| 1 | VCC | Supply into the on-board 3.3 V regulator, 3.3–5 V |
| 2 | X_OUT | X-axis analog output |
| 3 | Y_OUT | Y-axis analog output |
| 4 | Z_OUT | Z-axis analog output |
| 5 | GND | Ground |

(Source: ThaiEasyElec GY-61 Quick Start Guide pin table: 1 VCC, 2 X_OUT, 3 Y_OUT, 4 Z_OUT, 5 GND.) The chip's self-test (ST) pin is not brought out.

## Electrical limits
- Module VCC: 3.3–5 V (regulated down to 3.3 V). The bare chip is rated 1.8–3.6 V.
- Outputs stay between about 0.1 V and VS − 0.2 V, so they are safe for 3.3 V ADC inputs.
- Each output comes through an internal 32 kΩ resistor: use a high-impedance ADC input, not a heavy load.
- Bandwidth = 1 / (2π × 32 kΩ × C) set by the module's capacitors on X/Y/Z.

## Interface details
```
a (g) = (Vout − VS/2) / (0.1 × VS)        VS = 3.3 V on the GY-61
```
Examples at VS = 3.3 V: 1.65 V = 0 g; 1.815 V = +0.5 g; 1.98 V = +1 g; 1.254 V = −1.2 g.
Lying flat with the chip up, Z reads +1 g and X, Y read 0 g. Real parts vary (zero g 1.35–1.65 V on X/Y and 1.2–1.8 V on Z at VS = 3 V; sensitivity ±10 %), so calibrate for accurate tilt angles.

## Wiring
| GY-61 | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| VCC | 3V3 (or 5V) | 3V3(OUT) (pin 36) or VBUS | 3.3 V (pin 1) |
| X_OUT | GPIO32–39 (ADC1) | GP26 (ADC0) | External ADC (MCP3008 / ADS1115) |
| Y_OUT | another ADC1 pin | GP27 (ADC1) | External ADC |
| Z_OUT | another ADC1 pin | GP28 (ADC2) | External ADC |
| GND | GND | GND | GND |

The Raspberry Pi 4 has no ADC. On the ESP32 avoid ADC2 pins (they stop working while Wi-Fi is on).

## Using the driver
```python
from adxl335 import ADXL335
import time
acc = ADXL335(34, 35, 32)          # X_OUT, Y_OUT, Z_OUT GPIOs
while True:
    x, y, z = acc.read()
    print('X=%.2f Y=%.2f Z=%.2f g' % (x, y, z))
    time.sleep(0.5)
```
`read()` returns g per axis, `voltages()` the raw volts. `calibrate()` (board flat, chip facing up) stores the real zero-g levels. Pass `vs=` if the chip's supply is not 3.3 V.

## Gotchas
- Fed with exactly 3.3 V on VCC, the LDO drops a little, so VS is slightly under 3.3 V and zero g reads a bit low: calibrate, or power VCC from 5 V.
- It cannot tell a slow tilt from a steady push: gravity is always in the reading (about 1 g total when still).
- Tilt angle: pitch = atan2(x, sqrt(y² + z²)).
- ESP32 ADC is non-linear near its ends; the driver uses `read_uv()` (factory-calibrated) and averages 16 samples.

## Datasheet
https://www.analog.com/media/en/technical-documentation/data-sheets/ADXL335.pdf
