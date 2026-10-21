---
name: part-tm1637
description: Pinout, electrical limits, wiring and MicroPython driver for the TM1637 4-digit 7-segment LED display module with clock colon (TM1637). Use when designing, wiring, simulating or writing code for a TM1637 display in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# TM1637 4-digit 7-segment display (TM1637)

## Overview
The **TM1637** from Titan Micro drives up to six 7-segment digits with 8 brightness steps over a two-wire CLK/DIO bus. Hobbyists buy it as a **4-digit 0.36" red clock display module** (e.g. ProtoSupplies TM1637 4-Digit 0.36" Red Display, the common blue-PCB clone) with a centre colon and a 4-pin header.

## Pinout (clock module, header order)
| Pin | Function |
|---|---|
| CLK | Clock input (10k pull-up to VCC on the module) |
| DIO | Data in/out (10k pull-up to VCC; chip pulls it low for ACK) |
| VCC | Supply, 3.3 V or 5 V: match your microcontroller's logic voltage |
| GND | Ground |

## Electrical limits
- Chip datasheet: VDD typical 5 V, characterised at 4.5–5.5 V, absolute maximum 7 V. The module vendor rates it for 3.3 or 5 V.
- Logic high needs ≥ 0.7 × VDD (3.5 V at 5 V), so a 3.3 V board should power the module from 3.3 V.
- Current: up to about 80 mA with every segment lit at full brightness.
- Clock: keep under 250 kHz (datasheet); the driver runs at about 100 kHz.

## Interface details
- **Not I2C**: no address. Start = DIO falls while CLK is high; stop = DIO rises while CLK is high; DIO only changes while CLK is low; bytes go **LSB first**; the chip pulls DIO low during the 9th (ACK) clock.
- Data command **0x40** (write, auto-increment), address command **0xC0** (C0H–C5H = digits 1–6) followed by the segment bytes, then display control **0x88 | brightness** (0–7 = 1/16 … 14/16 pulse width; 0x80 = display off).
- Segment byte: bit0 = a … bit6 = g, bit7 = DP. On the 4-digit clock module, **bit 7 of digit 2 is the colon**.

## Wiring
- ESP32: VCC → 3V3, GND → GND, CLK → D25, DIO → D26.
- Pico: VCC → 3V3(OUT), GND → GND, CLK → GP2, DIO → GP3.
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, CLK → GPIO23 (pin 16), DIO → GPIO24 (pin 18).

## Using the driver
```python
from tm1637 import TM1637
display = TM1637(25, 26, brightness=4)   # CLK, DIO GPIO numbers
display.numbers(12, 34)                   # 12:34 with the colon lit
display.number(-7)                        # right aligned, -999..9999
display.show('dONE')                      # letters it can draw
display.brightness(1)
```

## Gotchas
- Don't use the I2C peripheral: it sends an address byte MSB-first and the TM1637 will show garbage.
- Powering the module from 5 V while a 3.3 V board drives it puts 5 V (via the 10k pull-ups) on the GPIO pins and is below the datasheet's logic-high threshold. Use 3V3.
- Only digit 2's decimal-point bit is wired (to the colon) on clock modules; the other dots don't exist.
- Nothing lights until the display control command (0x88 | brightness) has been sent.

## Datasheet
https://akizukidenshi.com/goodsaffix/TM1637_V2.4_EN.PDF
