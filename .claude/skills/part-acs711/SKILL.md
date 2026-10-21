---
name: part-acs711
description: Pinout, electrical limits, wiring and MicroPython driver for the Pololu ACS711EX Current Sensor Carrier -15.5A to +15.5A, #2452 (Allegro ACS711KEXLT-15AB-T Hall-effect current sensor with overcurrent FAULT output). Use when designing, wiring, simulating or writing code for an ACS711 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Pololu ACS711EX current sensor carrier, ±15.5 A (#2452)

## Overview
The **ACS711** (Allegro MicroSystems) is a Hall-effect current sensor: the measured current flows through a 0.6 mΩ copper path inside the chip (EX/QFN package), electrically separated from the sensing side (rated for <100 V isolation applications), and the chip outputs an **analog voltage** proportional to AC or DC current in both directions. It also has an **overcurrent FAULT output** that latches low at full-scale current. Hobbyists buy it on the **Pololu ACS711EX Current Sensor Carrier -15.5A to +15.5A (#2452)**: large IP+ / IP− holes for the measured wire and a 5-pin 0.1" header (GND, GND, Vcc, OUT, FAULT).
- Chip: **ACS711KEXLT-15AB-T**, range **±15.5 A**
- Sensitivity: **90 mV/A at VCC = 3.3 V** (136 mV/A at 5 V), ratiometric
- Zero-current output: **VCC × 0.5** (1.65 V at 3.3 V)
- Noise 11 mV (±3σ, ≈ 0.12 A); total output error ±5 % typ
- Bandwidth 100 kHz; supply **3.0–5.5 V**, 4 mA typ (5.5 mA max)

The ±31 A version (#2453, ACS711KEXLT-31AB, 45 mV/A at 3.3 V) uses the same board; Pololu marks the versions with a coloured X on the bottom silkscreen, or read the chip.

## Pinout (5-pin header, pin 1 = square pad)
| Pin | Name | Function |
|-----|------|----------|
| 1 | GND | Ground |
| 2 | GND | Ground (second pad, same net) |
| 3 | Vcc | Supply, 3.0–5.5 V |
| 4 | OUT | Analog output: VCC/2 + 90 mV/A × I (at 3.3 V) |
| 5 | FAULT | Overcurrent fault, active low, latching; 10 kΩ pull-up to Vcc on the board |

The measured current goes through the big **IP+ / IP−** holes on the other side of the board (0.1", 3.5 mm and 5 mm hole pairs, or #6 ring terminals), in series with the load. Current in at IP+ and out at IP− (the **+i** arrow) reads positive.

## Electrical limits
- Supply 3.0–5.5 V (absolute max 7 V). Datasheet accuracy is specified at 3.3 V.
- OUT swings from about 0.3 V to VCC − 0.3 V; output load ≥ 15 kΩ, ≤ 1 nF.
- **At 5 V supply OUT reaches about 4.6 V**: too much for a 3.3 V ADC pin. Run it from 3.3 V, or add a 10 kΩ / 20 kΩ divider and pass `divider=1.5, vcc=5.0`.
- Pololu: intended for use **below 30 V**. Handles 15.5 A continuous; survives 100 A for 100 ms.
- FAULT pin max 7 V; it is pulled up to the carrier's Vcc, so it is 3.3 V-safe when Vcc = 3.3 V.

## Interface details
Conversion formula (datasheet, ratiometric to VCC):
```
I(A) = (Vout − VCC/2) / (0.090 V/A × VCC / 3.3 V)
```
With VCC = 3.3 V: 1.65 V = 0 A, 2.10 V = +5 A, 1.20 V = −5 A, 3.045 V = +15.5 A, 0.255 V = −15.5 A.
The zero point varies by ±5 mV at 25 °C (up to ±50 mV over temperature): run `calibrate_zero()` with no current flowing.

**FAULT** goes low within about 1.3 µs when |I| exceeds 15.5 A and **stays low** until VCC is switched off (below 200 mV for > 100 µs) and on again.

Sparkbench models the board at **VCC = 3.3 V**: OUT = 1.65 V + 0.090 V/A × I over −15.5 A … +15.5 A. The FAULT latch is not simulated (it stays high).

## Wiring
| Board | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| Vcc | 3V3 | 3V3(OUT) (pin 36) | 3V3 (pin 1) |
| OUT | GPIO34 (ADC1) | GP26 / ADC0 (pin 31) | External ADC (e.g. ADS1115 A0) |
| FAULT (optional) | any GPIO, e.g. GPIO27 | any GP, e.g. GP15 | any GPIO |
| GND | GND | GND | GND |

## Using the driver
```python
from acs711 import ACS711
import time
sensor = ACS711(26, fault_pin=15)   # OUT on GP26, FAULT on GP15, Vcc = 3.3 V
# sensor.calibrate_zero()           # optional: run once with no current flowing
while True:
    print('I=%.2fA fault=%s' % (sensor.current(), sensor.fault()))
    time.sleep(1)
```
The driver averages 64 samples, using calibrated `read_uv()` where the port has it (ESP32), otherwise `read_u16()` × 3.3 V / 65535. Pass `vcc=` if the supply is not 3.3 V, and `sensitivity=ACS711.SENS_31AB` for the ±31 A board.

## Gotchas
- **Ratiometric:** if Vcc is 3.25 V instead of 3.3 V, the zero point moves to 1.625 V. Measure Vcc and pass it, or calibrate the zero.
- **FAULT latches.** After a short-circuit spike the fault stays set until a power cycle; a GPIO cannot clear it.
- **Noise:** 11 mV ≈ 0.12 A. Average many samples; don't expect milliamp precision from a 15 A sensor.
- **ESP32 ADC** is non-linear above about 3.1 V; use ADC1 pins (ADC2 stops working with Wi-Fi on).
- **AC current:** sample fast over whole cycles and compute RMS around the zero point.
- Keep magnets, motors and the returning wire away from the chip; stray fields add offset.
- The header pins ship loose: solder them in before breadboarding.

## Datasheet
https://www.allegromicro.com/-/media/files/datasheets/acs711-datasheet.pdf

---
*Generated by Sparkbench from the datasheet: https://www.allegromicro.com/-/media/files/datasheets/acs711-datasheet.pdf. Machine-readable definition: `part.json`.*
