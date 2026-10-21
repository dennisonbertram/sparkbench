---
name: part-gravity-do
description: Pinout, electrical limits, wiring and MicroPython driver for the DFRobot Gravity Analog Dissolved Oxygen Sensor (SEN0237 / SEN0237-A, galvanic DO probe + A/+/- signal board). Use when designing, wiring, simulating or writing code for a dissolved oxygen (DO) sensor in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build, e.g. aquariums, aquaculture or hydroponics.
---

# Gravity analog dissolved oxygen sensor (DFRobot SEN0237)

## Overview
The **DFRobot Gravity Analog Dissolved Oxygen Sensor (SEN0237, now sold as SEN0237-A)** measures how much oxygen is dissolved in water (mg/L). A **galvanic probe** (platinum cathode, lead anode, NaOH filling solution, replaceable membrane cap) produces a current proportional to oxygen; the signal board's TP5551 op-amp turns it into a voltage on **A**. No polarisation time is needed.
- Range **0–20 mg/L**, water 0–40 °C, up to 98 % response within 90 s (25 °C)
- Output **0–3.0 V** on A (the board runs its op-amp from an onboard 3.0 V LDO), safe for 3.3 V ADCs
- Probe connects by BNC, 2 m cable; membrane cap every 1–5 months, filling solution monthly
- No chip to talk to: read A with an ADC

## Pinout (signal board, PH2.0 3-pin Gravity connector J1)
| Pin | Name | Function |
|---|---|---|
| 1 | A | Analog output, 0–3.0 V (220 Ω series resistor) |
| 2 | + | Supply, 3.3–5.5 V |
| 3 | - | Ground |

The probe plugs into the BNC socket. Gravity cable colours: blue = A, red = +, black = -.

## Electrical limits
- Supply: **3.3–5.5 V**, a few mA (power LED + op-amp).
- Output: 0–3.0 V, never above the 3.0 V rail, so no divider is needed.
- Probe: 0–40 °C, 0–50 PSI. The board is not waterproof.

## Interface details
DFRobot's conversion (wiki sample code), V in mV, T = water temperature in whole °C (0–40):
```
single-point:  V_sat = CAL1_V + 35 × (T − CAL1_T)                         mV
two-point:     V_sat = (T − CAL2_T) × (CAL1_V − CAL2_V) / (CAL1_T − CAL2_T) + CAL2_V
DO = V × DO_Table[T] / V_sat                                              µg/L  (÷1000 → mg/L)
```
DO_Table is the oxygen saturation of water, 14460 µg/L at 0 °C down to 6410 µg/L at 40 °C (8250 at 25 °C).
**Calibration**: read the A voltage in air-saturated water (pump air into water ~20 min, or hold the probe in air after a wet shake) at known T → CAL1_V/CAL1_T. For two-point, repeat in cold saturated water → CAL2_V/CAL2_T (CAL1 is the higher temperature). DFRobot's 1600 mV @ 25 °C default is only a placeholder.
Example: CAL1 = 1600 mV @ 25 °C, V = 1.20 V, T = 25 °C → DO = 1200 × 8250 / 1600 = 6188 µg/L ≈ 6.2 mg/L.

## Wiring
| Sensor | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| + | 3V3 or 5V | 3V3(OUT) or VBUS | 3.3 V (pin 1) |
| - | GND | GND | GND |
| A | GPIO32–39 (ADC1) | GP26/27/28 (ADC) | External ADC (ADS1115 / MCP3008) |

On the ESP32 use ADC1 pins (ADC2 stops working while Wi-Fi is on). The Pi 4 has no ADC.

## Using the driver
```python
from gravity_do import GravityDO
do = GravityDO(34, cal1_mv=1600, cal1_t=25, temperature=25)   # A on GPIO34; enter YOUR calibration
v = do.voltage()
print('A=%.2fV DO=%.1fmg/L' % (v, do.do_mgl(v)))
```
Add `cal2_mv=..., cal2_t=...` for two-point calibration. Update `do.temperature` from a waterproof DS18B20 for compensation.

## Gotchas
- **Calibrate first**: without your own saturation voltage the reading is meaningless.
- **Fill the cap** with 0.5 mol/L NaOH before first use; no bubbles under the membrane. NaOH is caustic: wear gloves and goggles.
- **Stir or flow the water**: the galvanic probe consumes oxygen at the membrane; still water reads low.
- Zero-oxygen liquid not reading ~0: polish the cathode. Drifting readings: replace the membrane cap.
- Temperature table only covers 0–40 °C.
- Do not run several probes (pH, EC, DO) in one container without isolation; they interfere.

## Datasheet
https://wiki.dfrobot.com/sen0237-a/
