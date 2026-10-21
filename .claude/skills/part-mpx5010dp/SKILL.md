---
name: part-mpx5010dp
description: Pinout, electrical limits, wiring and MicroPython driver for the MPX5010DP differential pressure sensor (NXP/Freescale, 0-10 kPa, analog output). Use when designing, wiring, simulating or writing code for an MPX5010DP in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MPX5010DP differential pressure sensor (0–10 kPa)

## Overview
The **MPX5010DP** (NXP, formerly Freescale) is a piezoresistive silicon pressure sensor with on-chip amplification, temperature compensation and calibration. It gives an **analog voltage** proportional to the **difference** in pressure between its two ports (P1 − P2). Hobbyists buy the bare sensor in its six-pin **unibody package (case 867C)** with two hose barbs: port P1 (pressure, on the side with the part marking) and port P2 (vacuum).
- Range: **0 to 10 kPa** (0 to 1.45 psi, about 0 to 1020 mm of water)
- Output: **0.2 V at 0 kPa to 4.7 V at 10 kPa** with a 5 V supply (450 mV per kPa)
- Transfer function: **Vout = VS × (0.09 × P + 0.04)**, ratiometric to the supply
- Accuracy: ±5.0 % of full-scale span (0 to 85 °C); response time 1 ms, warm-up 20 ms
- Supply: **4.75–5.25 V**, 5 mA typical (10 mA max)

Typical uses: water level in a tank (via a tube), airflow across a filter, breath sensors.

## Pinout (unibody case 867C, pins 2.54 mm apart)
Pin 1 is the lead with the notch. Read from pin 1:

| Pin | Name | Function |
|-----|------|----------|
| 1 | VOUT | Analog output: 0.2 V at 0 kPa, +0.45 V per kPa (VS = 5 V) |
| 2 | GND | Ground |
| 3 | VCC | Supply VS, 4.75–5.25 V (use 5 V) |
| 4 | V1 | Internal test pin: do not connect |
| 5 | V2 | Internal test pin: do not connect |
| 6 | VEX | Internal test pin: do not connect |

## Electrical limits
- Supply: 4.75 V min, 5.25 V max. **3.3 V is not enough.**
- Maximum pressure: 40 kPa on P1 (P1 > P2 only). The sensor is designed for positive differential pressure: P1 must be higher than P2.
- Pressure media: **dry air** only. Liquid in the ports damages it (for water level, use an air column in a tube).
- Operating temperature −40 to +125 °C.
- Output source current only 0.1 mA at full scale: use a high-impedance input (an ADC is fine).

## Interface details
Conversion formula (datasheet, nominal):
```
P (kPa) = (Vout / VS − 0.04) / 0.09
```
With VS = 5 V: 0.2 V = 0 kPa, 2.0 V = 4.0 kPa, 3.3 V = 6.9 kPa, 4.7 V = 10 kPa.
The zero-pressure output varies from 0 to 0.425 V between parts: call `calibrate_zero()` once with both ports open to air.
The datasheet's recommended circuit: 1.0 µF and 0.01 µF from VCC to GND, and 470 pF from VOUT to GND.

## Wiring
| Sensor | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| VCC (pin 3) | 5V / VIN (USB 5 V) | VBUS (pin 40) | 5V (pin 2) |
| VOUT (pin 1) | GPIO34 (ADC1) via divider | GP26 / ADC0 (pin 31) via divider | External ADC (e.g. ADS1115 A0) |
| GND (pin 2) | GND | GND | GND |

**VOUT reaches 4.7 V**, and a 3.3 V board's ADC pin must stay below 3.3 V (3.6 V absolute max). Above about 6.9 kPa a direct connection over-drives the pin. For the full range, add a divider: **10 kΩ from VOUT to the ADC pin, 20 kΩ from the ADC pin to GND** (4.7 V becomes 3.13 V) and pass `divider=1.5` to the driver. Wired directly, only readings up to about 6.5 kPa are usable.

## Using the driver
```python
from mpx5010 import MPX5010
import time
sensor = MPX5010(26, divider=1.5)   # ADC GPIO wired to VOUT via a 10k/20k divider, VS = 5 V
sensor.calibrate_zero()             # both ports open to air
while True:
    print('P=%.2f kPa' % sensor.pressure_kpa())
    time.sleep(1)
```
The driver averages 32 samples. It uses calibrated `read_uv()` where the port has it (ESP32), otherwise `read_u16()` × 3.3 V / 65535. Pass `vs=` if your 5 V rail is not 5.0 V. `pressure_mmh2o()` gives mm of water (1 kPa = 101.97 mmH2O).

## Gotchas
- **Power it from 5 V,** not 3.3 V. The output is ratiometric: a 4.8 V USB rail scales every reading by 0.96 unless you pass `vs=4.8`.
- **Use a divider on 3.3 V boards** (see Wiring). Without it, pressures above about 6.9 kPa push VOUT past 3.3 V.
- **Which port is which:** P1 (positive pressure) is the port on the side with the part marking. Reversed tubing gives a reading stuck at the 0 kPa output.
- **Offset varies** up to 0.425 V between parts (up to about 0.5 kPa): calibrate the zero.
- **ESP32 ADC** is nonlinear near the ends of its range; use ADC1 pins (ADC2 stops working with Wi-Fi on).
- **Bending the leads** at the package body can crack the unibody seal; bend them a few mm away.


## On a 3.3 V board
- **VOUT** can rise above 3.3 V, so on an ESP32 or Pico it goes to the GPIO through a divider: 33 kΩ from VOUT to the pin, 68 kΩ from the pin to GND (Sparkbench adds both resistors). The pin then sees 0.67 × the output voltage, so multiply ADC readings by 1.49 (the driver's `divider` / `div` argument does this).

## Datasheet
https://ece-classes.usc.edu/ee459/library/datasheets/MPX5010.pdf (NXP/Freescale MPX5010 Rev 13)

---
*Generated by Sparkbench from the datasheet: https://ece-classes.usc.edu/ee459/library/datasheets/MPX5010.pdf. Machine-readable definition: `part.json`.*
