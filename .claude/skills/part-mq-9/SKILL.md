---
name: part-mq-9
description: Pinout, electrical limits, wiring and MicroPython driver for the MQ-9 carbon monoxide and flammable gas sensor module (MQ-9, AO + DO). Use when designing, wiring, simulating or writing code for an MQ-9 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MQ-9 carbon monoxide & flammable gas sensor module (MQ-9)

## Overview
The **MQ-9** (Hanwei) is a heated tin-dioxide (SnO2) gas sensor for **carbon monoxide (CO)** and **combustible gases (methane, propane / LPG)**. Its resistance **Rs drops** as gas rises. Hobbyists buy it on a **4-pin module** (common blue FC-22-style board) that adds a load resistor, an **LM393 comparator**, a sensitivity trimmer, a power LED and a DO LED.
- Detection range: **10–1000 ppm CO**, **100–10000 ppm combustible gas** (datasheet). It shows **more or less gas than before**. It is **not a calibrated ppm meter**
- **Heater cycle in the datasheet**: **5.0 V ±0.2 V for 60 s** (high temperature: detects methane/propane and cleans off adsorbed gas), then **1.5 V ±0.1 V for 90 s** (low temperature: detects CO)
- **The common module does not do this cycle.** It runs the heater at a constant 5 V, so it mostly responds to **combustible gas**; its CO response does not match the datasheet curves
- Heater: 31 Ω ±3 Ω, ≤ 350 mW (about **160 mA at 5 V**, about 170 mA for the whole module). It gets hot
- Sensing resistance 2–20 kΩ in 100 ppm CO. Sensitivity Rs(air)/Rs(100 ppm CO) ≥ 5
- Preheat: **over 48 hours** for a new sensor, then a few minutes after each power-on
- **AO** = voltage across the load resistor, which **rises with gas**. **DO** goes **LOW** when AO passes the trimmer threshold

## Pinout (module header, left to right as printed)
| Pin | Name | Function |
|-----|------|----------|
| 1 | VCC | 5 V supply (heater + comparator) |
| 2 | GND | Ground |
| 3 | DO | Digital output: HIGH (5 V via pull-up) in clean air, **LOW when gas is above the threshold** |
| 4 | AO | Analog output, 0 to about 5 V, rises with gas |

Some sellers' boards print the labels in another order (e.g. GND, VCC, DO, AO). Go by the labels on your board.

## Electrical limits
- VCC: **4.9–5.1 V** (datasheet standard test condition Vc 5.0 V ±0.1 V, heater high level 5.0 V ±0.2 V). The datasheet says over-voltage damages the heater. 3.3 V does not heat the sensor properly.
- Current: about 170 mA from 5 V. Budget for it on USB power.
- AO and DO are **5 V signals**. AO can exceed 3.3 V with a lot of gas, and DO sits at 5 V through the module's pull-up. ESP32 and Pico pins are 3.3 V max: put a divider (10 kΩ in series, 20 kΩ to GND gives ×2/3) on each.

## Interface details
Datasheet basic test loop: Rs (sensor) and RL (load resistor) form a divider from Vc:
```
VRL (AO) = Vc × RL / (Rs + RL)
Rs = (Vc / VRL − 1) × RL          (datasheet formula)
```
Concentration is read from **Rs/R0** on the datasheet's log-log chart (Fig. 1), where **R0 is the sensor's resistance in 1000 ppm LPG**. The chart is typical only and every sensor differs, so **calibrate R0 on your own sensor**. The driver gives the voltage, Rs and Rs/R0. It does not invent ppm.
RL on most modules is **1 kΩ (SMD marked 102)**. Check yours and pass `rl=`.
DO comes from the LM393 comparing AO with the trimmer voltage. Turn the trimmer until the DO LED just goes out in clean air.

For datasheet-grade CO readings you need to switch the heater yourself: hold 5 V for 60 s, then 1.5 V for 90 s (e.g. PWM through a logic-level MOSFET), and read AO near the end of each phase (CO at the end of the low phase, combustible gas at the end of the high phase). That means modifying the module, which is beyond the plain AO/DO wiring here.

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
from mq9 import MQ9
import time
sensor = MQ9(32, 25, rl=1000, divider=1.0)   # AO GPIO, DO GPIO; divider=1.5 with a 10k/20k divider
time.sleep(120)                               # warm-up
sensor.calibrate()                            # R0 = Rs now (clean air; the datasheet's R0 is Rs in 1000 ppm LPG)
while True:
    print('AO=%.2fV Rs=%.0f ohm Rs/R0=%.2f gas=%s' % (sensor.voltage(), sensor.resistance(), sensor.ratio(), sensor.detected()))
    time.sleep(1)
```
`voltage()` averages 32 samples (`read_uv()` on ESP32, else `read_u16()` × 3.3 V). `detected()` is True when DO is LOW.

## Gotchas
- **Not a gas or CO alarm.** Never use this module as a safety device. Buy a certified CO / gas alarm.
- **DO is active LOW**: "gas" = 0, "clear" = 1.
- **Constant-5 V modules** skip the datasheet's 60 s / 90 s heater cycle, so they act mostly as a combustible-gas sensor and the CO curve does not apply.
- **Hot and hungry**: the can gets hot, and 170 mA can brown out a weak USB port. It is not a 3.3 V part.
- **Cross-sensitivity**: CO, methane and LPG all lower Rs (datasheet Fig. 1), so the module cannot tell them apart.
- **Temperature and humidity** shift Rs/R0 (datasheet Fig. 2).
- **Silicone vapour, corrosive gas, water and condensation** permanently damage sensitivity (datasheet notifications).

## Datasheet
https://www.pololu.com/file/0J314/MQ9.pdf

---
*Generated by Sparkbench from the datasheet: https://www.pololu.com/file/0J314/MQ9.pdf. Machine-readable definition: `part.json`.*
