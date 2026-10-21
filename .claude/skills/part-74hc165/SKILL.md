---
name: part-74hc165
description: Pinout, electrical limits, wiring and MicroPython driver for the 74HC165 8-bit parallel-in / serial-out shift register (TI SN74HC165N, DIP-16). Use when designing, wiring, simulating or writing code for a 74HC165 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build, e.g. to read 8 switches or buttons with 3 GPIOs.
---

# 74HC165 8-bit parallel-in shift register (SN74HC165N)

## Overview
The **74HC165** reads eight digital inputs (A–H) at once and hands them to the microcontroller one bit at a time on a single wire. Three GPIOs (SH/LD, CLK, QH) read 8 switches, and more chips daisy-chain on the same three wires. Hobbyists buy it as the bare **16-pin DIP chip** (Texas Instruments SN74HC165N, or the same part from Nexperia/onsemi). It plugs straight into a breadboard.

## Pinout (PDIP-16, pin 1 next to the notch, counting anticlockwise from the top)
| Pin | Name | Function |
|---|---|---|
| 1 | SH/LD | Shift/load: low = load A–H, high = shift on CLK |
| 2 | CLK | Clock: rising edge shifts the next bit onto QH |
| 3–6 | E, F, G, H | Parallel inputs |
| 7 | /QH | Inverted serial output (not needed) |
| 8 | GND | Ground |
| 9 | QH | Serial output |
| 10 | SER | Serial input: GND for one chip, or QH of the next chip |
| 11–14 | A, B, C, D | Parallel inputs |
| 15 | CLK INH | Clock inhibit: tie to GND |
| 16 | VCC | Supply 2–6 V |

## Electrical limits
- Supply: 2–6 V (recommended operating conditions). Use 3.3 V with an ESP32 or Pico, because QH swings to VCC.
- Quiescent current: 8 µA max at 25 °C, 80 µA max at −40 to 85 °C.
- Outputs: ±4 mA at 4.5 V. Inputs: ±1 µA leakage. They must never float (TI note: hold unused inputs at VCC or GND).
- Timing (minimums at 4.5 V, in tens of ns) is far shorter than MicroPython pin toggles, so no delays are needed.

## Interface details
- **Load:** SH/LD low copies A–H into the register. CLK, CLK INH and SER are ignored while SH/LD is low.
- **Shift:** with SH/LD high and CLK INH low, each rising CLK edge moves the register one place toward QH, and SER fills the empty end.
- After a load, QH already shows **H**. Read QH, clock, and read again: the order is H, G, F, E, D, C, B, A. The driver returns bit 7 = H … bit 0 = A.
- CLK and CLK INH are interchangeable (an OR gate). Holding CLK INH high freezes the shift.
- Daisy-chain: QH of the far chip → SER of the near chip, with SH/LD and CLK shared. Clock 8 × chips bits. The near chip's bits come first.

## Wiring
- Always: CLK INH (15) → GND, SER (10) → GND for a single chip, 0.1 µF from VCC (16) to GND (8).
- Switches: each input → switch → VCC, with a 10 kΩ pull-down from the input to GND (pressed = 1). The other way also works: switch to GND with a 10 kΩ pull-up (pressed = 0).
- ESP32: VCC → 3V3, GND → GND, SH/LD → D25, CLK → D26, QH → D27.
- Pico: VCC → 3V3(OUT), GND → GND, SH/LD → GP2, CLK → GP3, QH → GP6.
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, then any three GPIOs.

## Using the driver
```python
from hc165 import HC165
sr = HC165(load=25, clock=26, data=27)   # SH/LD, CLK, QH
b = sr.read()                            # bit 7 = H ... bit 0 = A
print('IN={:08b}'.format(b))
print('A is', sr.pin(0))
```
For two chained chips use `HC165(25, 26, 27, chips=2)`. `read()` then returns 16 bits, with the near chip in the high byte.

## Gotchas
- Floating inputs read at random and can make the chip draw extra current. Give every A–H a pull-up or pull-down, even unused ones.
- Forgetting CLK INH or SER: a floating CLK INH can block shifting, and a floating SER shifts garbage into a chain.
- Powering the chip from 5 V puts 5 V on QH, which is too much for a 3.3 V GPIO. Run it from 3.3 V.
- Mechanical switches bounce. Read every 10–20 ms, or compare two readings.
- In Sparkbench's simulator, toggles A–H set the input levels (on = high), and SER shifts in 0s.

## Datasheet
https://www.ti.com/lit/ds/symlink/sn74hc165.pdf
