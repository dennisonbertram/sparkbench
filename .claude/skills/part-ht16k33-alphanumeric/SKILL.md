---
name: part-ht16k33-alphanumeric
description: Pinout, electrical limits, wiring and MicroPython driver for the HT16K33 quad 14-segment alphanumeric I2C LED backpack (Adafruit 0.54" Quad Alphanumeric Display, products 1911/1912, HT16K33). Use when designing, wiring, simulating or writing code for an HT16K33 alphanumeric / 14-segment display in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# HT16K33 quad 14-segment alphanumeric display (HT16K33)

## Overview
The **Holtek HT16K33** is a RAM-mapped 16×8 LED controller with an I2C interface, internal oscillator, 16-step dimming and hardware blink. Hobbyists buy it as the **Adafruit Quad Alphanumeric Display – 0.54" Digits w/ I2C Backpack – STEMMA QT** (product 1911 red, 1912 blue, other colours; 1910 = backpack alone). Four 14-segment digits, each with a decimal point, so it can show letters, digits and symbols over two I2C wires.

## Pinout (STEMMA QT backpack, 5-pin header, left to right as printed on top)
| Pin | Back silk | Function |
|---|---|---|
| SCL | C | I2C clock, 10 kΩ pull-up to VIO |
| SDA | D | I2C data, 10 kΩ pull-up to VIO |
| GND | - | Ground (power and logic) |
| VIO | + | Logic level 3–5 V: powers the SDA/SCL pull-ups, and the chip through a Schottky diode if VHi is unused |
| VHi | Vh | HT16K33 + LED supply, 5 V (chip spec 4.5–5.5 V) |

Two STEMMA QT / Qwiic connectors carry GND, VIO, SDA, SCL in parallel with the header. (The older non-QT backpack has a Vi2c pin instead of VHi.)

## Electrical limits
- HT16K33 VDD: 4.5–5.5 V (datasheet). Feed VHi from 5 V; VHi on 3.3 V leaves the display dark.
- VIO: 3–5 V, match the microcontroller's logic level.
- I2C up to 400 kHz; VIH = 0.7·VDD (3.5 V at 5 V). Adafruit sells it for 3.3 V boards and it works in practice; use a level shifter if the bus misbehaves.
- Current: about 1 mA for the chip; all segments lit at full brightness draws on the order of 150 mA from VHi.

## Interface details
- **I2C address 0x70** (A0/A1/A2 solder jumpers add 1/2/4 → 0x70–0x77).
- Commands (single byte): **0x21** oscillator on; **0x80 | blink<<1 | 1** display on (blink 0 off, 1 = 2 Hz, 2 = 1 Hz, 3 = 0.5 Hz); **0xE0 | n** brightness n = 0–15.
- At power-up the oscillator is stopped and the display is off: send 0x21, brightness, then 0x81.
- Display RAM: write 0x00 then data bytes (pointer auto-increments). Digit n (0 = leftmost) is a 16-bit word, **low byte at RAM 2n, high byte at 2n+1**.
- Segment bits: 0–5 = A–F, 6 = G1, 7 = G2, 8–13 = H, J, K, L, M, N, **14 = decimal point**. Glyphs follow the Adafruit LED Backpack font (e.g. 'A' = 0x00F7, '0' = 0x0C3F).

## Wiring
- ESP32: VHi → 5V (VIN), VIO → 3V3, GND → GND, SDA → GPIO21, SCL → GPIO22.
- Pico: VHi → VBUS, VIO → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VHi → pin 2 (5 V), VIO → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from ht16k33alpha import HT16K33Alpha
i2c = I2C(0, sda=Pin(21), scl=Pin(22), freq=400000)
disp = HT16K33Alpha(i2c, 0x70)
disp.text('Hi42')          # left-aligned, up to 4 characters
disp.number(-3.5, 1)       # right-aligned number with decimal point
disp.scroll('HELLO WORLD') # marquee once
disp.brightness(5)
disp.blink(2)              # 1 Hz blink
```

## Gotchas
- Connect VIO: the SDA/SCL pull-ups are powered only from VIO (VHi does not feed them).
- Never tie VIO to 5 V with a 3.3 V board: the bus would idle at 5 V, above the ESP32/Pico 3.6 V pin limit.
- Nothing shows until the oscillator (0x21) and display-on (0x81) commands are sent.
- Each digit takes two RAM bytes; writing only the low byte leaves the diagonal/centre segments of the high byte stale.
- Several displays: give each a different A0–A2 jumper setting.

## Datasheet
https://cdn-shop.adafruit.com/datasheets/ht16K33v110.pdf
