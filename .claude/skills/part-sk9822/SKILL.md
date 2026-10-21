---
name: part-sk9822
description: Pinout, electrical limits, wiring and MicroPython driver for the SK9822 addressable RGB LED strip (APA102-compatible clock + data SPI LEDs, Pololu 3089 60-LED 1 m strip). Use when designing, wiring, simulating or writing code for an SK9822 / APA102 / DotStar-style strip in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# SK9822 addressable RGB LED strip (SK9822)

## Overview
A 1 m strip of **60 SK9822** RGB LEDs (Opsco), each with its own driver chip. Unlike WS2812 "NeoPixels", the SK9822 uses **two wires, clock and data** (an APA102 clone), so there is no critical timing: any SPI peripheral drives it. Each LED has 8-bit PWM per colour plus a 5-bit global brightness that sets the constant LED current. Modelled product: **Pololu Addressable RGB 60-LED Strip, 5V, 1m (SK9822), #3089**.

## Pinout (input lead, JST SM 4-pin, wire order)
| Pin | Wire | Function |
|---|---|---|
| GND | black | Ground, shared with the microcontroller and the 5 V supply |
| DI | green | Data in (SPI MOSI), sampled on CI rising edge |
| CI | yellow | Clock in (SPI SCK), idles low |
| VCC | red | LED supply, 5 V |

The strip pads read VCC, CI, DI, GND at the input end and VCC, CO, DO, GND at the output end. A spare red/black pair at the input is an extra power feed.

## Electrical limits
- Supply: 5 V typical, 5.3 V max (absolute maximum 5.5 V). Constant-current drive keeps colours steady down to about 3.5 V.
- Current: up to 20 mA per colour channel, about 50 mA per LED at full white: **up to 3 A for 60 LEDs**. About 1 mA per LED when dark.
- Logic inputs: -0.3 V to VDD + 0.3 V. No input-high threshold is specified; Pololu drives it from 3.3 V in tests but recommends a level shifter.
- Clock: high and low widths over 30 ns each, data setup over 10 ns (up to 30 MHz).

## Interface details
- SPI mode 0 (clock idles low, data read on rising edge), MSB first, no chip select.
- Start frame: 32 zero bits.
- Per LED: `0b111` + 5-bit brightness (0-31, current = n/31), then **blue, green, red** bytes.
- The SK9822 latches new colours when it sees the next 32-zero-bit frame, so send a **reset frame of 32 zeros** after the LED data, then at least n/2 more zero clocks (n/16 bytes) so data reaches the last LED. The datasheet's 32-ones end frame can light the first LED wrongly; avoid it.
- Refresh rate = 1 / ((64 + 32 × LEDs) × clock period).

## Wiring
- ESP32: CI → GPIO18, DI → GPIO23 (SPI(1) or any pins), GND → GND, VCC → external 5 V 3 A supply whose GND joins the ESP32 GND.
- Pico: CI → GP10, DI → GP11 (SPI1), GND → GND, VCC → external 5 V supply.
- Raspberry Pi 4: CI → pin 23 (SCLK), DI → pin 19 (MOSI), GND → pin 6 and the supply GND, VCC → external 5 V supply.
- Put a 1000 µF capacitor across VCC and GND at the strip.

## Using the driver
```python
from machine import Pin, SPI
from sk9822 import SK9822
spi = SPI(1, baudrate=2000000, polarity=0, phase=0, sck=Pin(18), mosi=Pin(23))
strip = SK9822(spi, 60, brightness=8)
strip[0] = (255, 0, 0)   # first LED red
strip.show()
```

## Gotchas
- Wire the **input** end (DI/CI). Data sent into DO/CO does nothing.
- Do not power a full-brightness strip from a board's 5 V pin; 3 A will brown it out. Use a separate 5 V supply and join the grounds.
- Colours a frame late or the first LED flashing white? Your code sends a 0xFF end frame meant for the APA102; send zeros instead.
- Low brightness values shift the colour slightly toward green (Pololu note).
- Lowering `brightness` reduces current and heat; lowering colour values only reduces PWM duty.

## Datasheet
https://www.pololu.com/file/0J1234/sk9822_datasheet.pdf
