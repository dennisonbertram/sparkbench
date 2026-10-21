---
name: part-grove-4-digit-display
description: Pinout, electrical limits, wiring and MicroPython driver for the Seeed Grove - 4-Digit Display (TM1637 4-digit 7-segment LED display with clock colon, Grove connector). Use when designing, wiring, simulating or writing code for a Grove 4-Digit Display in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Grove - 4-Digit Display (TM1637)

## Overview
The **Seeed Studio Grove - 4-Digit Display v1.0** (SKU 104030003) is a 4-digit red 7-segment display with a centre clock colon, driven by a Titan Micro **TM1637** over a two-wire CLK/DIO bus with 8 brightness steps. It connects with a single 4-pin Grove cable.

## Pinout (Grove connector J1, in order)
| Pin | Wire | Function |
|---|---|---|
| CLK | yellow | Clock input (10k pull-up to VCC on the board) |
| DIO | white | Data in/out (10k pull-up to VCC; chip pulls it low for ACK) |
| VCC | red | Supply 3.3–5.5 V: match your microcontroller's logic voltage |
| GND | black | Ground |

The socket is a 2 mm Grove connector: use a Grove-to-female-jumper cable on a breadboard.

## Electrical limits
- Seeed rating: 3.3 / 5.0 / 5.5 V (min/typ/max), 0.2 / 27 / 80 mA.
- TM1637 datasheet: VDD 5 V ±10 % characterised, absolute maximum 7 V; logic high ≥ 0.7 × VDD.
- Clock: keep well under the datasheet's 250 kHz limit; the driver runs at about 100 kHz.

## Interface details
- **Not I2C**: no address. Start = DIO falls while CLK is high; stop = DIO rises while CLK is high; DIO only changes while CLK is low; bytes go **LSB first**; the chip pulls DIO low during the 9th (ACK) clock.
- Data command **0x40** (write, auto-increment), address command **0xC0** (leftmost digit) followed by the segment bytes, then display control **0x88 | brightness** (0–7; 0x80 = display off).
- Segment byte: bit0 = a … bit6 = g, bit7 = DP. On this board **bit 7 of digit 2 is the colon**; there are no decimal points.

## Wiring
- ESP32: VCC → 3V3, GND → GND, CLK → D25, DIO → D26.
- Pico: VCC → 3V3(OUT), GND → GND, CLK → GP2, DIO → GP3.
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, CLK → GPIO23 (pin 16), DIO → GPIO24 (pin 18).

## Using the driver
```python
from tm1637 import TM1637
display = TM1637(25, 26, brightness=3)   # CLK, DIO GPIO numbers
display.numbers(9, 45)                    # 09:45 with the colon lit
display.number(-25)                       # right aligned, -999..9999
display.show('dONE')
display.brightness(1)
```

## Gotchas
- Don't use the I2C peripheral: it sends an address byte MSB-first and the display will show garbage.
- Powering the board from 5 V while a 3.3 V board drives it puts 5 V (via the 10k pull-ups) on the GPIO pins. Use 3V3.
- Nothing lights until the display control command (0x88 | brightness) has been sent.
- On a Grove Base Hat/Shield, plug it into a **digital** port: yellow = the port's first GPIO (CLK), white = the second (DIO).

## Datasheet
https://files.seeedstudio.com/wiki/Grove-4-Digit_Display/res/TM1637_datasheet.pdf (English: https://github.com/avishorp/TM1637/raw/master/docs/TM1637_V2.4_EN.pdf)
