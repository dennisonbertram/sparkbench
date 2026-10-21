---
name: part-mq-8
description: Pinout, electrical limits, wiring and MicroPython driver for the MQ-8 hydrogen gas sensor module (MQ-8, AO + DO). Use when designing, wiring, simulating or writing code for an MQ-8 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MQ-8 hydrogen gas sensor module (MQ-8)

## Overview
The **MQ-8** (Hanwei / Winsen) is a heated tin-dioxide (SnO2) gas sensor for **hydrogen (H2)**, with little response to alcohol, LPG, methane, CO and cooking fumes. Its resistance **Rs drops** as hydrogen rises. Hobbyists buy it on a **4-pin module** (common blue FC-22-style board) that adds a load resistor, an **LM393 comparator**, a sensitivity trimmer, a power LED and a DO LED.
- Detection range: **100–10000 ppm H2** (Hanwei), **100–1000 ppm H2** (Winsen v1.4). It shows **more or less hydrogen than before**. It is **not a calibrated ppm meter**
- Heater: 31 Ω ±5 % (Hanwei; Winsen lists 29 Ω ±3 Ω), ≤ 800–900 mW, so about **160–170 mA at 5 V** for the whole module. It gets hot
- Sensing resistance **10–60 kΩ in 1000 ppm H2**. Sensitivity Rs(air)/Rs(1000 ppm H2) ≥ 5. Slope Rs(1000 ppm)/Rs(500 ppm) ≤ 0.6
- Preheat: **over 24 hours** (Hanwei) / **over 48 hours** (Winsen) for a new sensor, then a few minutes after each power-on
- **AO** = voltage across the load resistor, which **rises with hydrogen**. **DO** goes **LOW** when AO passes the trimmer threshold

## Pinout (module header, left to right as printed)
| Pin | Name | Function |
|-----|------|----------|
| 1 | VCC | 5 V supply (heater + comparator) |
| 2 | GND | Ground |
| 3 | DO | Digital output: HIGH (5 V via pull-up) in clean air, **LOW when H2 is above the threshold** |
| 4 | AO | Analog output, 0 to about 5 V, rises with hydrogen |

Some sellers' boards (e.g. black ones) print the labels in another order, such as VCC, AO, DO, GND. Go by the labels on your board.

## Electrical limits
- VCC: **4.9–5.1 V** (datasheet standard condition Vc 5 V ±0.1 V, VH 5 V ±0.1 V). The datasheet says over-voltage damages the heater. 3.3 V does not heat the sensor properly.
- Current: about 170 mA from 5 V. Budget for it on USB power.
- AO and DO are **5 V signals**. AO can exceed 3.3 V with a lot of hydrogen (Winsen: VRL 2.5–4.0 V in 1000 ppm H2), and DO sits at 5 V through the module's pull-up. ESP32 and Pico pins are 3.3 V max: put a divider (10 kΩ in series, 20 kΩ to GND gives ×2/3) on each.
- Operating temperature −10 to 50 °C, humidity below 95 %RH, needs normal oxygen (21 %).

## Interface details
Datasheet basic test circuit: Rs (sensor) and RL (load resistor) form a divider from Vc:
```
VRL (AO) = Vc × RL / (Rs + RL)
Rs = (Vc / VRL − 1) × RL          (datasheet formula)
```
Concentration is read from **Rs/R0** on the datasheet's log-log chart. **Hanwei defines R0 as Rs in 1000 ppm H2**; Winsen's v1.4 manual uses Rs in clean air. The chart is typical only and every sensor differs, so **calibrate R0 on your own sensor**. The driver gives the voltage, Rs and Rs/R0. It does not invent ppm.
The datasheet recommends RL about **10 kΩ (5–33 kΩ)**. Many modules fit **1 kΩ (SMD marked 102)**. Check yours and pass `rl=`.
DO comes from the LM393 comparing AO with the trimmer voltage. Turn the trimmer until the DO LED just goes out in clean air.

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
from mq8 import MQ8
import time
sensor = MQ8(32, 25, rl=1000, divider=1.0)   # AO GPIO, DO GPIO; divider=1.5 with a 10k/20k divider
time.sleep(120)                               # warm-up
sensor.calibrate()                            # R0 = Rs now (clean air; Hanwei's R0 is Rs in 1000 ppm H2)
while True:
    print('AO=%.2fV Rs=%.0f ohm Rs/R0=%.2f H2=%s' % (sensor.voltage(), sensor.resistance(), sensor.ratio(), sensor.detected()))
    time.sleep(1)
```
`voltage()` averages 32 samples (`read_uv()` on ESP32, else `read_u16()` × 3.3 V). `detected()` is True when DO is LOW.

## Gotchas
- **Not a hydrogen safety alarm.** Never use this module to protect people (e.g. battery-room or fuel-cell leaks). Use a certified detector.
- **DO is active LOW**: "H2" = 0, "clear" = 1.
- **Hot and hungry**: the can gets hot, and 170 mA can brown out a weak USB port. It is not a 3.3 V part.
- **Cross-sensitivity**: alcohol, LPG, methane and CO also lower Rs a little (datasheet sensitivity chart).
- **Temperature and humidity** shift Rs/R0 (datasheet Fig. 4).
- **Silicone vapour, corrosive gas, water and condensation** permanently damage sensitivity (datasheet cautions).

## Datasheet
https://cdn.sparkfun.com/datasheets/Sensors/Biometric/MQ-8.pdf

---
*Generated by Sparkbench from the datasheet: https://cdn.sparkfun.com/datasheets/Sensors/Biometric/MQ-8.pdf. Machine-readable definition: `part.json`.*
