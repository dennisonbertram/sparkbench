---
name: part-tcs3200
description: Pinout, electrical limits, wiring and MicroPython driver for the TCS3200 / TCS230 colour sensor module (ams/TAOS TCS3200 light-to-frequency converter, S0-S3 / OE / OUT, four white LEDs). Use when designing, wiring, simulating or writing code for a TCS3200 or TCS230 colour sensor in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# TCS3200 colour sensor module (TCS3200)

## Overview
The **TCS3200** (ams, formerly TAOS; the older TCS230 is pin-compatible) has an 8 × 8 photodiode array: 16 photodiodes each with red, green and blue filters and 16 clear ones. A current-to-frequency converter turns the light on the selected group into a **square wave on OUT** whose frequency is proportional to irradiance. Hobbyists buy the square **28.4 × 28.4 mm TCS3200 / TCS230 colour recognition module** with four white LEDs around the chip and two 4-pin headers.

## Pinout (generic module, two headers on opposite edges)
| Header | Pin | Function |
|---|---|---|
| 1 | S0 | Output frequency scaling select |
| 1 | S1 | Output frequency scaling select |
| 1 | OE | Output enable, active low (high = OUT high-impedance) |
| 1 | GND | Ground |
| 2 | VCC | Supply 2.7–5.5 V (also lights the white LEDs) |
| 2 | OUT | Frequency output (push-pull, swings to VCC) |
| 2 | S2 | Photodiode (colour) select |
| 2 | S3 | Photodiode (colour) select |

The headers are on two edges, so the module is wired with jumper leads.

## Electrical limits
- Supply 2.7–5.5 V (abs. max 6 V). Chip 1.4 mA typ, 2 mA max; the four white LEDs draw more.
- Inputs: VIH ≥ 2 V, VIL ≤ 0.8 V at any VDD, so 3.3 V GPIOs drive them even at 5 V.
- OUT: VOH ≈ VDD (4–4.5 V at 5 V). **Power the module from 3.3 V** when OUT goes to an ESP32/Pico/Pi GPIO.
- Full-scale frequency: 600 kHz (100 %), 120 kHz (20 %), 12 kHz (2 %).

## Interface details
| S0 | S1 | Scaling | | S2 | S3 | Photodiodes |
|---|---|---|---|---|---|---|
| L | L | Power down | | L | L | Red |
| L | H | 2 % | | L | H | Blue |
| H | L | 20 % | | H | L | Clear |
| H | H | 100 % | | H | H | Green |

- Frequency ∝ light: count rising edges on OUT for a fixed window (or time a period).
- The 2 % and 20 % outputs are 50 % duty square waves; 100 % is a fixed-width pulse train. Use **2 %** with MicroPython interrupt counting (up to 12 kHz).
- A change on S0–S3/OE takes effect after one new output period + 1 µs.
- Inputs must never float: drive OE low (or tie it to GND).

## Wiring
- ESP32: VCC → 3V3, GND → GND, S0 → GPIO25, S1 → GPIO26, S2 → GPIO27, S3 → GPIO14, OE → GPIO13 (or GND), OUT → GPIO34.
- Pico: VCC → 3V3(OUT), GND → GND, S0 → GP2, S1 → GP3, S2 → GP4, S3 → GP5, OE → GP6 (or GND), OUT → GP7.
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, S0–S3 → GPIO5/6/13/19, OE → GND, OUT → GPIO26.

## Using the driver
```python
from tcs3200 import TCS3200
cs = TCS3200(s0=25, s1=26, s2=27, s3=14, out=34, oe=13, scaling=2)
r, g, b, c = cs.rgbc(100)
print('R=%d G=%d B=%d C=%d' % (r, g, b, c))
```

## Gotchas
- Readings are raw frequencies, not RGB: calibrate against a black and a white card and map each channel between them.
- Ambient light and IR leak in: shield the sensor and keep a fixed distance (1–2 cm) to the target.
- Powered from 5 V, OUT reaches ~4.5 V and needs a divider into a 3.3 V GPIO; 3.3 V supply avoids that.
- S0 = S1 = L is power-down: OUT goes high-impedance and no pulses arrive.

## Datasheet
https://electrokit.com/upload/quick/d9/61/4aab_41022691_TDS.pdf
