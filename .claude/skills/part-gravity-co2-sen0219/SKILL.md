---
name: part-gravity-co2-sen0219
description: Pinout, electrical limits, wiring and MicroPython driver for the DFRobot Gravity analog infrared (NDIR) CO2 sensor SEN0219 (0.4-2 V = 0-5000 ppm). Use when designing, wiring, simulating or writing code for a SEN0219 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# DFRobot Gravity analog infrared CO2 sensor (SEN0219)

## Overview
The **SEN0219** is an NDIR (non-dispersive infrared) CO2 module on a DFRobot Gravity carrier board. It measures real CO2 concentration (not a "gas index" like the MQ-135), with temperature compensation and automatic zero calibration to 400 ppm every 24 h.
- Analog output: **0.4–2.0 V = 0–5000 ppm**, linear. **0 V = fault** found by the self-check.
- Effective range 400–5000 ppm, accuracy ±(50 ppm + 5 % of reading), response T90 < 120 s.
- Preheat: at least 3 minutes after power-on before readings are stable.
- Later boards marked **"Infrared CO2 Sensor V2.0"** (DFRobot now sells SEN0219 as "PWM") output a PWM signal instead. This skill covers the **analog** version: check that your board's connector is marked analog ("A") and that it gives 0.4–2 V.

## Pinout (Gravity 3-pin PH2.0 connector, DFRobot board overview)
| Pin | Name | Wire | Function |
|---|---|---|---|
| 1 | Signal | blue/green | Analog output 0.4–2.0 V |
| 2 | VCC | red | +5 V supply |
| 3 | GND | black | Ground |

## Electrical limits
- Supply: **5 V** (DFRobot: 4.5–5.5 V on the analog version, 5.0 ±0.1 V on the V2.0 spec). It does **not** run on 3.3 V.
- Current: < 40 mA average, about 125 mA peak (the IR lamp pulses). Feed it from USB 5 V / VIN / VBUS.
- Signal tops out at 2.0 V, so it is safe for a 3.3 V ADC without a divider.
- Operating −10 to 50 °C, 0–95 %RH non-condensing.

## Interface details
DFRobot's conversion (sample code):
```
ppm = (mV − 400) × 50 / 16        # = (V − 0.4) × 5000 / 1.6
V == 0        → fault
0 < V < 0.4 V → preheating
```
DFRobot FAQ: on a 3.3 V microcontroller power the sensor from 5 V and convert the ADC reading with your 3.3 V reference.
Zero calibration by hand: after 20 min in 400 ppm (outdoor) air, short the board's **HD** pad to GND for more than 7 s.

## Wiring
| Sensor | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| Signal | GPIO32–39 (ADC1) | GP26/27/28 | external ADC (ADS1115 / MCP3008) |
| VCC | 5V / VIN | VBUS (pin 40) | 5V (pin 2) |
| GND | GND | GND | GND |

The board has a Gravity socket, not header pins: use the supplied Gravity cable or a PH2.0-to-jumper lead.

## Using the driver
```python
from sen0219 import SEN0219
import time
co2 = SEN0219(34)
while True:
    p = co2.ppm()
    print(co2.status() if p is None else 'CO2=%d ppm' % p)
    time.sleep(2)
```
`voltage()` averages 32 samples (`read_uv()` on the ESP32, else `read_u16()` × 3.3 V). `ppm()` returns None while faulted or preheating.

## Gotchas
- **5 V supply, 2 V signal**: never power it from 3V3; the signal itself never needs a divider.
- **Noisy readings**: average many samples (DFRobot forum advice) and allow the 120 s response time.
- **Fresh-air baseline**: outdoor air is about 400 ppm; auto-calibration assumes the room sees fresh air once a day.
- **ESP32 ADC accuracy**: use `read_uv()` (calibrated) and an ADC1 pin; ADC2 does not work with Wi-Fi on.
- **PWM V2.0 boards** read with pulse timing (ppm = (Th − 2 ms) × 5), not with this analog driver.

## Datasheet
https://web.archive.org/web/20220504221542/https://wiki.dfrobot.com/Gravity__Infrared_CO2_Sensor_For_Arduino_SKU__SEN0219
