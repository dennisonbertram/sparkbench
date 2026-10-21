---
name: part-ttp224
description: Pinout, electrical limits, wiring and MicroPython driver for the TTP224 4-channel capacitive touch module (Tontek TTP224-BSB). Use when designing, wiring, simulating or writing code for a TTP224 touch keypad in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# TTP224 4-channel capacitive touch module (TTP224)

## Overview
The **TTP224-BSB** from Tontek is a 4-key capacitive touch detector with one direct output per pad. Hobbyists buy it on the **blue 35 × 29 mm "TTP224 4-way capacitive touch" module**: four numbered pads (1–4), four red indicator LEDs (D1–D4, 1 kΩ each), two 3×2 option-jumper blocks and a 6-pin header. Touch pad n and OUTn changes level.

## Pinout (6-pin header, as printed: OUT1, OUT2, OUT3, OUT4, GND, VCC)
| Pin | Function |
|---|---|
| OUT1 | Pad 1 output (chip TPQ0), CMOS, high while touched by default |
| OUT2 | Pad 2 output (TPQ1) |
| OUT3 | Pad 3 output (TPQ2) |
| OUT4 | Pad 4 output (TPQ3) |
| GND | Ground |
| VCC | Supply, 2.4–5.5 V |

## Electrical limits
- Supply: 2.4–5.5 V (chip; absolute max 6.0 V). Outputs swing to VCC, so **power it from 3.3 V on an ESP32 or Pico**.
- Chip current at 3 V: 2.5 µA (low-power mode), 9 µA (fast mode); each lit LED adds about 1–3 mA.
- Output drive at 3 V: sinks 8 mA (VOL 0.6 V), sources 4 mA (VOH 2.4 V).
- Operating temperature −40 to 85 °C.

## Interface details
- Four plain digital outputs, no protocol. Read them as GPIO inputs; no pull resistor needed in the default CMOS mode.
- Option jumpers (all open = factory default: direct, CMOS, active high, multi-key, no max on-time, low-power):

| Jumper | Fitted | Effect |
|---|---|---|
| AHLB | to VDD | Outputs active low |
| TOG | to VDD | Toggle (latching) mode |
| OD | to VSS | Open-drain outputs (add pull resistors) |
| SM | to VSS | Single-key mode (only one pad at a time) |
| MOT0 | to VSS | Output released after 16 s of continuous touch |
| LPMB | to VDD | Fast mode (always ~100 ms response) |

- Timing: ~0.5 s stable time after power-on (keep fingers off); response ~200 ms in low-power mode, ~100 ms in fast mode; once touched it stays in fast mode for ~8 s. Recalibrates every ~4 s when untouched.
- Sensitivity: C1–C4 (0–50 pF, NPO) from each pad to GND; smaller = more sensitive.

## Wiring
- ESP32: VCC → 3V3, GND → GND, OUT1–OUT4 → GPIO13, 12, 14, 27.
- Pico: VCC → 3V3(OUT), GND → GND, OUT1–OUT4 → GP2, GP3, GP4, GP5.
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, OUT1–OUT4 → GPIO17, 27, 22, 23.

## Using the driver
```python
from ttp224 import TTP224
import time
pads = TTP224(13, 12, 14, 27)    # GPIOs wired to OUT1..OUT4
while True:
    print('K1=%d K2=%d K3=%d K4=%d' % pads.keys())
    time.sleep(0.2)
```
Pass `active_high=False` if AHLB is jumpered. `irq(key, handler)` calls `handler` when a touch on that pad starts.

## Gotchas
- **Powered from 5 V the outputs are 5 V** – too much for an ESP32/Pico pin. Use 3.3 V.
- Header order is OUT1…OUT4 then GND, VCC — not VCC first. Check the silkscreen before wiring.
- Don't touch the pads during the first 0.5 s after power-up (baseline calibration).
- Some cheap "4-key touch" boards use four TTP223 chips instead; check the chip marking.
- Long or noisy supply wiring causes false touches; keep a 100 nF capacitor close (the board has C6).

## Datasheet
https://atta.szlcsc.com/upload/public/pdf/source/20211108/06A33CD05429BA5721D38207E58672B7.pdf
