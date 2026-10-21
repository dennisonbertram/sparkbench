---
name: part-ml8511
description: Pinout, electrical limits, wiring and MicroPython driver for the ML8511 analog UV sensor (GY-8511 module). Use when designing, wiring, simulating or writing code for an ML8511 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# ML8511 UV sensor (ML8511)

## Overview
The **ML8511** (LAPIS / ROHM) is a UV-A and UV-B photodiode with a built-in amplifier that gives an **analog voltage** proportional to UV intensity (peak sensitivity 365 nm). Hobbyists buy it on the blue **GY-8511** module, which adds a 3.3 V LDO (marked 662K), decoupling capacitors and a 5-pin header.
- OUT = **1.0 V** in the dark (0.95–1.05 V), **2.2 V** at 10 mW/cm² (2.08–2.32 V), linear: **0.12 V per mW/cm²**
- EN is active high; low puts the chip in standby (0.1 µA, OUT low)
- 300 µA typical when active

## Pinout (GY-8511, header order, regulator end first)
| Pin | Silkscreen | Function |
|-----|------|----------|
| 1 | VIN | Supply into the on-board 3.3 V LDO, 3.3–5 V |
| 2 | 3V3 | LDO output / 3.3 V input (the ML8511's VDD). Optional |
| 3 | GND | Ground |
| 4 | OUT | Analog output, 1.0 V + 0.12 V per mW/cm² |
| 5 | EN | Enable, active high. Must be driven high or tied to 3V3 |

(Sources: Einstronic GY-8511 wiring table and Fritzing diagram; Tinytronics ML8511 module pin list.)

## Electrical limits
- Module supply on VIN: 3.3–5 V. The chip itself needs 2.7–3.6 V (absolute max 4.6 V), so **never put 5 V on the 3V3 pin or on EN**.
- EN high threshold is 0.8 × VDD (about 2.64 V), so a 3.3 V GPIO works; a 5 V logic pin would exceed the chip's 4.6 V absolute maximum.
- OUT stays below about 3 V even in strong UV, so it is safe for 3.3 V ADCs.
- OUT load should be more than 100 kΩ.

## Interface details
```
UV (mW/cm², at 365 nm) = (Vout − 1.0 V) / 0.12 V
```
Examples: 1.00 V = 0; 1.72 V = 6.0 mW/cm²; 2.20 V = 10 mW/cm². After EN goes high, wait 1 ms before reading.
Optional trick (SparkFun): read the 3V3 pin on a second ADC input and scale OUT by 3.3 / reading to cancel a drifting ADC reference.

## Wiring
| GY-8511 | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| VIN | 3V3 (or 5V) | 3V3(OUT) (pin 36) | 3.3 V (pin 1) |
| GND | GND | GND | GND |
| OUT | GPIO32–39 (ADC1) | GP26/27/28 (ADC) | External ADC (MCP3008 / ADS1115) |
| EN | Any GPIO (or 3V3) | Any GP pin (or 3V3) | Any GPIO (or 3.3 V) |

The Raspberry Pi 4 has no ADC.

## Using the driver
```python
from ml8511 import ML8511
import time
uv = ML8511(34, en_pin=25)   # OUT on GPIO34, EN on GPIO25 (driven high)
while True:
    print('V=%.2f UV=%.1fmW/cm2' % (uv.voltage(), uv.intensity()))
    time.sleep(1)
```
`voltage()` averages 32 samples (`read_uv()` on ESP32, else `read_u16()` × 3.3 V; pass `vref=` if your rail differs). `enable(False)` puts the sensor in standby.

## Gotchas
- **EN left floating** gives 0 V or a random output: tie it to 3V3 or a GPIO set high.
- Readings below 1.0 V are clipped to 0 mW/cm²; a dark reading well away from 1.0 V means a bad ADC reference.
- The calibration is for 365 nm light; sunlight readings are an estimate, not a UV index. Glass blocks UV-B.
- ESP32 ADC is non-linear near 0 V and 3.3 V; use `read_uv()` (factory-calibrated) and ADC1 pins.
- Never look into UV lamps used for testing.

## Datasheet
https://cdn.sparkfun.com/datasheets/Sensors/LightImaging/ML8511_3-8-13.pdf
