---
name: part-ht16k33-7-segment
description: Pinout, electrical limits, wiring and MicroPython driver for the HT16K33 4-digit 7-segment I2C LED backpack (Adafruit 0.56" display, HT16K33). Use when designing, wiring, simulating or writing code for an HT16K33 7-segment display in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# HT16K33 4-digit 7-segment display (HT16K33)

## Overview
The **Holtek HT16K33** is a RAM-mapped 16×8 LED controller with an I2C interface, internal oscillator, 16-step dimming and hardware blink. Hobbyists buy it as the **Adafruit 0.56" 4-Digit 7-Segment Display w/ I2C Backpack** (product 878 red; 879/880/881/1002 other colours; current revision adds two STEMMA QT connectors). Four digits with decimal points plus a centre colon, all over two I2C wires.

## Pinout (Adafruit 0.56" backpack, 4-pin header, as printed)
| Pin | Function |
|---|---|
| + | VCC/VDD: HT16K33 and LED supply, 5 V (chip spec 4.5–5.5 V). SDA/SCL pull-ups go here |
| - | Ground |
| D | I2C data (SDA), 10 kΩ pull-up to + |
| C | I2C clock (SCL), 10 kΩ pull-up to + |

## Electrical limits
- HT16K33 supply: 4.5–5.5 V (datasheet). Adafruit reports it also runs from 3.3 V, dimmer and outside the chip spec.
- Logic: VIH = 0.7·VDD (3.5 V at 5 V), I2C up to 400 kHz.
- Current: about 1 mA for the chip; with every segment lit at full brightness the LEDs draw on the order of 100 mA.

## Interface details
- **I2C address 0x70** (A0/A1/A2 solder jumpers add 1/2/4 → 0x70–0x77).
- Commands (single byte): **0x21** oscillator on; **0x80 | blink<<1 | 1** display on (blink 0 off, 1 = 2 Hz, 2 = 1 Hz, 3 = 0.5 Hz); **0xE0 | n** brightness n = 0–15 (1/16–16/16 duty).
- At power-up the oscillator is stopped and the display is off: send 0x21, brightness, then 0x81.
- Display RAM: write 0x00 then data bytes (pointer auto-increments). Digits left→right are RAM bytes **0, 2, 6, 8**; byte **4 bit 1 (0x02)** is the centre colon.
- Segment byte: bit0 = a … bit6 = g, bit7 = decimal point (e.g. 0x3F = "0", 0x40 = "-").

## Wiring
- ESP32: + → 5V (VIN), - → GND, D → GPIO21, C → GPIO22 (through an I2C level shifter, see Gotchas).
- Pico: + → VBUS, - → GND, D → GP4, C → GP5 (through a level shifter).
- Raspberry Pi 4: + → pin 2 (5 V), - → pin 6, D → pin 3, C → pin 5 (through a level shifter).

## Using the driver
```python
from machine import I2C, Pin
from ht16k33seg import HT16K33Seg
i2c = I2C(0, sda=Pin(21), scl=Pin(22), freq=400000)
disp = HT16K33Seg(i2c, 0x70)
disp.number(-8.75, 2)   # shows -8.75
disp.text('12:34')      # digits plus colon
disp.brightness(5)
```

## Gotchas
- The backpack's pull-ups go to +, so with + on 5 V the bus idles at 5 V, above the ESP32/Pico 3.6 V pin limit. Use a bidirectional I2C level shifter for 3.3 V boards (or power + from 3.3 V, which Adafruit says works but is below the chip's 4.5 V spec).
- Nothing shows until the oscillator (0x21) and display-on (0x81) commands are sent.
- Digit RAM is not contiguous: skip byte 4 (colon) between the second and third digits.
- Several displays: give each a different A0–A2 jumper setting.

## Datasheet
https://cdn-shop.adafruit.com/datasheets/ht16K33v110.pdf
