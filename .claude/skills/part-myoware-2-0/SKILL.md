---
name: part-myoware-2-0
description: Pinout, electrical limits, wiring and MicroPython driver for the MyoWare 2.0 Muscle Sensor (EMG, analog envelope output; SparkFun DEV-21265 / DEV-27924, VIN/GND/ENV, optional RECT/RAW). Use when designing, wiring, simulating or writing code for a MyoWare 2.0 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MyoWare 2.0 Muscle Sensor (EMG)

## Overview
The **MyoWare 2.0** (Advancer Technologies, sold by SparkFun as **DEV-21265**, now **DEV-27924**) is a triangular, wearable surface-EMG sensor. Three electrode snap sockets on the back (MID, END, REF) take standard gel electrodes, so the board sits right on the muscle. The signal chain (MyoWare 2.0 Advanced Guide):
- Instrumentation amplifier, **G = 200**, CMRR 140 dB, input bias 250 pA (1 nA max)
- Band-pass **20.8–498.4 Hz** (1st order each side)
- Full-wave rectifier, then a **3.6 Hz** passive envelope detector
- Adjustable gain stage: ENV gain **G = 200 × R / 1 kΩ** (R = GAIN pot setting, about 1x–100x for that stage)

**ENV** is the main output: near 0 V with the muscle relaxed and rising toward VIN the harder you flex. It is not calibrated in any physical unit; it is a relative effort level. RAW (centred on VIN/2) and RECT are optional outputs on back pads 5 and 4 (fixed G = 200, not affected by the GAIN pot).

## Pinout (pads on the back, numbered as in the Advanced Guide)
| # | Pin | Function |
|---|---|---|
| 1 | VIN | Supply, 2.27–5.47 V (typ. 3.3 V or 5 V) |
| 2 | GND | Ground |
| 3 | ENV | Envelope output, 0 V to VIN (main output) |
| 4 | RECT | Optional rectified EMG output (G = 200) |
| 5 | RAW | Optional raw EMG output, centred on VIN/2 (G = 200) |

VIN, GND and ENV are also on the male snaps on the front (for MyoWare shields). Other pads: MID, END, REF (electrode inputs for a cable). Most projects only wire VIN, GND and ENV.

## Electrical limits
- Supply: **min 2.27 V, max 5.47 V**; reverse-polarity protected.
- ENV swings 0 V to VIN. **On ESP32 / Pico / Raspberry Pi, power VIN from 3.3 V** so ENV never exceeds 3.3 V.
- Supply current is not specified in the Advanced Guide (it is small; a GPIO-board 3V3 rail is fine).

## Wiring
| Sensor | ESP32 | Raspberry Pi Pico | Raspberry Pi |
|---|---|---|---|
| VIN | 3V3 | 3V3(OUT) | 3.3 V (pin 1) |
| GND | GND | GND | GND |
| ENV | GPIO32–39 (ADC1) | GP26/27/28 | external ADC (ADS1115 / MCP3008) |

Solder wires (or a pin header and jumper leads) to the pads: the sensor is worn on the body, not plugged into a breadboard.

## Using the driver
```python
from myoware import MyoWare
m = MyoWare(34)            # GPIO wired to ENV
m.calibrate_rest()         # relax the muscle for 1 s
while True:
    print('ENV=%.2fV flex=%s' % (m.envelope(), m.flexed(0.5)))
```
`envelope()` averages 16 samples (volts); `activation()` is ENV minus the resting level; `flexed(threshold)` compares it to a threshold in volts.

## Gotchas
- **Electrode placement matters**: MID on the muscle belly, END 1–3 cm along the fibres, REF on a bony/neutral spot (elbow). Clean skin with alcohol; use fresh gel pads.
- **Safety and noise**: when electrodes are on a person, run the microcontroller from a battery or through a USB isolator, never from a mains-connected supply without isolation.
- **Gain**: turn the GAIN pot clockwise to raise ENV gain. If ENV sits flat at VIN when flexing, turn it down. Get it working at the default setting first.
- **5 V supply with a 3.3 V board** puts up to 5 V on the ADC pin: use 3.3 V.
- ESP32: use ADC1 pins (ADC2 is unusable while Wi-Fi is on).

## Datasheet
https://cdn.sparkfun.com/assets/learn_tutorials/1/9/5/6/MyoWare_v2_AdvancedGuide-Updated.pdf
