---
name: part-gp2y0a41sk0f
description: Pinout, electrical limits, wiring and MicroPython driver for the Sharp GP2Y0A41SK0F infrared distance sensor (4-30 cm, analog output). Use when designing, wiring, simulating or writing code for a GP2Y0A41SK0F in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Sharp GP2Y0A41SK0F infrared distance sensor (GP2Y0A41SK0F)

## Overview
The **Sharp/Socle GP2Y0A41SK0F** is a small black sensor unit with an infrared LED, a position-sensitive detector (PSD) and a signal-processing IC. It measures distance by **triangulation** and puts out an **analog voltage**. Hobbyists buy the bare sensor, for example **Pololu #2464**. It has a 3-pin **JST PH** socket on the back, so you also need a 3-pin JST PH cable such as **Pololu #117** (or #1799 with male pins for a breadboard).
- Range: **4 to 30 cm** (the short-range version of the GP2Y0A21YK). Reflectance and colour of the target barely matter (triangulation).
- Output **falls as the object moves away**: about 2.7 V at 4 cm and 0.4 V at 30 cm (typical). Sharp plots it against **1/(L + 0.42 cm)**, where it is close to a straight line.
- A new reading every **16.5 ms ± 3.7 ms**. The first output is valid at most 5 ms after the first measurement, i.e. about 25 ms after power-up (datasheet timing chart).

## Pinout (JST PH connector, datasheet "Connector signal")
| Pin | Name | Function |
|-----|------|----------|
| 1 | Vo | Analog output voltage, to an ADC pin |
| 2 | GND | Ground |
| 3 | VCC | Supply, 4.5–5.5 V |

Cable colours vary between sellers (often red = VCC, black = GND, yellow or white = Vo, but not always). **Go by the connector pin numbers, not the colours.** Pins are marked ①②③ on the housing next to the connector (datasheet outline drawing).

## Electrical limits
- Supply: **4.5–5.5 V** (operating), absolute max 7 V. It does **not** work from 3.3 V: power it from 5 V / VBUS.
- Current: **12 mA average, 22 mA max**, but the IR LED is pulsed at about **111 mA**.
- Vo: typical maximum about **3.05 V** (peak at about 3 cm), so it can go straight into a 3.3 V ADC pin even though the sensor runs on 5 V. Absolute max: −0.3 V to VCC + 0.3 V.
- Datasheet: put a **10 µF or larger by-pass capacitor between VCC and GND close to the sensor**. The LED pulses put ripple on the supply line, and the ripple shows up as noise on Vo.
- Operating temperature: −10 to +60 °C.

## Interface details
Sharp gives no formula, only typical curves (VCC = 5 V, white paper with 90 % reflectance). Typical points read from the datasheet figure:

| L (cm) | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 12 | 14 | 16 | 18 | 20 | 25 | 30 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Vo (V) | 2.72 | 2.34 | 2.02 | 1.77 | 1.56 | 1.39 | 1.27 | 1.06 | 0.93 | 0.81 | 0.73 | 0.66 | 0.53 | 0.43 |

The driver interpolates linearly in 1/(L + 0.42) between these points, the axis Sharp uses to show the curve is nearly linear. Guaranteed spread (Table "Electro-optical characteristics"): Vo at 30 cm is 0.25–0.55 V (typ 0.4 V) and the 30→4 cm swing ΔVo is 1.95–2.55 V (typ 2.25 V). A given unit can therefore differ from the typical curve by a cm or more. Calibrate against a ruler if you need accuracy.
**Below 4 cm the output falls again** (peak about 3.05 V at 3 cm, 2.2 V at 2 cm, down to 0 V at contact). A reading of 2.2 V could mean 5.5 cm or 2 cm. Mount the sensor so nothing can come closer than 4 cm.

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
from gp2y0a41sk import GP2Y0A41SK
import time
sensor = GP2Y0A41SK(32)          # GPIO number Vo is wired to
while True:
    d = sensor.distance_cm()     # None = nothing within 30 cm, or closer than 4 cm
    print('V=%.2f D=%s' % (sensor.voltage(), '--' if d is None else '%.0fcm' % d))
    time.sleep_ms(100)
```
`voltage()` averages 16 samples over about 3 ms (`read_uv()` on ESP32, else `read_u16()` × 3.3 V / 65535). `volts_to_cm(v)` is the datasheet-curve conversion on its own, if you read the voltage another way.

## Gotchas
- **Too close reads as farther away**: below 4 cm the voltage drops again. This is the most common confusion.
- **Noisy readings**: add the 10 µF capacitor and average several samples. Long thin cable makes it worse.
- **5 V only**: on 3.3 V it gives garbage or nothing.
- **Do not mix it up with the GP2Y0A21YK** (10–80 cm): same connector and look, different curve.
- **Sunlight, glass and mirrors** upset it. The datasheet warns that direct sunlight or a tungsten lamp on the detector and mirror-like targets give wrong distances.
- **Edges**: if the target has a colour or material boundary, or moves sideways, turn the sensor so the line from emitter to detector runs along the boundary and across the direction of motion (datasheet notes).
- Keep the lenses clean, and do not wash the sensor.

## Datasheet
https://global.sharp/products/device/lineup/data/pdf/datasheet/gp2y0a41sk_e.pdf
