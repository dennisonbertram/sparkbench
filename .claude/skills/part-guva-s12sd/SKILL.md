---
name: part-guva-s12sd
description: Pinout, electrical limits, wiring and MicroPython driver for the GUVA-S12SD analog UV light sensor (Adafruit #1918 breakout). Use when designing, wiring, simulating or writing code for a GUVA-S12SD in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# GUVA-S12SD UV light sensor (GUVA-S12SD)

## Overview
The **GUVA-S12SD** (Genicom) is a gallium-nitride Schottky UV photodiode. It sees 240–370 nm (UVB and most of UVA) and is nearly blind to visible light. The bare diode gives only nanoamps, so hobbyists buy it on an **analog breakout** with an op-amp. This skill models the **Adafruit Analog UV Light Sensor Breakout (#1918)**: an MCP6001 transimpedance amplifier that turns the photocurrent into a voltage on **OUT**.
- Datasheet photocurrent (25 °C): **26 nA at UV index 1**, **113 nA** under a UVA lamp at 1 mW/cm², dark current < 1 nA
- Breakout gain: **Vout ≈ 4.3 V per µA** of photocurrent (1 MΩ + 3.3 kΩ/1 kΩ T-network: 4.3033 MΩ)
- About **0.112 V per UV index** (the board's silkscreen rounds it to UVI ≈ Vout / 0.1 V)

## Pinout (Adafruit #1918, sensor facing you, header at the bottom, left to right)
| Pin | Silkscreen | Function |
|-----|------|----------|
| 1 | - | Ground |
| 2 | Out | Analog output, Vout = 4.3033 V/µA × Iph |
| 3 | + | Supply, 2.7–5.5 V |

(Source: Adafruit's Eagle board file, header JP2: pad 1 = 5.0V net "+", pad 2 = AOUT, pad 3 = GND "-".)

## Electrical limits
- Supply: **2.7–5.5 V** (Adafruit), the MCP6001 draws about 0.1 mA.
- OUT swings from 0 V up to nearly the supply. **Power it from 3.3 V** when you read it with an ESP32 or Pico, so OUT can never exceed the ADC's 3.3 V limit.
- Photodiode absolute max: 5 V reverse, 1 mA forward, −30 to +85 °C.

## Interface details
```
Iph (nA) = Vout (V) / 4.3033 × 1000
UV index  = Iph (nA) / 26            (datasheet typical, sunlight)
UVA (mW/cm²) = Iph (nA) / 113       (datasheet typical, UVA lamp)
```
Examples: 0.112 V = 26 nA = UVI 1; 1.119 V = 260 nA = UVI 10. With a 3.3 V supply the output saturates near 3.3 V (about 760 nA, UVI ~29), far above real sunlight.

## Wiring
| Breakout | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| + | 3V3 | 3V3(OUT) (pin 36) | 3.3 V (pin 1) |
| - | GND | GND | GND |
| Out | GPIO32–39 (ADC1) | GP26/27/28 (ADC) | External ADC (MCP3008 / ADS1115) |

On the ESP32 use ADC1 pins (ADC2 does not work while Wi-Fi is on). The Raspberry Pi 4 has no ADC.

## Using the driver
```python
from guva_s12sd import GUVAS12SD
import time
uv = GUVAS12SD(26)        # GPIO number of the ADC pin Out is wired to
while True:
    print('V=%.3f I=%.0fnA UVI=%.1f' % (uv.voltage(), uv.photocurrent(), uv.uv_index()))
    time.sleep(1)
```
`voltage()` averages 32 samples (`read_uv()` on ESP32, else `read_u16()` × 3.3 V; pass `vref=` if your 3V3 rail differs).

## Gotchas
- **Glass blocks UV**: windows and most plastic covers stop UVB. Test outdoors or behind quartz/PTFE only.
- **UV index is approximate**: the 26 nA/UVI figure is typical; sensors vary and the reading depends on the sun angle. Calibrate against a reference meter for real numbers.
- **Low signal indoors**: indoor light gives only a few mV. ESP32 ADC readings below about 0.1 V are poor; average many samples.
- **5 V supply**: OUT can then exceed 3.3 V under a strong UV lamp; use 3.3 V or add a divider.
- **Never look at UV lamps** used for testing; UVC/UVB lamps burn eyes and skin.

## Datasheet
https://cdn-shop.adafruit.com/datasheets/1918guva.pdf
