---
name: part-apa102-strip
description: Pinout, electrical limits, wiring and MicroPython driver for the APA102 / APA102C addressable RGB LED strip (DotStar-style, 60 LEDs/m, clock + data SPI). Use when designing, wiring, simulating or writing code for an APA102 strip in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# APA102 addressable LED strip (APA102 strip)

## Overview
A 1 m flexible strip of **60 APA102C** RGB LEDs (iPixel / Shiji Lighting). Each LED has 8-bit PWM per colour plus a 5-bit (32-level) global brightness, and is driven by a **clock + data** pair (SPI style, no chip select), so timing is not critical the way it is for WS2812. Modelled on the **SparkFun LED RGB Strip - Addressable, 1m (APA102), COM-14015**, which uses the iPixel S60102 strip with 4-pin 0.1" connectors. Adafruit DotStar strips use the same protocol (newer reels use the SK9822 clone).

## Pinout (input end, pads printed on the strip)
| Pin | Function |
|---|---|
| GND | Ground, shared with the board and the 5 V supply |
| CI | Clock in (lead "CLK") |
| DI | Data in (lead "DAT") |
| 5V | LED supply, 5 V |

S60102 lead colours: red = 5V, blue = CLK, green = DAT, yellow = GND. Colours vary by batch: go by the printed pads. The arrows on the strip point away from the input end; the output end (CO/DO) chains to another strip.

## Electrical limits
- Supply: regulated 5 V to 5.5 V (5.0 V typical, 5.5 V max, 6.0 V absolute maximum). The datasheet gives no lower limit; SparkFun specifies 5 V to 5.5 V.
- Up to 2.88 A per metre at full white (about 48–60 mA per LED). Use a separate 5 V 3 A+ supply with GND joined to the board.
- Inputs: high ≥ 0.7 × VDD (3.5 V at 5 V), low ≤ 0.3 × VDD. 3.3 V logic is not guaranteed: use a 74AHCT125 level shifter on CI and DI.

## Interface details
- Data is sampled on the **rising** edge of CI, MSB first: SPI mode 0 (polarity 0, phase 0). 1 MHz is a safe default.
- Start frame: 32 zero bits.
- One 32-bit frame per LED: `111` + 5-bit global brightness (0–31), then **blue, green, red** (8 bits each).
- End frame: 1 bits. The datasheet shows 32; long strips need at least n/2 extra clock edges, so the driver sends max(4, ceil(n/16)) bytes of 0xFF.
- Brightness 16/31 halves the drive current; brightness 0 turns an LED off.

## Wiring
- ESP32: CI → GPIO18, DI → GPIO23 (any pins work with SPI(1)), GND → GND, 5V → external 5 V supply (its − to GND).
- Pico: CI → GP10, DI → GP11 (SPI1), GND → GND, 5V → external 5 V supply (its − to GND).
- Raspberry Pi: CI → pin 23 (SCLK), DI → pin 19 (MOSI), GND → pin 6 and supply GND, 5V → external supply.
- 1000 µF capacitor across 5V/GND at the strip input.

## Using the driver
```python
from machine import Pin, SPI
from apa102 import APA102
spi = SPI(1, baudrate=1000000, polarity=0, phase=0, sck=Pin(10), mosi=Pin(11))
strip = APA102(spi, 60, brightness=4)
strip[0] = (255, 0, 0)        # first LED red
strip.show()
```

## Gotchas
- Wire the input end (arrows point away from it). Data into CO/DO does nothing.
- Do not power 60 LEDs at full white from a board's 5 V pin.
- Wrong colours? Remember the frame order is B, G, R; the driver takes (r, g, b).
- Brightness is stored per LED when you set it; change `strip.brightness` before setting pixels.
- SK9822 clones work with this driver; they apply the 5-bit brightness as a current setting rather than extra PWM.

## Datasheet
http://cdn.sparkfun.com/datasheets/Components/LED/APA102C.pdf
