---
name: part-gp2y0a21yk
description: Pinout, electrical limits, wiring and MicroPython driver for the Sharp GP2Y0A21YK0F infrared distance sensor (10-80 cm, analog output). Use when designing, wiring, simulating or writing code for a GP2Y0A21YK in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Sharp GP2Y0A21YK0F infrared distance sensor (GP2Y0A21YK)

## Overview
The **Sharp GP2Y0A21YK0F** is a small black sensor unit with an infrared LED, a position-sensitive detector (PSD) and a signal-processing IC. It measures distance by **triangulation** and puts out an **analog voltage**. Hobbyists buy the bare sensor, for example **Pololu #136** or SparkFun SEN-00242. It has a 3-pin **JST PH** socket on the back, so you also need a 3-pin JST PH cable such as **Pololu #117** (male pins for a breadboard).
- Range: **10 to 80 cm**. Reflectance and colour of the target barely matter (triangulation).
- Output **falls as the object moves away**: about 2.3 V at 10 cm and 0.4 V at 80 cm (typical). The relation is not linear, but it is roughly linear in 1/distance.
- A new reading every **38.3 ms ± 9.6 ms**. The first reading after power-up is ready after about 48 ms (datasheet Fig. 1).

## Pinout (JST PH connector, datasheet "Connector signal")
| Pin | Name | Function |
|-----|------|----------|
| 1 | Vo | Analog output voltage, to an ADC pin |
| 2 | GND | Ground |
| 3 | VCC | Supply, 4.5–5.5 V |

Cable colours vary between sellers (often red = VCC, black = GND, yellow or white = Vo, but not always). **Go by the connector pin numbers, not the colours.** Pin 1 (Vo) is the end marked ① on the housing (datasheet outline drawing).

## Electrical limits
- Supply: **4.5–5.5 V** (recommended), absolute max 7 V. It does **not** work from 3.3 V: power it from 5 V / VBUS.
- Current: **30 mA typical, 40 mA max**, drawn in pulses each time the IR LED flashes.
- Vo: typical maximum about **3.1 V** (peak at about 6 cm), so it can go straight into a 3.3 V ADC pin even though the sensor runs on 5 V. Absolute max: −0.3 V to VCC + 0.3 V.
- Datasheet: put a **10 µF or larger capacitor between VCC and GND close to the sensor**. The LED pulses put ripple on the supply line, and the ripple shows up as noise on Vo.
- Operating temperature: −10 to +60 °C.

## Interface details
Sharp gives no formula, only typical curves (Fig. 2, VCC = 5 V, white paper with 90 % reflectance). Typical points read from that figure:

| L (cm) | 10 | 15 | 20 | 25 | 30 | 40 | 50 | 60 | 70 | 80 |
|---|---|---|---|---|---|---|---|---|---|---|
| Vo (V) | 2.32 | 1.64 | 1.31 | 1.08 | 0.92 | 0.74 | 0.60 | 0.51 | 0.44 | 0.40 |

The driver interpolates linearly in 1/L between these points. Guaranteed spread (Table "Electro-optical characteristics"): Vo at 80 cm is 0.25–0.55 V and the 10→80 cm swing ΔVo is 1.65–2.15 V. A given unit can therefore differ from the typical curve by several cm. Calibrate against a ruler if you need accuracy.
**Below 10 cm the output falls again** (peak about 3.1 V at 6 cm, falling to 0 V at contact). A reading of, say, 1.6 V could mean 15 cm or about 3 cm. Mount the sensor so nothing can come closer than 10 cm.

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
from gp2y0a21yk import GP2Y0A21YK
import time
sensor = GP2Y0A21YK(32)          # GPIO number Vo is wired to
while True:
    d = sensor.distance_cm()     # None = nothing within 80 cm, or closer than 10 cm
    print('V=%.2f D=%s' % (sensor.voltage(), '--' if d is None else '%.0fcm' % d))
    time.sleep_ms(100)
```
`voltage()` averages 16 samples over about 3 ms (`read_uv()` on ESP32, else `read_u16()` × 3.3 V / 65535). `volts_to_cm(v)` is the datasheet-curve conversion on its own, if you read the voltage another way.

## Gotchas
- **Too close reads as far away**: below 10 cm the voltage drops again. This is the most common confusion.
- **Noisy readings**: add the 10 µF capacitor and average several samples. Long thin cable makes it worse.
- **5 V only**: on 3.3 V it gives garbage or nothing.
- **Sunlight, glass and mirrors** upset it. The datasheet warns that direct sunlight or a tungsten lamp on the detector and mirror-like targets give wrong distances.
- **Edges**: if the target has a colour or material boundary, or moves sideways, turn the sensor so the line from emitter to detector runs along the boundary and across the direction of motion (datasheet notes).
- Keep the lenses clean, and do not wash the sensor.

## Datasheet
https://global.sharp/products/device/lineup/data/pdf/datasheet/gp2y0a21yk_e.pdf
