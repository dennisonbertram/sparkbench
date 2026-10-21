---
name: part-aw9523
description: Pinout, electrical limits, wiring and MicroPython driver for the AW9523 16-pin I2C GPIO expander & constant-current LED driver (Awinic AW9523B, Adafruit AW9523 breakout 4886). Use when designing, wiring, simulating or writing code for an AW9523 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# AW9523 GPIO expander & LED driver (AW9523B)

## Overview
The **AW9523B** from Awinic adds 16 pins over I2C. Each pin can be a GPIO input, a GPIO output, or a 256-step constant-current LED sink (up to 37 mA, so LEDs need no resistor). Port P1 (P1_0–P1_7) is push-pull; port P0 (P0_0–P0_7) is open-drain after reset and can be switched to push-pull. An open-drain INTN output flags input changes. The modelled board is the **Adafruit AW9523 GPIO Expander and LED Driver Breakout (product 4886)**: no regulator, 10 kΩ pull-ups on SDA, SCL and RST, A0/A1 solder jumpers (pulled low → 0x58), two STEMMA QT connectors and two rows of VIN pads for LED anodes.

## Pinout (two 11-pin headers on opposite edges)
| Header | Pins in order |
|---|---|
| JP1 (bottom edge, left to right) | VIN, GND, SCL, SDA, INT, RST, 8, 9, 10, 11, 0 |
| JP7 (top edge, right to left) | 1, 2, 3, 4, 5, 6, 7, 12, 13, 14, 15 |

- Silkscreen numbers map to the chip: **0–7 = P0_0–P0_7**, **8–15 = P1_0–P1_7**.
- The extra rows of pads next to each header are all VIN (for LED anodes).
- With 22 pins on two edges, Sparkbench wires the board with jumper leads to a single-row connector.

## Electrical limits
- Supply: 2.5–5.5 V (absolute max 6 V). Every pin must stay between −0.3 V and VIN: the pins are **not** 5 V tolerant when VIN is 3.3 V.
- Inputs: VIH 1.4 V min, VIL 0.4 V max (1.8 V logic works). No internal pull-ups or pull-downs.
- Outputs: about 20 mA source/sink with a few hundred mV drop; LED mode IMAX 37 mA typ. per pin (ISEL can cut it to 3/4, 1/2, 1/4). 16 LEDs at full current is ~600 mA from VIN.
- RSTN needs a low pulse longer than 20 µs (pulses under 10 µs are ignored).

## Interface details
- **I2C address 0x58 + (A1 << 1) + A0** → 0x58–0x5B. Up to 400 kHz. No general-call response.
- Register map (datasheet Table 4):
  - 0x00 / 0x01 Input_Port0 / 1: pin levels (read clears INTN for that port)
  - 0x02 / 0x03 Output_Port0 / 1: output latches (0x00 at power-up on this board)
  - 0x04 / 0x05 Config_Port0 / 1: **1 = input, 0 = output; power-up 0x00 = all outputs**
  - 0x06 / 0x07 Int_Port0 / 1: 0 = interrupt enabled (default), 1 = disabled
  - 0x10 ID: reads 0x23
  - 0x11 GCR: bit 4 GPOMD (1 = P0 push-pull), bits 1:0 ISEL; other bits must be 0
  - 0x12 / 0x13 LED mode switch: 1 = GPIO (default), 0 = LED mode
  - 0x20–0x2F DIM0–DIM15: LED current 0–255 (DIM0–3 = P1_0–P1_3, DIM4–11 = P0_0–P0_7, DIM12–15 = P1_4–P1_7)
  - 0x7F: write 0x00 for a software reset
- Write: address, register, data. Read: write the register, repeated start, read one byte.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.
- GPIO LED: pin 8 → 330 Ω → LED → GND. LED-mode LED: VIN pad → LED anode, cathode → pin (no resistor).
- Button: pin → button → GND, plus a 10 kΩ resistor from the pin to VIN (the chip has no pull-up).
- INT (optional): to any GPIO with a 10 kΩ pull-up to 3.3 V.

## Using the driver
```python
from machine import I2C, Pin
from aw9523 import AW9523, INPUT, OUTPUT
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
io = AW9523(i2c)          # 0x58; soft reset, checks ID 0x23, P0 push-pull
io.pin_mode(8, OUTPUT)
io.value(8, 1)            # pin 8 high
io.pin_mode(1, INPUT)
print(io.value(1))        # 0 while a button to GND is pressed (with external pull-up)
io.led_mode(0)            # pin 0 as constant-current LED sink
io.led(0, 64)             # about 64/255 of 37 mA
```
Pins are numbered 0–15 as on the silkscreen. `read_port()` / `write_port()` work on all 16 bits; `interrupt()` enables INTN per pin; `led_range()` sets ISEL.

## Gotchas
- Every pin is an **output driven low** after power-up or reset. Make a pin an input before connecting anything that drives it.
- No internal pull-ups: a floating input reads random values.
- P0 pins are open-drain until GCR bit 4 is set (the driver does this by default); P1 pins are always push-pull.
- LED mode sinks current: LED anode to VIN, not to GND.
- DIM registers are write-only; reading them returns nothing useful.
- The board's I2C pull-ups go to VIN: power it from 3.3 V with an ESP32 or Pico.

## Datasheet
https://cdn-shop.adafruit.com/product-files/4886/AW9523+English+Datasheet.pdf
