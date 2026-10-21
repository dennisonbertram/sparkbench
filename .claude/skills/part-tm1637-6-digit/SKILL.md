---
name: part-tm1637-6-digit
description: Pinout, electrical limits, wiring and MicroPython driver for the TM1637 6-digit 7-segment LED display module with decimal points (TM1637). Use when designing, wiring, simulating or writing code for a 6-digit TM1637 display in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# TM1637 6-digit 7-segment display (TM1637)

## Overview
The **TM1637** from Titan Micro drives up to six 7-segment digits with 8 brightness steps over a two-wire CLK/DIO bus. Hobbyists buy it as a **6-digit 0.36" display module** (e.g. diymore "6-Digit LED Display TM1637", black PCB, in red/blue/green/white/yellow) made from two 3-digit LED blocks, with a decimal point on every digit and no colon.

## Pinout (diymore 6-digit module, header order)
| Pin | Function |
|---|---|
| VCC | Supply, 3.3 V or 5 V: match your microcontroller's logic voltage |
| GND | Ground |
| DIO | Data in/out (pulled up to VCC on the module; chip pulls it low for ACK) |
| CLK | Clock input (pulled up to VCC on the module) |

The header order is the **reverse** of most 4-digit TM1637 boards (those are CLK, DIO, VCC, GND), so read the silkscreen before you wire it.

## Electrical limits
- Chip datasheet: VDD typical 5 V, characterised at 4.5–5.5 V, absolute maximum 7 V. The module is sold for 3.3–5 V.
- Logic high needs ≥ 0.7 × VDD (3.5 V at 5 V), so a 3.3 V board should power the module from 3.3 V.
- Current: around 100 mA with all 48 segments lit at full brightness.
- Clock: keep under 250 kHz (datasheet); the driver runs at about 100 kHz.

## Interface details
- **Not I2C**: no address. Start = DIO falls while CLK is high; stop = DIO rises while CLK is high; DIO only changes while CLK is low; bytes go **LSB first**; the chip pulls DIO low during the 9th (ACK) clock.
- Data command **0x40** (write, auto-increment), address command **0xC0** followed by 6 segment bytes (C0H–C5H), then display control **0x88 | brightness** (0–7 = 1/16 … 14/16 pulse width; 0x80 = display off).
- Segment byte: bit0 = a … bit6 = g, bit7 = that digit's decimal point.
- **Digit order is scrambled**: left to right the digits are driven by **C2H, C1H, C0H, C5H, C4H, C3H**. A 4-digit library that writes "123456" from C0H shows "321654". The driver's `DIGIT_MAP = (2, 1, 0, 5, 4, 3)` handles this.

## Wiring
- ESP32: VCC → 3V3, GND → GND, DIO → D25, CLK → D26.
- Pico: VCC → 3V3(OUT), GND → GND, DIO → GP2, CLK → GP3.
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, DIO → GPIO24 (pin 18), CLK → GPIO23 (pin 16).

## Using the driver
```python
from tm1637_6 import TM1637
display = TM1637(26, 25, brightness=4)   # CLK, DIO GPIO numbers
display.number(123456)                   # right aligned, -99999..999999
display.decimal(-12.75, 2)               # " -12.75" with the dot lit
display.show('12.30.45')                 # dots after characters
display.show('dONE')
display.brightness(1)
```

## Gotchas
- Don't use the I2C peripheral: it sends an address byte MSB-first and the TM1637 will show garbage.
- Digits in the wrong order (321654) means the code assumes C0H is the leftmost digit; use the digit map.
- Powering the module from 5 V while a 3.3 V board drives it puts 5 V (via the pull-ups) on the GPIO pins. Use 3V3.
- Nothing lights until the display control command (0x88 | brightness) has been sent.

## Datasheet
https://akizukidenshi.com/goodsaffix/TM1637_V2.4_EN.PDF
