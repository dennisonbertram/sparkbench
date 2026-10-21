---
name: part-bts7960
description: Pinout, electrical limits, wiring and MicroPython driver for the BTS7960 43 A H-bridge motor driver module (Infineon BTS7960B, IBT-2). Use when designing, wiring, simulating or writing code for a BTS7960 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# BTS7960 43 A H-bridge motor driver (BTS7960)

## Overview
The **BTS7960B** from Infineon is a protected high-current half bridge (high-side P-MOSFET, low-side N-MOSFET and driver in one package). The hobby module (IBT-2 type, e.g. **Handson Technology DRV-1012**, 50 × 50 mm with a big heatsink) puts two of them together as **one H-bridge** for one brushed DC motor, with a 74HC244 buffer in front of the logic inputs. It handles 43 A peak (current-limited), PWM up to 25 kHz, and protects itself against over-temperature, over-current/short circuit, under- and over-voltage.

## Pinout (module, header by header)
2×4 control header (pin numbers printed on the board; odd pins on one row, even on the other):

| Pin | Name | Function |
|---|---|---|
| 1 | RPWM | Forward input: IN of the R half bridge (high/PWM drives M+ to B+) |
| 2 | LPWM | Reverse input: IN of the L half bridge (high/PWM drives M- to B+) |
| 3 | R_EN | R half-bridge enable (INH), high = on |
| 4 | L_EN | L half-bridge enable (INH), high = on |
| 5 | R_IS | R side current-sense / fault output (optional) |
| 6 | L_IS | L side current-sense / fault output (optional) |
| 7 | VCC | Logic supply for the 74HC244 buffer, 3.3–5 V |
| 8 | GND | Logic ground (same net as B-) |

Screw terminal: **B+** (motor supply 6–27 V), **B-** (supply ground), **M+**, **M-** (motor).

## Electrical limits
- Motor supply B+: 6–27 V on the module (chip operating range 5.5–27.5 V; under-voltage shutdown 4.0–5.4 V, over-voltage lockout 27.6–30 V, absolute max 45 V).
- Current: 43 A typ. low-side / 60 A high-side current-limit level at 25 °C; continuous current is limited by heat — far less without extra cooling.
- Logic VCC: 3.3–5 V. The BTS7960 IN/INH inputs are rated to 5.3 V absolute max, so never feed VCC more than that.
- 74HC244 at VCC = 5 V needs about 3.5 V for a valid high: with 3.3 V GPIOs, power VCC from 3.3 V (the buffer then outputs 3.3 V, well above the BTS7960's 2.15 V max threshold).
- PWM: up to 25 kHz.
- IS outputs: I_IS ≈ I_load / 8500 (kILIS 8500 typ., 3000–14000 at 5 A) into the module's 1 kΩ resistor to GND, so V_IS = I_load / 8.5 A: **load current ≈ 8.5 A per volt** (Infineon datasheet 4.4.4). Only the side whose high side is on reports. In a fault IS sources 4–7 mA (4–7 V), and 28 A already gives 3.3 V: use a divider before a 3.3 V ADC.

## Interface details (Infineon truth table, per half bridge)
| INH (x_EN) | IN (xPWM) | Output |
|---|---|---|
| 0 | X | Off (floating) |
| 1 | 0 | Low side on (to GND) |
| 1 | 1 | High side on (to B+) |

| R_EN, L_EN | RPWM | LPWM | Motor |
|---|---|---|---|
| 1 | PWM | 0 | Forward |
| 1 | 0 | PWM | Reverse |
| 1 | 0 | 0 | Brake |
| 0 | X | X | Coast |

Over-temperature / short-circuit shutdown latches until EN is pulled low for ≥ 3 µs.

## Wiring
- Power: battery + → B+, battery − → B-, motor → M+/M-. GND (header) → board GND.
- ESP32: VCC → 3V3, RPWM → D25, LPWM → D26, R_EN → D27, L_EN → D13.
- Pico: VCC → 3V3(OUT), RPWM → GP2, LPWM → GP3, R_EN → GP6, L_EN → GP7.
- Raspberry Pi 4: VCC → pin 1 (3.3 V), RPWM → GPIO18 (pin 12), LPWM → GPIO19 (pin 35), R_EN/L_EN → any GPIO or VCC.
- No coasting needed? Tie R_EN and L_EN to VCC and use two pins only.

## Using the driver
```python
from bts7960 import BTS7960
m = BTS7960(25, 26, r_en=27, l_en=13)   # 20 kHz PWM by default
m.forward(60)     # 60 %
m.reverse(30)
m.drive(-80)      # -100..100
m.brake(); m.coast()
# optional current sense through a 10k/20k divider on R_IS and L_IS:
# m = BTS7960(25, 26, r_en=27, l_en=13, r_is=34, l_is=35, is_divider=1.5); m.current()  # amps
```

## Gotchas
- One motor per module: the two BTS7960 chips are the two halves of one H-bridge.
- No common ground = random twitching. The header GND and B- are joined on the board.
- 3.3 V boards with VCC on 5 V may work or may not (out of spec for the 74HC244): use 3.3 V for VCC.
- Big motors draw huge start-up current: thick wires, a fuse, and a battery that can deliver it. Never power the motor from the board.
- Below about 5.5 V on B+ the chip shuts off: a sagging battery makes the motor stutter.

## Datasheet
https://www.robotpower.com/downloads/BTS7960_v1.1_2004-12-07.pdf
