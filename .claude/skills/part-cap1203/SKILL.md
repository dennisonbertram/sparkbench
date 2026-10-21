---
name: part-cap1203
description: Pinout, electrical limits, wiring and MicroPython driver for the SparkFun Capacitive Touch Slider - CAP1203 (Qwiic, SEN-15344; Microchip CAP1203 3-key touch controller, I2C 0x28). Use when designing, wiring, simulating or writing code for a CAP1203 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# CAP1203 3-key capacitive touch slider (SparkFun Qwiic, SEN-15344)

## Overview
The **CAP1203** (Microchip) senses three capacitive touch inputs (CS1–CS3) with automatic
recalibration and programmable sensitivity. The **SparkFun Capacitive Touch Slider - CAP1203 (Qwiic)**
puts three pads in a row (left = CS1, middle = CS2, right = CS3), two Qwiic connectors, a green
interrupt LED, a 5-pin side header (J4) and a 3-pin top-edge header (J3). I2C address is **fixed at 0x28**.
- Touch status: register **0x03**, bit 0 = CS1, bit 1 = CS2, bit 2 = CS3.
- Status bits **latch** until the INT bit (0x00 bit 0) is written to 0; held touches stay set.
- Default **multiple-touch blocking** (0x2A = 0x80) reports only one pad; write 0x2A = 0x00 for all.
- IDs: 0xFD = 0x6D (product), 0xFE = 0x5D (Microchip), 0xFF = 0x00 (revision).

## Pinout (two headers on different edges, as printed)
Side header J4:
| Pin | Function |
|---|---|
| GND | Ground |
| 3V3 | 3.3 V supply (no regulator, straight to the chip) |
| SDA | I2C data, 2.2k pull-up to 3V3 (I2C jumper) |
| SCL | I2C clock, 2.2k pull-up to 3V3 (I2C jumper) |
| INT | ALERT#, open-drain active low, 10k pull-up + green LED |

Top-edge header J3: CS1, CS2, CS3 = the same nets as the left/middle/right pads (optional, for your own pads).
The headers are on two edges, so the board does not plug in as one row: wire it with jumper leads or a Qwiic cable.

## Electrical limits
- Board supply 3.3 V (the chip allows 3.0–5.5 V, but the pull-ups go to that same rail, so keep it at 3.3 V).
- Chip ~0.5 mA; the INT LED adds ~1–2 mA while lit.
- Timing: no bus response for up to 15 ms after power-up; first conversion after 170–200 ms.

## Wiring
- ESP32: 3V3 → 3V3, GND → GND, SDA → GPIO21, SCL → GPIO22.
- Pico: 3V3 → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5 (I2C0).
- Raspberry Pi 4: 3V3 → pin 1, GND → pin 6, SDA → pin 3, SCL → pin 5.
- Optional: INT → a GPIO (falling edge on touch).

## Using the driver
```python
from machine import I2C, Pin
from cap1203 import CAP1203
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
cap = CAP1203(i2c)            # 0x28; checks IDs, disables multi-touch blocking
print(cap.touched_pads())     # e.g. [1, 3]
```
`touched()` returns the 3-bit mask and clears INT; `is_left()/is_middle()/is_right()`;
`delta(n)` signed delta count; `set_sensitivity(0..7)` (0 = most sensitive, default 2);
`set_interrupts(bool)`. A swipe is detected in software from the order pads become touched.

## Gotchas
- Only 3.3 V on 3V3: no regulator, and SDA/SCL pull-ups follow the supply.
- Fixed address 0x28: one board per bus without a mux.
- Without writing 0x2A = 0 only the first touched pad (CS1→CS3 order) is reported.
- A released pad stays reported until INT is cleared (the driver does this on every read).
- Don't touch the pads at power-up; the chip calibrates against what it sees.

## Datasheet
https://cdn.sparkfun.com/assets/c/9/f/2/c/CAP1203_Data_Sheet.pdf
