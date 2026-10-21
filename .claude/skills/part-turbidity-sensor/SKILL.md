---
name: part-turbidity-sensor
description: Pinout, electrical limits, wiring and MicroPython driver for the analog turbidity sensor module (DFRobot Gravity SEN0189 and clones, A/D + VCC + GND). Use when designing, wiring, simulating or writing code for a turbidity / water cloudiness / NTU sensor in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Turbidity sensor module (DFRobot SEN0189)

## Overview
The **Gravity: Analog Turbidity Sensor (SEN0189)** from DFRobot, and its many clones, measures how cloudy water is. It is sold as a probe plus a small adapter board. The probe tip holds an infrared emitter and a receiver facing each other across a gap. Suspended particles (total suspended solids) scatter the light, so less of it reaches the receiver.
- The adapter board has one signal pin, **A/D**, and a **D/A slide switch**:
  - **A**: analog voltage, **0-4.5 V**, which **falls** as turbidity rises.
  - **D**: high/low output, flipping at a threshold you set with the trimmer (RP1).
- Clear water (< 0.5 NTU) reads about **4.1 V ± 0.3 V** at 10-50 °C. About 2.5 V means 3000 NTU.
- Response time under 500 ms. Operating temperature 5-90 °C.

## Pinout (Gravity 3-pin header)
| Pin | Name | Wire | Function |
|---|---|---|---|
| 1 | A/D | blue | Signal: analog (switch on A) or digital (switch on D) |
| 2 | VCC | red | 5 V supply |
| 3 | GND | black | Ground |

On the adapter's P1 connector, the black GND wire sits on the same side as the D/A switch. The probe's own cable plugs into P2.

## Electrical limits
- Supply: **5 V DC** (DFRobot gives a single 5 V figure, no tolerance range). It is not a 3.3 V part.
- Current: **40 mA max**.
- Output: 0-4.5 V analog. This is **above 3.3 V in clear water**.
- Insulation resistance 100 MΩ min. Storage -10 to 90 °C.

## Interface details
Read the voltage with an ADC, then use DFRobot's fitted curve (about 25 °C):
```
NTU = -1120.4 × V² + 5742.3 × V - 4352.9      valid for 2.5 V ≤ V ≤ 4.2 V  (3000 … 0 NTU)
```
Check points: 4.2 V → about 0 NTU, 3.9 V → about 1000 NTU, 2.5 V → 3000 NTU. Above 4.2 V the driver reports 0 NTU, and below 2.5 V it reports 3000 NTU (the curve's limits).
The curve is typical only. The output drops about 0.4 V from 10 °C to 50 °C (DFRobot's chart), and each probe differs. Calibrate in clear water, which shifts your probe's reading onto the curve.
1 NTU = 1 JTU = 1 mg/L (DFRobot's note).

## Wiring
| Module | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| A/D | GPIO34 (ADC1) through a divider | GP26 / ADC0 through a divider | External ADC (ADS1115 / MCP3008) |
| VCC | 5V / VIN (USB 5 V) | VBUS (pin 40) | 5V (pin 2) |
| GND | GND | GND | GND |

Divider: 10 kΩ from A/D to the ADC pin, 20 kΩ from the ADC pin to GND (×2/3, so 4.5 V becomes 3.0 V). Pass `divider=1.5` to the driver. The Raspberry Pi 4 has no ADC. On the ESP32, use ADC1 pins, because ADC2 stops working while Wi-Fi is on.

## Using the driver
```python
from turbidity import Turbidity
import time
sensor = Turbidity(34, divider=1.5)   # A/D through a 10k/20k divider
sensor.calibrate()                    # probe in clear (filtered or distilled) water
while True:
    print('V=%.2f NTU=%d' % (sensor.voltage(), int(sensor.ntu())))
    time.sleep(1)
```
`voltage()` averages 32 samples (`read_uv()` on the ESP32, otherwise `read_u16()` × 3.3 V) and multiplies by `divider`. `digital()` reads the pin level when the switch is on D.

## Gotchas
- **Switch position:** on D, the pin is only high/low. Put it on A for NTU.
- **Probe cable reversed:** a constant reading of about 0.04 V (DFRobot FAQ). Flip the probe's plug on P2.
- **5 V output on a 3.3 V ADC:** clear water gives about 4.1 V. Use a divider, or you risk damaging the pin.
- **Only the tip is waterproof.** Keep the top of the probe and the board dry.
- **Light and bubbles:** sunlight adds infrared and bubbles scatter it. Measure in shade, and let bubbles clear.
- **Not lab-grade:** treat readings as approximate, especially below about 100 NTU.

## Datasheet
DFRobot SEN0189 wiki (specification, curve and pinout): https://wiki.dfrobot.com/sen0189/
