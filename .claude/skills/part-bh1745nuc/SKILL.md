---
name: part-bh1745nuc
description: Pinout, electrical limits, wiring and MicroPython driver for the BH1745NUC RGB + clear colour sensor (ROHM BH1745NUC, Pimoroni BH1745 Luminance and Colour Sensor Breakout PIM375). Use when designing, wiring, simulating or writing code for a BH1745 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# BH1745NUC RGB colour sensor (BH1745NUC)

## Overview
The **ROHM BH1745NUC** measures red, green, blue and clear (unfiltered) light with 16-bit outputs, an IR-cut filter and 50/60 Hz flicker rejection, over 0.005-40,000 lux. It talks I2C. Hobbyists buy it on the **Pimoroni BH1745 Luminance and Colour Sensor Breakout (PIM375)**, which adds a 3.3 V regulator, I2C level shifting with 10 kOhm pull-ups, reverse-polarity protection and two white LEDs.

## Pinout (Pimoroni PIM375, header order)
| Pin | Function |
|---|---|
| 3-6V | Supply, 3-6 V (regulated to 3.3 V on the board) |
| SDA | I2C data |
| SCL | I2C clock |
| INT | Interrupt, open-drain active low (printed as a slashed-circle symbol); also switches the white LEDs. Optional |
| GND | Ground |

It plugs straight onto Raspberry Pi pins 1, 3, 5, 7, 9. Newer boards also have a Qwiic/STEMMA QT socket.

## Electrical limits
- Chip: VCC 2.3-3.6 V (absolute max 4.5 V); the breakout takes 3-6 V.
- Current: about 130 uA measuring (250 uA max), 0.8 uA powered down; plus the LEDs when lit.
- I2C up to 400 kHz.

## Interface details
- **I2C address 0x38** (ADDR low, board default); 0x39 if the ADDR trace is cut.
- IDs: SYSTEM_CONTROL 0x40 bits 5:0 = 0x0B; MANUFACTURER ID 0x92 = 0xE0. Writing 0x80 to 0x40 = software reset.
- MODE_CONTROL1 0x41 bits 2:0: measurement time 160/320/640/1280/2560/5120 ms.
- MODE_CONTROL2 0x42: bit 4 RGBC_EN, bits 1:0 gain (00 = 1x, 01 = 2x, 10 = 16x), bit 7 VALID (cleared by reading 0x42).
- MODE_CONTROL3 0x44: always write 0x02.
- Data 0x50-0x57: red, green, blue, clear, 16-bit each, **low byte first**.
- A write to any MODE_CONTROL register restarts the measurement (160 ms typ, 225 ms max at the shortest setting).

## Wiring
- ESP32: 3-6V -> 3V3, GND -> GND, SDA -> D21, SCL -> D22.
- Pico: 3-6V -> 3V3(OUT), GND -> GND, SDA -> GP4, SCL -> GP5.
- Raspberry Pi 4: 3-6V -> pin 1, SDA -> pin 3, SCL -> pin 5, INT -> pin 7, GND -> pin 9.

## Using the driver
```python
from machine import I2C, Pin
from bh1745 import BH1745
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
s = BH1745(i2c)            # 160 ms, gain 1x
r, g, b, c = s.rgbc()
print('R=%d G=%d B=%d C=%d' % (r, g, b, c))
s.leds(True)               # light the white LEDs to see an object's colour
```

## Gotchas
- The datasheet gives no lux equation; counts are relative. Compare channels (e.g. r/c, g/c, b/c) or calibrate.
- The red channel reads higher than green and blue for white light (datasheet typ 4000/3350/2370 counts per 20 uW/cm2), so white-balance before naming colours.
- Turn the LEDs off when measuring ambient light; turn them on and hold an object close to read its colour.
- Raise the gain (16x) or measurement time in dim light; lower it if a channel reads 65535 (saturated).

## Datasheet
https://www.mouser.co.uk/datasheet/2/348/bh1745nuc-e-519994.pdf
