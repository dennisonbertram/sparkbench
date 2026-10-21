---
name: part-acs723
description: Pinout, electrical limits, wiring and MicroPython driver for the SparkFun Current Sensor Breakout - ACS723 (Low Current), SEN-14544 (Allegro ACS723LLCTR-05AB, ±5 A, with OPA344 gain/offset amplifier). Use when designing, wiring, simulating or writing code for an ACS723 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# SparkFun ACS723 current sensor breakout, Low Current (SEN-14544)

## Overview
The **ACS723** (Allegro MicroSystems) is a Hall-effect current sensor: the measured current flows through a 0.65 mΩ copper path inside the chip, electrically isolated from the sensing side, and the chip outputs an **analog voltage** proportional to AC or DC current. The SparkFun **Low Current** board (SEN-14544) uses the **ACS723LLCTR-05AB** (±5 A) and adds an **OPA344 amplifier** with two trimmers, **GAIN** and **Vref**, so small currents (tens of mA and up) give a bigger output swing.
- Chip: ±5 A range, **400 mV/A** at VCC = 5 V, zero-current output **VCC × 0.5**, ratiometric
- Chip noise: 15 mA rms (20 kHz bandwidth, board default) / 30 mA rms (80 kHz, JP1 closed)
- Amplifier gain: **2× to 22×** (GAIN trimmer; counter-clockwise = more gain)
- Supply: **4.5–5.5 V**, about 15 mA (chip 9 mA typ, 14 mA max)

## Pinout (3-pin header, one edge)
| Pin | Name | Function |
|-----|------|----------|
| 1 | VCC | Supply, 4.5–5.5 V (use 5 V) |
| 2 | VO | Amplified analog output, 0 V to VCC (rail-to-rail) |
| 3 | GND | Ground |

The measured current goes through the **IP+ / IP−** pads on the opposite edge (two large screw-post pads plus a 2-pin 0.1" header, J3), in series with the load. Current flowing in at IP+ and out at IP− is positive.

## Electrical limits
- Supply 4.5–5.5 V (absolute max 6 V). **3.3 V is not enough.**
- VO swings anywhere from 0 V to VCC (5 V) depending on the trimmers and the current. **A 5 V VO will damage a 3.3 V ADC pin**: measure VO with a multimeter before connecting it, or use a 10 kΩ / 20 kΩ divider (`divider=1.5`).
- Primary current ±5 A. The board is **not** designed for mains voltage even though the chip is rated 2.4 kV rms isolation: stay with low-voltage loads.

## Interface details
The amplifier is **inverting** (SparkFun schematic v10, VIOUT feeds the op-amp's −IN):
```
VIOUT = VCC/2 + 0.400 V/A × I              (chip, VCC = 5 V)
VO    = Vref + G × (Vref − VIOUT),  G = 22k / (1k + VR1) = 2 … 22
```
So **VO goes down as the current IP+ → IP− goes up**. Both the zero point and the slope depend on the trimmers, so calibrate the board once:
1. No current: read VO → `zero` (or call `calibrate_zero()`). Turn Vref to put it where you want (2.5 V for AC/bidirectional, near the top for one-direction DC since VO falls with current).
2. Pass a known current (e.g. 50 mA through 100 Ω from 5 V) → `calibrate_sensitivity(0.05)`.
3. `I = (VO − zero) / sensitivity`.

Sparkbench models the board with **GAIN at minimum (G = 2) and the Vref wiper at VCC/2**: VO = 2.5 V − 0.800 V/A × I, which is the driver's default (`zero=2.5`, `sensitivity=-0.8`). The slider covers −1 A to +3 A (VO 3.3 V to 0.1 V).

## Wiring
| Board | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| VCC | 5V / VIN (USB 5 V) | VBUS (pin 40) | 5V (pin 2) |
| VO | GPIO34 (ADC1) | GP26 / ADC0 (pin 31) | External ADC (e.g. ADS1115 A0) |
| GND | GND | GND | GND |

## Using the driver
```python
from acs723 import ACS723LC
import time
sensor = ACS723LC(26)            # GPIO of the ADC pin VO is wired to
# sensor.calibrate_zero()        # run once with no current flowing
# sensor.calibrate_sensitivity(0.05)  # then with a known 50 mA flowing
while True:
    print('I=%.3fA' % sensor.current())
    time.sleep(1)
```
The driver averages 64 samples, using calibrated `read_uv()` where the port has it (ESP32), otherwise `read_u16()` × 3.3 V / 65535. Once calibrated, hard-code the values: `ACS723LC(26, zero=2.47, sensitivity=-2.1)`.

## Gotchas
- **Output is inverted** on this board: more current IP+ → IP− gives a lower VO. A negative `sensitivity` handles that; don't swap the wires to "fix" it.
- **Vref is touchy:** with gain G the zero point moves (1 + G) times as much as the Vref wiper, and turning GAIN also moves the zero. Re-run `calibrate_zero()` after any trimmer change.
- **Use a plastic screwdriver** on the trimmers; a magnetised steel one disturbs the Hall sensor.
- **More gain = more noise.** At G = 22 the output is 8.8 V/A, so the 0–3.3 V ADC window covers only about 0.3 A.
- **Clipping:** VO stops at 0 V and VCC; readings beyond that are wrong, not just inaccurate.
- **Bandwidth jumper JP1** (back): open = 20 kHz, low noise (default); closed = 80 kHz.
- **AC current:** sample quickly over whole cycles and compute RMS around `zero`.
- The plain SparkFun ACS723 breakout (SEN-13679, no amplifier) has the same header but VO = VCC/2 + 0.4 V/A × I, non-inverted: use `zero=2.5, sensitivity=0.4`.

## Datasheet
https://cdn.sparkfun.com/assets/d/0/0/5/e/ACS723-Datasheet.pdf

---
*Generated by Sparkbench from the datasheet: https://cdn.sparkfun.com/assets/d/0/0/5/e/ACS723-Datasheet.pdf. Machine-readable definition: `part.json`.*
