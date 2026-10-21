---
name: part-gp2y0a02yk0f
description: Pinout, electrical limits, wiring and MicroPython driver for the Sharp GP2Y0A02YK0F long-range infrared distance sensor (20-150 cm, analog output). Use when designing, wiring, simulating or writing code for a GP2Y0A02YK0F in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Sharp GP2Y0A02YK0F infrared distance sensor (GP2Y0A02YK0F)

## Overview
The **Sharp GP2Y0A02YK0F** is the long-range sibling of the GP2Y0A21YK0F. It is a black sensor unit with an infrared LED, a position-sensitive detector (PSD) and a signal-processing IC. It measures distance by **triangulation** and puts out an **analog voltage**. Hobbyists buy the bare sensor, for example **Pololu #1137** or SparkFun SEN-08958. It has a 3-pin **JST PH**-style socket on the back, so you also need a 3-pin cable such as **Pololu #117** (male pins for a breadboard).
- Range: **20 to 150 cm**. The colour and reflectance of the target barely matter: white (90 %) and grey (18 %) paper give almost the same curve.
- Output **falls as the object moves away**: about 2.5 V at 20 cm and 0.44 V at 150 cm (typical). The relation is not linear, but it is roughly linear in 1/distance.
- A new reading every **38.3 ms ± 9.6 ms**. The output is unstable during the first measurement after power-up and is valid at most 5 ms after it ends, so about 53 ms after power-up (datasheet Fig. 1).

## Pinout (connector, datasheet "Terminal" table)
| Pin | Name | Function |
|-----|------|----------|
| 1 | Vo | Analog output voltage, to an ADC pin |
| 2 | GND | Ground |
| 3 | VCC | Supply, 4.5–5.5 V |

Seen from the back of the sensor, left to right, the pins are VCC, GND, Vo (Pololu). Cable colours vary between sellers. **Go by the pin numbers, not the colours.**

## Electrical limits
- Supply: **4.5–5.5 V** (recommended), absolute max 7 V. It does **not** work from 3.3 V: power it from 5 V / VBUS.
- Current: **33 mA typical, 50 mA max** on average, drawn in short bursts each time the IR LED flashes.
- Vo: typical peak about **2.75 V** (at about 15 cm), so it can go straight into a 3.3 V ADC pin even though the sensor runs on 5 V. Absolute max: −0.3 V to VCC + 0.3 V.
- Datasheet: put a **10 µF or larger capacitor between VCC and GND close to the sensor**.
- Operating temperature: −10 to +60 °C.

## Interface details
Sharp gives no formula, only typical curves (Fig. 2, VCC = 5 V, white paper with 90 % reflectance). Typical points read from that figure:

| L (cm) | 20 | 30 | 40 | 50 | 60 | 70 | 80 | 90 | 100 | 110 | 120 | 130 | 140 | 150 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Vo (V) | 2.53 | 1.99 | 1.53 | 1.24 | 1.05 | 0.90 | 0.82 | 0.72 | 0.66 | 0.59 | 0.55 | 0.50 | 0.47 | 0.44 |

The driver interpolates linearly in 1/L between these points. Guaranteed spread (table "Electro-optical characteristics"): Vo at 150 cm is 0.25–0.55 V (typ. 0.4 V) and the 20→150 cm swing ΔVo is 1.8–2.3 V (typ. 2.05 V). Beyond about 100 cm the curve is flat (about 0.06 V per 10 cm), so a given unit can be off by 10 cm or more out there. Calibrate against a tape measure if you need accuracy.
**Below 20 cm the output still rises, peaks at about 2.75 V near 15 cm, then falls** (2.3 V at 10 cm, 0 V at contact). A reading of 2.3 V could mean 23 cm or 10 cm. Mount the sensor so nothing can come closer than 20 cm.

## Wiring
| Sensor | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| VCC (pin 3) | 5V / VIN (USB 5 V) | VBUS (pin 40) | 5V (pin 2) |
| GND (pin 2) | GND | GND | GND |
| Vo (pin 1) | GPIO32–39 (ADC1) | GP26/27/28 (ADC) | External ADC (MCP3008 / ADS1115) |
| 10 µF capacitor | across VCC–GND near the sensor | same | same |

On the ESP32 use ADC1 pins (ADC2 does not work while Wi-Fi is on). The Raspberry Pi has no ADC.

## Using the driver
```python
from gp2y0a02yk import GP2Y0A02YK
import time
sensor = GP2Y0A02YK(32)          # GPIO number Vo is wired to
while True:
    d = sensor.distance_cm()     # None = nothing within 150 cm, or closer than 20 cm
    print('V=%.2f D=%s' % (sensor.voltage(), '--' if d is None else '%.0fcm' % d))
    time.sleep_ms(100)
```
`voltage()` averages 16 samples over about 3 ms (`read_uv()` on ESP32, else `read_u16()` × 3.3 V / 65535). `volts_to_cm(v)` is the datasheet-curve conversion on its own, if you read the voltage another way.

## Gotchas
- **Too close reads as far away**: below 15 cm the voltage drops again. This is the most common confusion.
- **Far readings are coarse**: 100–150 cm spans only about 0.2 V, so ADC noise turns into several cm. Average samples and add the 10 µF capacitor.
- **5 V only**: on 3.3 V it gives garbage or nothing.
- **Sunlight, glass and mirrors** upset it. The datasheet warns that direct sunlight or a tungsten lamp on the detector and mirror-like targets give wrong distances.
- **Edges**: if the target has a colour or material boundary, turn the sensor so the line from emitter to detector runs along the boundary. If the target moves sideways, turn it so that line is at right angles to the motion (datasheet notes).
- Keep the lenses clean, and do not wash the sensor.

## Datasheet
https://global.sharp/products/device/lineup/data/pdf/datasheet/gp2y0a02yk_e.pdf
