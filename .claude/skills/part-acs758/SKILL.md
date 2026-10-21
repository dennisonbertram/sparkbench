---
name: part-acs758
description: Pinout, electrical limits, wiring and MicroPython driver for the ACS758 Hall-effect current sensor module (ACS758LCB-050B, ±50 A, CJMCU-758 / MCU-758 board). Use when designing, wiring, simulating or writing code for an ACS758 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# ACS758 50 A current sensor module (ACS758LCB-050B)

## Overview
The **ACS758** (Allegro MicroSystems) is a Hall-effect current sensor for large currents. The current flows through a 100 µΩ copper conductor in the chip's thick tabs, which is electrically isolated from the sensing side. It gives an **analog voltage** proportional to the current, AC or DC, in both directions. Hobbyists buy it on the purple **CJMCU-758 / "MCU-758 ACS758LCB-050B-PFF-T" module**: two large IP+ / IP− pads for the measured wire and a 4-pin header (VCC, GND, OU1, OU2).
- Range (x050B version): **−50 A to +50 A**
- Sensitivity: **40 mV/A** at VCC = 5 V (39.4–41 mV/A over temperature)
- Zero-current output: **VCC / 2 = 2.5 V**
- Output is **ratiometric**: zero point and sensitivity scale with VCC
- Noise about 10 mV (±3 sigma, ≈ 0.25 A); nonlinearity ±1 %; bandwidth 120 kHz
- Supply: datasheet 3.0–5.5 V, factory-trimmed at 5 V; about 10 mA (13.5 mA max)

The 100 A (20 mV/A), 150 A (13.3 mV/A) and 200 A (10 mV/A) versions, and the unidirectional "U" versions (0.6 V at 0 A), use the same package: read the chip marking.

## Pinout (module, 4-pin header)
| Pin | Name | Function |
|-----|------|----------|
| 1 | VCC | Supply, use 5 V |
| 2 | GND | Ground |
| 3 | OU1 | Analog output (VIOUT): 2.5 V at 0 A, +40 mV per amp |
| 4 | OU2 | Second output; vendors give the same formula as OU1. Leave unconnected |

The **IP+ / IP− pads** are in series with the load. Current flowing in at IP+ and out at IP− gives a positive reading.

## Electrical limits
- Supply: Sparkbench uses 4.5–5.5 V (the range over which the datasheet specifies ratiometry; accuracy is trimmed at 5 V). Absolute max 8 V, reverse −0.5 V.
- Output: 0.5 V at −50 A to 4.5 V at +50 A (VCC = 5 V). Output load ≥ 4.7 kΩ, ≤ 10 nF.
- Primary current: ±50 A for the specified accuracy. The pads, solder and wires must be rated for it: at tens of amps a thin jumper wire will melt.
- Stay with low-voltage DC loads; the isolation is real, but the bare pads on this board are not a safe mains installation for a beginner.

## Interface details
Conversion formula (datasheet, ratiometric):
```
I(A) = (Vout − VCC/2) / (0.040 V/A × VCC/5 V)
```
With VCC = 5 V: 2.5 V = 0 A, 2.9 V = +10 A, 2.1 V = −10 A.
VIOUT(Q) may drift by up to ±25 mV over the device lifetime, so measure the real zero point with no current flowing (`calibrate_zero()`).

## Wiring
| Module | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| VCC | 5V / VIN (USB 5 V) | VBUS (pin 40) | 5V (pin 2) |
| GND | GND | GND | GND |
| OU1 | GPIO32 (ADC1) | GP28 / ADC2 (pin 34) | External ADC (e.g. ADS1115 A0) |
| OU2 | not connected | not connected | not connected |

OU1 goes above 3.3 V for currents above about +20 A and reaches 4.5 V at +50 A, which can damage a 3.3 V ADC pin. If the current can exceed +20 A, add a divider: 10 kΩ from OU1 to the ADC pin, 20 kΩ from the ADC pin to GND, and pass `divider=1.5` to the driver.

## Using the driver
```python
from acs758 import ACS758
import time
sensor = ACS758(32)          # GPIO of the ADC pin OU1 is wired to (VCC = 5 V)
# sensor.calibrate_zero()    # optional: run once with no current flowing
while True:
    print('I=%.1fA' % sensor.current())
    time.sleep(1)
```
The driver averages 64 samples. It uses calibrated `read_uv()` where the port has it (ESP32), otherwise `read_u16()` × 3.3 V / 65535. Pass `vcc=` if your 5 V rail is not 5.0 V, `sensitivity=ACS758.SENS_100B` (etc.) for other versions, and `zero_frac=0.12` for unidirectional "U" parts.

## Gotchas
- **Resolution:** 40 mV/A means one 12-bit ESP32 ADC step is about 20 mA, but noise is about ±0.25 A. This module is for amps, not milliamps (use an ACS712 or INA219 for small currents).
- **Power it from 5 V.** A sagging USB rail (4.8 V) moves the zero point to 2.4 V, which reads as −2.5 A. Measure VCC and pass it, or use `calibrate_zero()`.
- **Over-voltage on the ADC:** see the divider above.
- **ESP32 ADC** is nonlinear above about 3.1 V even at 11 dB attenuation. Use ADC1 pins (ADC2 stops working when Wi-Fi is on).
- **AC current:** the reading swings around 2.5 V. Sample quickly over whole cycles and compute RMS.
- **Magnetic fields:** keep magnets, motors and the return wire away from the chip.
- **Wrong direction?** Swap the wires on IP+ / IP− (the sign flips).


## On a 3.3 V board
- **OU1** can rise above 3.3 V, so on an ESP32 or Pico it goes to the GPIO through a divider: 10 kΩ from OU1 to the pin, 20 kΩ from the pin to GND (Sparkbench adds both resistors). The pin then sees 0.67 × the output voltage, so multiply ADC readings by 1.5 (the driver's `divider` / `div` argument does this).

## Datasheet
https://www.allegromicro.com/-/media/files/datasheets/acs758-datasheet.pdf

---
*Generated by Sparkbench from the datasheet: https://www.allegromicro.com/-/media/files/datasheets/acs758-datasheet.pdf. Machine-readable definition: `part.json`.*
