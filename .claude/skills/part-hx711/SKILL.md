---
name: part-hx711
description: Pinout, electrical limits, wiring and MicroPython driver for the HX711 load cell amplifier (Avia HX711 24-bit ADC) with a 5 kg bar load cell. Use when designing, wiring, simulating or writing code for an HX711 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# HX711 load cell amplifier with 5 kg load cell (HX711)

## Overview
The **HX711** from Avia Semiconductor is a 24-bit sigma-delta ADC made for weigh scales. Channel A has a gain of 128 or 64 and channel B a fixed gain of 32. It reads through two pins, a clock (PD_SCK) and a data line (DOUT), with no registers to program. Hobbyists buy it as the **green HX711 load cell amplifier module**, usually bundled with a **5 kg aluminium bar load cell** (about 1 mV/V). On this module RATE is tied low, so it gives 10 samples/s. An S8550 transistor regulates the excitation voltage (E+), which is about 4.3 V on a 5 V supply.

## Pinout (green module, MCU header J2, in order)
| Pin | Function |
|---|---|
| GND | Ground |
| DT | Data out (HX711 DOUT) |
| SCK | Clock in (HX711 PD_SCK); high for more than 60 µs powers the chip down |
| VCC | Supply, 2.7–5.5 V |

The load-cell header J1 is E+, E-, A-, A+, B-, B+. For the usual 4-wire cell: red to E+, black to E-, white to A-, green to A+. Colours vary between makers, and if readings fall as you add weight, swap A- and A+.

## Electrical limits
- Supply: VSUP 2.7–5.5 V, DVDD 2.6–5.5 V. The module ties both to VCC, so the module range is 2.7–5.5 V.
- Current: under 1.5 mA for the chip, plus the load-cell bridge (about 4 mA for a 1 kΩ cell). Power-down draws under 1 µA.
- Full-scale input is ±0.5·AVDD/gain, which is ±20 mV at gain 128 with AVDD = 5 V.
- DT swings to VCC. Power the module from **3.3 V** on an ESP32 or Pico.

## Interface details
- DOUT high means the conversion is not ready. DOUT low means the data is ready.
- Send 25–27 positive pulses on PD_SCK. The 24 data bits come out MSB first, in two's complement. Readings saturate at 0x800000 and 0x7FFFFF.
- The number of pulses sets the **next** conversion: 25 = channel A at gain 128, 26 = channel B at gain 32, 27 = channel A at gain 64.
- Timing: PD_SCK high time is 0.2–50 µs and low time at least 0.2 µs. The driver disables interrupts while clocking, so a pulse cannot stretch past 60 µs and power the chip down.
- Settling takes 400 ms at 10 SPS (50 ms at 80 SPS) after power-up, reset, or a channel or gain change.
- Nominal scale for a 1 mV/V, 5 kg cell at gain 128 is 2^31 × 0.001 / 5000 ≈ **429.5 counts per gram**. This doesn't depend on the supply voltage because the bridge and ADC share AVDD. Always calibrate with a known weight.

## Wiring
- ESP32: VCC → 3V3, GND → GND, DT → D25, SCK → D26.
- Pico: VCC → 3V3(OUT), GND → GND, DT → GP2, SCK → GP3.
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, DT → GPIO5 (pin 29), SCK → GPIO6 (pin 31).

## Using the driver
```python
from hx711 import HX711
import time
hx = HX711(25, 26)        # DT, SCK
time.sleep_ms(500)
hx.tare()                 # empty scale
hx.set_scale(429.5)       # counts per gram; calibrate: (reading - offset) / known grams
print('W=%dg' % round(hx.weight()))
```
- `hx.set_gain(64)` selects channel A at gain 64, and `hx.set_gain(32)` selects channel B. Both discard readings for 400 ms while the new setting settles.
- `hx.power_down()` / `hx.power_up()` to save power between readings.

## Gotchas
- A reading stuck at -1 or a "not ready" error usually means DT and SCK are swapped, or VCC/GND is missing.
- If SCK floats high or stays high, the chip powers down. Keep it low.
- The bar must flex. Bolt one end to the base and the other to the platform, with spacers, and point the arrow in the direction of the force.
- On 3.3 V the excitation regulator drops out, so E+ sits a little below VCC. Readings are still ratiometric but a bit noisier.
- Readings drift with temperature. Tare again before each weighing.

## Datasheet
https://cdn.sparkfun.com/datasheets/Sensors/ForceFlex/hx711_english.pdf
