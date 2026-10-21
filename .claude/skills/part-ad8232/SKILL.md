---
name: part-ad8232
description: Pinout, electrical limits, wiring and MicroPython driver for the AD8232 single-lead heart rate (ECG) monitor (SparkFun SEN-12650 and clones). Use when designing, wiring, simulating or writing code for an AD8232 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# AD8232 heart rate (ECG) monitor (AD8232)

## Overview
The **AD8232** from Analog Devices is an analog front end for single-lead ECG / heart-rate monitoring. Three skin electrodes (RA, LA, RL) feed an instrumentation amplifier, filters and a right-leg drive. The board amplifies the heart's signal to an analog **OUTPUT** centred on half the supply, and two comparators (**LO+**, **LO-**) flag a loose electrode. Hobbyists buy it as the **SparkFun AD8232 Single Lead Heart Rate Monitor (SEN-12650)** or the red/purple clone modules with the same 6-pin header and a 3.5 mm electrode-cable jack. It is not a medical device.

## Pinout (SparkFun SEN-12650 header, left to right)
| Pin | Function |
|---|---|
| GND | Ground |
| 3.3v | Supply, 2.0–3.5 V, no regulator |
| OUTPUT | Analog ECG, rests near VS/2 (1.65 V) |
| LO- | Leads-off for −IN (RA electrode): HIGH = off |
| LO+ | Leads-off for +IN (LA electrode): HIGH = off |
| SDN | Shutdown, active low, 10 kΩ pull-up on the board (optional) |

The RA / LA / RL pads and the 3.5 mm jack on the other edge carry the electrode signals (jack: tip = RL, ring = LA, sleeve = RA).

## Electrical limits
- Supply: **2.0–3.5 V**, absolute maximum 3.6 V. **Never 5 V.**
- Current: 170 µA typical (230 µA max), 40 nA in shutdown, plus the on-board LED (1 kΩ from OUTPUT) when it flashes.
- OUTPUT swing 0.1 V to VS − 0.1 V. LO± are push-pull logic outputs (VOH ≈ VS).
- On the SparkFun board AC/DC is tied to GND, so it is in **DC leads-off mode**: LO+ shows +IN (LA), LO- shows −IN (RA).

## Wiring
- ESP32: GND → GND, 3.3v → 3V3, OUTPUT → an ADC1 pin (e.g. D32), LO- → D25, LO+ → D26, SDN unconnected.
- Pico: GND → GND, 3.3v → 3V3(OUT), OUTPUT → GP28 (ADC2), LO- → GP2, LO+ → GP3.
- Raspberry Pi: no ADC; use an ADS1115 or MCP3008 for OUTPUT.

## Using the driver
```python
from ad8232 import AD8232
ecg = AD8232(32, lo_plus=26, lo_minus=25)
if ecg.leads_off():
    print('Check the electrodes')
else:
    print('BPM=%d' % round(ecg.bpm()))
```
`bpm()` learns the signal's range for 2 s, then times 4 beat intervals between rising crossings of a 60 % threshold (re-armed below 40 %, 250 ms refractory). It returns None with no clear signal or with a lead off. `voltage()` gives the raw OUTPUT voltage for plotting.

## Gotchas
- 5 V on the 3.3v pin destroys the chip: there is no regulator.
- When LO+ or LO- is high, OUTPUT drifts to a rail; ignore it.
- Movement, breathing and dry pads make the baseline wander; keep still and use fresh gel electrodes.
- Mains hum: run on battery or a laptop on battery when electrodes are on a person, for safety and for a clean signal.
- On ESP32 use an ADC1 pin (ADC2 is unusable while Wi-Fi is on).

## Datasheet
https://www.analog.com/media/en/technical-documentation/data-sheets/ad8232.pdf
