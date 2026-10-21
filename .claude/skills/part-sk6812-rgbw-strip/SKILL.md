---
name: part-sk6812-rgbw-strip
description: Pinout, electrical limits, wiring and MicroPython driver for the SK6812 RGBW addressable LED strip (60 LEDs/m, 5 V, OPSCO SK6812RGBW, GRBW NeoPixel-compatible). Use when designing, wiring, simulating or writing code for an SK6812 RGBW strip / RGBW NeoPixel strip in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# SK6812 RGBW LED strip (SK6812RGBW strip 60/m)

## Overview
A flexible strip of **SK6812RGBW** LEDs (OPSCO, 5050 package), 60 per metre. Each pixel holds red, green, blue and a **white** LED die plus a driver chip, so it can show colours and a clean white (cool, natural or warm, depending on the version). All pixels share one data wire. Hobbyists buy it as the **BTF-LIGHTING SK6812 RGBW strip, 60 LEDs/m, DC5V**, cut to 1 m (60 pixels), with a 3-pin JST-SM lead on the input end.

## Pinout (input end, pads printed on the strip)
| Pin | Function |
|---|---|
| +5V | LED supply, 5 V regulated |
| DI | Data in to the first LED |
| GND | Ground, shared with the microcontroller and the supply |

The far end reads **+5V, DO, GND** and only feeds another strip. Arrows on the strip point away from the input. Lead colours vary: BTF and Pi Hut strips often use red = 5V, green = data, **white = GND**. Go by the printed pads.

## Electrical limits
- Supply: 3.5–5.5 V absolute maximum, characterised at 4.5–5.5 V; use a regulated 5 V. More than 5.5 V destroys the LEDs.
- Current: up to about 80 mA per LED with R, G, B and W all at full, so **4.8 A per metre**. About 1 mA per LED when dark.
- Data input: VIH 3.4 V minimum, VIL 1.6 V maximum at VDD 5 V.

## Interface details
- Single-wire NRZ code at 800 kbit/s: 0 bit = 0.3 µs high, 0.9 µs low; 1 bit = 0.6 µs high, 0.6 µs low (±0.15 µs); bit period 1.25 µs ±0.6 µs.
- **32 bits per LED in G, R, B, W order**, MSB first. The first LED keeps the first 32 bits and passes the rest on. (The OPSCO datasheet's bit table prints R first, but real SK6812RGBW strips are GRBW, which is what Adafruit's `NEO_GRBW` and MicroPython's `neopixel` with `bpp=4` send.)
- A low of at least 80 µs latches the colours.

## Wiring
- ESP32: +5V → external 5 V supply, GND → GND and the supply's −, DI → D25 through a 74AHCT125 and a 330 Ω resistor.
- Pico: +5V → external 5 V supply, GND → GND and the supply's −, DI → GP2 through a 74AHCT125 and a 330 Ω resistor.
- Raspberry Pi 4: +5V → external 5 V supply, GND → pin 6 and the supply's −, DI → pin 12 (GPIO18) through a level shifter.
- Add a 1000 µF capacitor across +5V and GND at the strip.

## Using the driver
```python
from machine import Pin
from sk6812_rgbw import SK6812RGBW
strip = SK6812RGBW(Pin(25), 60, brightness=0.2)
strip.fill((0, 0, 0, 255))      # pure white LED
strip.pixel(0, (255, 0, 0, 0))  # first LED red
strip.show()
```
Plain MicroPython works too: `neopixel.NeoPixel(Pin(25), 60, bpp=4)`, colours as `(r, g, b, w)`.

## Gotchas
- Forgetting `bpp=4`: the strip then gets 24-bit frames and the colours smear along the strip.
- A full-white metre draws 4.8 A: never power it from a board's 5V/VBUS pin. Use a 5 V 6 A supply and join the GNDs.
- 3.3 V data is below the 3.4 V VIH spec. It may work on short wires, but a 74AHCT125 level shifter makes it reliable.
- Connect at the input end (arrows point away). Data into DO does nothing.
- If the colours are rotated (white shows as blue, for example), you have an RGB-only SK6812/WS2812 strip, not RGBW.

## Datasheet
https://cdn-shop.adafruit.com/product-files/2757/p2757_SK6812RGBW_REV01.pdf
