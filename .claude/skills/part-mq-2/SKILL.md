---
name: part-mq-2
description: Pinout, electrical limits, wiring and MicroPython driver for the MQ-2 smoke & flammable gas sensor module (MQ-2, AO + DO). Use when designing, wiring, simulating or writing code for an MQ-2 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MQ-2 smoke & flammable gas sensor module (MQ-2)

## Overview
The **MQ-2** (Hanwei) is a heated tin-dioxide (SnO2) gas sensor. Its resistance **Rs drops** when LPG, propane, hydrogen, methane, alcohol vapour or smoke is in the air. Hobbyists buy it on a **4-pin module** (common blue FC-22-style board) that adds a load resistor, an **LM393 comparator**, a sensitivity trimmer, a power LED and a DO LED.
- Detects combustible gas from **300 to 10000 ppm**. It is good for "more or less gas than before", but it is **not a calibrated ppm meter**
- Heater: **5.0 V ±0.2 V**, 31 Ω ±3 Ω, ≤900 mW (about **160 mA**). It gets hot
- Sensing resistance: 2–20 kΩ in 2000 ppm propane; sensitivity Rs(air)/Rs(1000 ppm isobutane) ≥ 5
- Preheat: **over 48 hours** for a new sensor (datasheet), then a few minutes after each power-on
- **AO** = voltage across the load resistor, which **rises with gas**. **DO** goes **LOW** when AO passes the trimmer threshold

## Pinout (module header, sensor facing you, pins down, left to right)
| Pin | Name | Function |
|-----|------|----------|
| 1 | VCC | 5 V supply (heater + comparator) |
| 2 | GND | Ground |
| 3 | DO | Digital output: HIGH (5 V via pull-up) in clean air, **LOW when gas is above the threshold** |
| 4 | AO | Analog output, 0 to about 5 V, rises with gas |

## Electrical limits
- VCC: **4.8–5.2 V** (heater 5.0 V ±0.2 V). 3.3 V under-heats the sensor and readings are meaningless.
- Current: about 160 mA from 5 V. Budget for it on USB power.
- AO and DO are **5 V signals**. AO can exceed 3.3 V in strong gas, and DO sits at 5 V through the module's pull-up. ESP32 and Pico pins are 3.3 V max: use a divider (10 kΩ in series, 20 kΩ to GND gives ×2/3) on each.

## Interface details
Datasheet basic test loop: Rs (sensor) and RL (load resistor) form a divider from Vc:
```
VRL (AO) = Vc × RL / (Rs + RL)
Rs = (Vc / VRL − 1) × RL          (datasheet formula)
```
Gas concentration is read from **Rs/R0** on the datasheet's log-log chart (Fig. 1), where R0 is the sensor's resistance in a reference gas. The chart is typical only and every sensor differs, so **calibrate R0 on your own sensor**. The driver gives the voltage, Rs and Rs/R0. It does not invent ppm.
RL on most modules is **1 kΩ (SMD marked 102)**. Check yours and pass `rl=`.
DO comes from the LM393 comparing AO with the trimmer voltage: turn the trimmer until the DO LED just goes out in clean air.

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
from mq2 import MQ2
import time
sensor = MQ2(32, 25, rl=1000, div=(10000, 20000))   # AO GPIO, DO GPIO; div = the 10k/20k divider on AO
time.sleep(120)                               # warm-up
sensor.calibrate()                            # R0 = Rs now (in your reference air)
while True:
    print('AO=%.2fV Rs=%.0f ohm Rs/R0=%.2f gas=%s' % (sensor.voltage(), sensor.resistance(), sensor.ratio(), sensor.detected()))
    time.sleep(1)
```
`voltage()` averages 32 samples (`read_uv()` on ESP32, else `read_u16()` × 3.3 V). `detected()` is True when DO is LOW.

## Gotchas
- **DO is active LOW**: "gas" = 0, "clear" = 1. Some tutorials have this backwards.
- **Hot and hungry**: the can gets hot, and 160 mA can brown out a weak USB port. It is not a 3.3 V part.
- **Warm-up drift**: readings creep for minutes after power-on and for days on a new sensor.
- **Temperature and humidity** change Rs/R0 by roughly ±30 % (datasheet Fig. 2).
- **Not a safety device**: do not use it as your only gas or smoke alarm.
- **Silicone vapour, water and condensation** permanently damage sensitivity (datasheet notifications).


## On a 3.3 V board
- **AO** can rise above 3.3 V, so on an ESP32 or Pico it goes to the GPIO through a divider: 10 kΩ from AO to the pin, 20 kΩ from the pin to GND (Sparkbench adds both resistors). The pin then sees 0.67 × the output voltage, so multiply ADC readings by 1.5 (the driver's `divider` / `div` argument does this).
- The divider also loads the board's 1 kΩ load resistor (RL ∥ 30 kΩ); pass `div=(top, bottom)` to the driver so Rs and VRL come out right.
- DO is pulled up to the module's 5 V, so Sparkbench leaves it unconnected and the example compares the AO reading in code. If you wire it, use a level shifter (or the divider above) and check it still reads high.

## Datasheet
https://www.pololu.com/file/0J309/MQ2.pdf

---
*Generated by Sparkbench from the datasheet: https://www.pololu.com/file/0J309/MQ2.pdf. Machine-readable definition: `part.json`.*
