---
name: part-mq-7
description: Pinout, electrical limits, wiring and MicroPython driver for the MQ-7 carbon monoxide gas sensor module (MQ-7, AO + DO). Use when designing, wiring, simulating or writing code for an MQ-7 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MQ-7 carbon monoxide gas sensor module (MQ-7)

## Overview
The **MQ-7** (Hanwei / Winsen) is a heated tin-dioxide (SnO2) gas sensor for **carbon monoxide (CO)**. Its resistance **Rs drops** as CO rises. Hobbyists buy it on a **4-pin module** (common blue FC-22-style board) that adds a load resistor, an **LM393 comparator**, a sensitivity trimmer, a power LED and a DO LED.
- Detection range: 10–500 ppm CO (Winsen manual v1.3; the older Hanwei sheet says 10–10000 ppm). It shows **more or less CO than before**. It is **not a calibrated ppm meter**
- **Heater cycle in the datasheet**: **5.0 V ±0.1 V for 60 s** (cleaning), then **1.5 V ±0.1 V for 90 s** (CO is measured at the end of this low phase)
- **The common module does not do this cycle.** It runs the heater at a constant 5 V, so AO responds to CO but does not match the datasheet curves
- Heater: 29–31 Ω (about **170 mA at 5 V**). It gets hot
- Sensing resistance 2–20 kΩ in 100 ppm CO. Sensitivity Rs(air)/Rs(150 ppm CO) ≥ 5
- Preheat: **over 48 hours** for a new sensor, then a few minutes after each power-on
- **AO** = voltage across the load resistor, which **rises with CO**. **DO** goes **LOW** when AO passes the trimmer threshold

## Pinout (module header, sensor facing you, pins down, left to right)
| Pin | Name | Function |
|-----|------|----------|
| 1 | VCC | 5 V supply (heater + comparator) |
| 2 | GND | Ground |
| 3 | DO | Digital output: HIGH (5 V via pull-up) in clean air, **LOW when CO is above the threshold** |
| 4 | AO | Analog output, 0 to about 5 V, rises with CO |

Some boards print the labels in the reverse direction (AO, DO, GND, VCC). Go by the labels on your board.

## Electrical limits
- VCC: **4.9–5.1 V** (datasheet heater high level 5.0 V ±0.1 V). Never apply more: the datasheet says over-voltage damages the heater. 3.3 V does not heat the sensor properly.
- Current: about 170 mA from 5 V. Budget for it on USB power.
- AO and DO are **5 V signals**. AO can exceed 3.3 V with a lot of CO, and DO sits at 5 V through the module's pull-up. ESP32 and Pico pins are 3.3 V max: put a divider (10 kΩ in series, 20 kΩ to GND gives ×2/3) on each.

## Interface details
Datasheet basic test loop: Rs (sensor) and RL (load resistor) form a divider from Vc:
```
VRL (AO) = Vc × RL / (Rs + RL)
Rs = (Vc / VRL − 1) × RL          (datasheet formula)
```
CO concentration is read from **Rs/R0** on the datasheet's log-log chart (Fig. 3), where R0 is the sensor's resistance in clean air. The chart is typical only and every sensor differs, so **calibrate R0 on your own sensor**. The driver gives the voltage, Rs and Rs/R0. It does not invent ppm.
RL on most modules is **1 kΩ (SMD marked 102)**. Check yours and pass `rl=`.
DO comes from the LM393 comparing AO with the trimmer voltage. Turn the trimmer until the DO LED just goes out in clean air.

For datasheet-grade readings you need to switch the heater yourself. Drive the sensor's heater from a logic-level MOSFET with PWM (about 28 % duty on 5 V gives roughly 1.5 V RMS), hold 5 V for 60 s and the low level for 90 s, and read AO just before the low phase ends. That means modifying the module, which is beyond the plain AO/DO wiring here.

## Wiring
| Module | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| VCC | 5V / VIN (USB 5 V) | VBUS (pin 40) | 5V (pin 2) |
| GND | GND | GND | GND |
| DO | any GPIO, e.g. GPIO25 (through divider) | any GP, e.g. GP2 (through divider) | any GPIO (through divider) |
| AO | GPIO32–39 (ADC1, through divider) | GP26/27/28 (ADC, through divider) | External ADC (MCP3008 / ADS1115) |

On the ESP32 use ADC1 pins (ADC2 does not work while Wi-Fi is on). The Raspberry Pi 4 has no ADC, so use DO alone or add one.

## Using the driver
```python
from mq7 import MQ7
import time
sensor = MQ7(32, 25, rl=1000, divider=1.0)   # AO GPIO, DO GPIO; divider=1.5 with a 10k/20k divider
time.sleep(120)                               # warm-up
sensor.calibrate()                            # R0 = Rs now (in clean air)
while True:
    print('AO=%.2fV Rs=%.0f ohm Rs/R0=%.2f CO=%s' % (sensor.voltage(), sensor.resistance(), sensor.ratio(), sensor.detected()))
    time.sleep(1)
```
`voltage()` averages 32 samples (`read_uv()` on ESP32, else `read_u16()` × 3.3 V). `detected()` is True when DO is LOW.

## Gotchas
- **Not a CO alarm.** CO is deadly and odourless. Never use this module as a safety device. Buy a certified CO alarm.
- **DO is active LOW**: "CO" = 0, "clear" = 1.
- **Constant-5 V modules** skip the datasheet's 60 s / 90 s heater cycle, so ppm curves from the datasheet do not apply.
- **Hot and hungry**: the can gets hot, and 170 mA can brown out a weak USB port. It is not a 3.3 V part.
- **Cross-sensitivity**: hydrogen, alcohol and methane also lower Rs (datasheet Fig. 3).
- **Temperature and humidity** shift Rs/R0 (datasheet Fig. 4).
- **Silicone vapour, water and condensation** permanently damage sensitivity (datasheet cautions).

## Datasheet
https://www.pololu.com/file/0J313/MQ7.pdf

---
*Generated by Sparkbench from the datasheet: https://www.pololu.com/file/0J313/MQ7.pdf. Machine-readable definition: `part.json`.*
