---
name: part-ht16k33-8x8-matrix
description: Pinout, electrical limits, wiring and MicroPython driver for the HT16K33 8x8 LED matrix I2C backpack (Adafruit Small 1.2" 8x8 LED Matrix w/I2C Backpack, HT16K33). Use when designing, wiring, simulating or writing code for an HT16K33 8x8 dot matrix in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# HT16K33 8x8 LED matrix (HT16K33)

## Overview
The **Holtek HT16K33** is a RAM-mapped 16×8 LED controller with an I2C interface, internal oscillator, 16-step dimming and hardware blink. Hobbyists buy it as the **Adafruit Small 1.2" 8x8 LED Matrix w/I2C Backpack** (product 1049 red; 1050/1051/1052/1632 other colours; 1614/1857 white; the current revision adds two STEMMA QT connectors). 64 LEDs you can draw letters and icons on over two I2C wires.

## Pinout (Adafruit 1.2" 8x8 backpack, 4-pin header CN1, as printed)
| Pin | Function |
|---|---|
| C | I2C clock (SCL), 10 kΩ pull-up to + |
| D | I2C data (SDA), 10 kΩ pull-up to + |
| - | Ground |
| + | VDD: HT16K33 and LED supply, 5 V (chip spec 4.5–5.5 V). SDA/SCL pull-ups go here |

## Electrical limits
- HT16K33 supply: 4.5–5.5 V (datasheet). Adafruit reports it also runs from 3.3 V, dimmer and outside the chip spec.
- Logic: VIH = 0.7·VDD (3.5 V at 5 V), I2C up to 400 kHz.
- Current: up to about 160 mA with all 64 LEDs lit at full brightness (8 rows × ~20 mA).

## Interface details
- **I2C address 0x70** (A0/A1/A2 solder jumpers add 1/2/4 → 0x70–0x77; on this backpack the A1/A2 labels are swapped).
- Commands (single byte): **0x21** oscillator on; **0x80 | blink<<1 | 1** display on (blink 0 off, 1 = 2 Hz, 2 = 1 Hz, 3 = 0.5 Hz); **0xE0 | n** brightness n = 0–15 (1/16–16/16 duty).
- At power-up the oscillator is stopped and the display is off: send 0x21, brightness, then 0x81.
- Display RAM: write 0x00 then 16 data bytes (pointer auto-increments). Row y (top = 0) is RAM byte **2·y**; odd bytes unused.
- Column x (left = 0) is bit **(x + 7) % 8** of the row byte (the backpack shifts the columns by one; same as Adafruit's library).

## Wiring
- ESP32: + → 5V (VIN), - → GND, D → GPIO21, C → GPIO22 (through an I2C level shifter, see Gotchas).
- Pico: + → VBUS, - → GND, D → GP4, C → GP5 (through a level shifter).
- Raspberry Pi 4: + → pin 2 (5 V), - → pin 6, D → pin 3, C → pin 5 (through a level shifter).

## Using the driver
```python
from machine import I2C, Pin
from ht16k33matrix import HT16K33Matrix
i2c = I2C(0, sda=Pin(21), scl=Pin(22), freq=400000)
m = HT16K33Matrix(i2c, 0x70, brightness=8)
m.fill(0)
m.text('A', 0, 0, 1)   # any framebuf drawing: pixel, line, rect, text
m.show()
m.blink(2)             # 1 Hz blink
```

## Gotchas
- The backpack's pull-ups go to +, so with + on 5 V the bus idles at 5 V, above the ESP32/Pico 3.6 V pin limit. Use a bidirectional I2C level shifter for 3.3 V boards (or power + from 3.3 V, which Adafruit says works but is below the chip's 4.5 V spec).
- Nothing shows until the oscillator (0x21) and display-on (0x81) commands are sent.
- Writing framebuf bytes straight to RAM gives a picture shifted by one column; remap with bit (x + 7) % 8 as the driver does.
- Solder the matrix with its printed edge on the same side as the backpack's filled-dot corner, or the image is rotated.
- Several matrices: give each a different A0–A2 jumper setting.

## Datasheet
https://cdn-shop.adafruit.com/datasheets/ht16K33v110.pdf
