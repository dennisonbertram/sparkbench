---
name: part-mq-131
description: Pinout, electrical limits, wiring and MicroPython driver for the MQ-131 ozone gas sensor module (Winsen MQ131 high concentration, AO + DO). Use when designing, wiring, simulating or writing code for an MQ-131 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MQ-131 ozone gas sensor module (MQ-131)

## Overview
The **MQ-131** is a heated metal-oxide gas sensor for **ozone (O3)**. Unlike the MQ-2/MQ-135 family it reacts to an **oxidising** gas: the Winsen manual says its conductivity **gets lower** as ozone rises, so **Rs rises and AO falls** with ozone. Hobbyists buy it on a **4-pin module** (blue board like the FC-22) that adds a load resistor, an **LM393 comparator**, a sensitivity trimmer, a power LED and a DO LED.
- Detection range 10–1000 ppm O3 (high-concentration MQ131). Also reacts to Cl2 and NO2, and in the opposite direction to organic gases
- Circuit and heater voltage: **5.0 V ±0.1 V**. Heater 30 Ω ±3 Ω, ≤ 950 mW (about **170 mA**). It gets hot
- Sensitivity: Rs(300 ppm O3) / Rs(air) ≥ 2; VRL changes by ≥ 1.0 V at 300 ppm (RL 10 kΩ)
- Preheat: **over 48 hours** for a new sensor (longer after storage: 72 h for 1–6 months, 168 h beyond)
- **AO** = voltage across the load resistor, which **falls with ozone** (datasheet Fig. 5: about 4 V in air, about 1.7 V at 1000 ppm with RL 10 kΩ)
- **DO** = LM393 output, **LOW while AO is above the trimmer threshold**, so it goes **HIGH when ozone pulls AO down**

## Pinout (module header, sensor facing you, pins down, left to right)
| Pin | Name | Function |
|-----|------|----------|
| 1 | VCC | 5 V supply (heater + comparator) |
| 2 | GND | Ground |
| 3 | DO | Digital output: LOW when AO is above the trimmer threshold (clean air), HIGH below it (ozone) |
| 4 | AO | Analog output, 0 to about 5 V, falls with ozone |

Some boards print the header in reverse (AO, DO, GND, VCC): follow the silkscreen on yours.

## Electrical limits
- VCC: **4.9–5.1 V** (datasheet Vc and VH 5.0 V ±0.1 V). 3.3 V under-heats the sensor and readings are meaningless.
- Current: about 170–190 mA from 5 V (heater ≤ 950 mW). Budget for it on USB power.
- AO and DO are **5 V signals**, and AO sits **highest in clean air** (around 4 V). ESP32 and Pico pins are 3.3 V max: use a divider (10 kΩ in series, 20 kΩ to GND gives ×2/3) on each and pass `divider=1.5`.

## Interface details
Datasheet basic circuit: Rs (sensor) and RL (load resistor) form a divider from Vc:
```
VRL (AO) = Vc × RL / (Rs + RL)
Rs = (Vc / VRL − 1) × RL
```
Ozone is read from **Rs/R0** on the datasheet's log-log chart (Fig. 3), where **R0 is the sensor resistance in clean air**; Rs/R0 climbs from about 1.2 at 10 ppm to about 8 at 1000 ppm. The chart is typical only, so **calibrate R0 on your own sensor**. The driver gives the voltage, Rs and Rs/R0. It does not invent ppm.
The datasheet curves use RL = 10 kΩ. Check the SMD load resistor on your module (103 = 10 kΩ, 102 = 1 kΩ) and pass `rl=`.
DO comes from the LM393 comparing AO with the trimmer voltage: set the trimmer just below the clean-air AO so DO goes HIGH when ozone appears.

## Wiring
| Module | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| VCC | 5V / VIN (USB 5 V) | VBUS (pin 40) | 5V (pin 2) |
| GND | GND | GND | GND |
| DO | any GPIO, e.g. GPIO25 (through divider) | any GP, e.g. GP2 (through divider) | any GPIO (through divider) |
| AO | GPIO32–39 (ADC1, through divider) | GP26/27/28 (ADC, through divider) | External ADC (MCP3008 / ADS1115) |

On the ESP32 use ADC1 pins (ADC2 does not work while Wi-Fi is on).

## Using the driver
```python
from mq131 import MQ131
import time
sensor = MQ131(32, 25, rl=10000, divider=1.5)  # AO GPIO, DO GPIO, 10k/20k dividers fitted
time.sleep(180)                                # warm-up
sensor.calibrate()                             # R0 = Rs now (in clean air)
while True:
    print('AO=%.2fV Rs=%.0f ohm Rs/R0=%.2f DO=%s' % (sensor.voltage(), sensor.resistance(), sensor.ratio(), 'low' if sensor.do_low() else 'high'))
    time.sleep(1)
```
`voltage()` averages 32 samples (`read_uv()` on ESP32, else `read_u16()` × 3.3 V). `do_low()` is True when DO is LOW (AO above threshold).

## Gotchas
- **Backwards compared with other MQ sensors**: ozone makes AO go **down** and Rs/R0 go **up**. Many shop pages copy the MQ-2 text ("higher concentration = higher voltage"); the Winsen manual and its Fig. 5 say otherwise.
- **DO polarity follows AO**: DO LOW = clean air on this sensor, DO HIGH = ozone above your threshold.
- **Low-concentration MQ131 (10–1000 ppb)** is a different sensor with a much larger Rs and a 100 kΩ-class load resistor; check which one your module carries.
- **Organic vapours push the other way**: alcohol and solvents lower Rs and can mask ozone.
- **Hot and hungry**: the can gets hot and the heater draws close to 200 mA. Not a 3.3 V part.
- **Ozone is toxic**: test with care and never rely on this as the only safety alarm.


## On a 3.3 V board
- **AO** can rise above 3.3 V, so on an ESP32 or Pico it goes to the GPIO through a divider: 33 kΩ from AO to the pin, 68 kΩ from the pin to GND (Sparkbench adds both resistors). The pin then sees 0.67 × the output voltage, so multiply ADC readings by 1.49 (the driver's `divider` / `div` argument does this).
- The divider also loads the board's 10 kΩ load resistor (RL ∥ 101 kΩ); pass `div=(top, bottom)` to the driver so Rs and VRL come out right.
- DO is pulled up to the module's 5 V, so Sparkbench leaves it unconnected and the example compares the AO reading in code. If you wire it, use a level shifter (or the divider above) and check it still reads high.

## Datasheet
https://www.winsen-sensor.com/d/files/manual/mq131-h.pdf

---
*Generated by Sparkbench from the datasheet: https://www.winsen-sensor.com/d/files/manual/mq131-h.pdf. Machine-readable definition: `part.json`.*
