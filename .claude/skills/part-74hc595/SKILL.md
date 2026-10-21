---
name: part-74hc595
description: Pinout, electrical limits, wiring and MicroPython driver for the 74HC595 8-bit serial-in / parallel-out shift register (TI SN74HC595N, DIP-16). Use when designing, wiring, simulating or writing code for a 74HC595 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# 74HC595 8-bit shift register (SN74HC595N)

## Overview
The **74HC595** turns 3 GPIOs into 8 outputs. You clock 8 bits in on SER/SRCLK into a shift register, then pulse RCLK and the storage register copies them to QA-QH all at once (no flicker while shifting). The outputs are 3-state (OE high = off). Hobbyists buy the bare **Texas Instruments SN74HC595N in a DIP-16 package** and plug it straight into a breadboard, typically to drive 8 LEDs. Chain more chips through QH'.

## Pinout (DIP-16, pin 1 next to the notch)
| Pin | Name | Function |
|---|---|---|
| 1-7 | QB-QH | Parallel outputs B to H |
| 8 | GND | Ground |
| 9 | QH' | Serial out, to SER of the next chip when chaining |
| 10 | SRCLR | Shift-register clear, active low: tie to VCC |
| 11 | SRCLK | Shift clock (rising edge) |
| 12 | RCLK | Latch / storage clock (rising edge) |
| 13 | OE | Output enable, active low: tie to GND |
| 14 | SER | Serial data in |
| 15 | QA | Parallel output A |
| 16 | VCC | Supply, 2-6 V |

## Electrical limits
- Supply: 2-6 V (absolute max 7 V); about 80 uA max idle.
- Inputs: high needs >= 0.7 x VCC (3.15 V at 4.5 V), low <= 0.3 x VCC; never above VCC.
- Outputs: specified for 6 mA at 4.5 V (less at 3.3 V); absolute max 35 mA per pin and **70 mA total** through VCC/GND.
- Clock: 5 MHz at 2 V, 25 MHz at 4.5 V (MicroPython bit-banging is far slower, which is fine).

## Interface details
- Function table (datasheet Table 8-1): on each SRCLK rising edge the first stage takes SER and every stage takes the previous one; an RCLK rising edge copies the shift register to the outputs; SRCLR low clears the shift register; OE high puts QA-QH in high impedance.
- Send MSB first: after 8 clocks bit 7 is in QH and bit 0 in QA. Then one RCLK pulse.
- Chained chips: send the far chip's byte first, then the near one, then a single RCLK pulse.

## Wiring
- ESP32: VCC and SRCLR -> 3V3, GND and OE -> GND, SER -> D23, SRCLK -> D18, RCLK -> D5.
- Pico: VCC and SRCLR -> 3V3(OUT), GND and OE -> GND, SER -> GP19, SRCLK -> GP18, RCLK -> GP17.
- Raspberry Pi 4: VCC and SRCLR -> pin 1 (3.3 V), GND and OE -> pin 6, SER -> pin 19, SRCLK -> pin 23, RCLK -> pin 24.
- Each QA-QH output -> 330 ohm-1 kohm resistor -> LED anode, LED cathode -> GND.
- 100 nF ceramic capacitor between pin 16 and pin 8.

## Using the driver
```python
from sr595 import SR595
sr = SR595(ser=23, srclk=18, rclk=5)   # chain=2 for two chips
sr.write(0b00100101)                    # QA, QC, QF on
sr.pin(7, True)                         # QH on as well
```

## Gotchas
- OE and SRCLR must not float: tie OE to GND and SRCLR to VCC (or drive them from GPIOs). Floating inputs give random flicker.
- At 5 V supply a 3.3 V GPIO high is below the 3.5 V threshold: run the chip from 3.3 V with an ESP32 or Pico.
- Without a resistor per LED the outputs and the 70 mA package limit are overloaded.
- Nothing changes on the LEDs until RCLK is pulsed.
- On some datasheets the pins are named DS, SH_CP, ST_CP, MR, Q0-Q7, Q7' (same pins: SER, SRCLK, RCLK, SRCLR, QA-QH, QH').

## Datasheet
https://www.ti.com/lit/ds/symlink/sn74hc595.pdf
