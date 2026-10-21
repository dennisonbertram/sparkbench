---
name: part-ws2812b-8x8-panel
description: Pinout, electrical limits, wiring and MicroPython driver for the WS2812B 8x8 flexible LED panel (64 addressable RGB LEDs, WS2812B). Use when designing, wiring, simulating or writing code for a WS2812B 8x8 panel / NeoPixel matrix in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# WS2812B 8x8 LED panel (WS2812B 8x8 panel)

## Overview
A flexible 80×80 mm circuit board carrying **64 WS2812B** RGB LEDs (Worldsemi) in an 8×8 grid, chained on one data wire. Each LED holds a 24-bit colour (8 bits each of green, red, blue). Hobbyists buy it as the **BTF-LIGHTING WS2812B 8x8 64-pixel flexible panel**, which has a 3-pin JST-SM input lead, a matching output lead for chaining, and often an extra pair of power wires.

## Pinout (input connector, order printed on the board)
| Pin | Function |
|---|---|
| 5V | LED supply, 5 V (3.5–5.3 V) |
| DIN | Data in to the first LED |
| GND | Ground, shared with the microcontroller |

The output connector on the far side reads **5V, DOUT, GND**: DOUT feeds the DIN of a second panel. Wire colours vary by batch (often red = 5V, green = DIN, white = GND), so go by the printed labels and check with a multimeter.

## Electrical limits
- Supply: 3.5–5.3 V (datasheet absolute maximum); characterised at 4.5–5.5 V, so use 5 V.
- Current: about 60 mA per LED at full white, so **up to 3.8 A** for the panel. Roughly 1 mA per LED when dark.
- Data input high must be at least 0.7 × VDD (3.5 V at 5 V); low at most 0.3 × VDD.

## Interface details
- Single-wire NRZ code at 800 kbit/s: a 0 bit is 0.4 µs high then about 0.85 µs low; a 1 bit is 0.8 µs high then about 0.45 µs low (±150 ns).
- 24 bits per LED in **G R B** order, most significant bit first. The first LED keeps the first 24 bits and passes the rest on.
- A low of more than 50 µs latches the colours (newer WS2812B-V5 parts need about 280 µs; MicroPython's `neopixel` waits long enough between writes).
- LED order is a zig-zag: row 0 runs away from the DIN corner, row 1 comes back, and so on. The driver's `index(x, y)` handles this (`serpentine=False` for panels wired row by row).

## Wiring
- ESP32: 5V → VIN/5V (low brightness only) or an external 5 V supply, GND → GND, DIN → D13 through a 330 Ω resistor.
- Pico: 5V → VBUS (low brightness only) or an external 5 V supply, GND → GND, DIN → GP15 through a 330 Ω resistor.
- Raspberry Pi 4: 5V → external 5 V supply, GND → pin 6 and the supply's GND, DIN → pin 12 (GPIO18).
- Add a 1000 µF capacitor across 5V and GND at the panel.

## Using the driver
```python
from machine import Pin
from ws2812b_matrix import Matrix8x8
m = Matrix8x8(Pin(13), brightness=0.1)
m.pixel(0, 0, (255, 0, 0))   # top-left red
m.show()
```

## Gotchas
- Do not drive all 64 LEDs at full white from a board's USB 5 V pin: 3.8 A will brown out or damage it. Keep brightness at 10–20 % or use a 5 V 4 A supply, with GNDs joined.
- Connect to the **input** side (DIN). Data sent into DOUT does nothing.
- 3.3 V data into a 5 V panel is borderline. If the first LED flickers or shows wrong colours, add a 74AHCT125 level shifter.
- Some sellers' panels have the extra power-wire pads mislabelled; check them with a multimeter before connecting.
- Colours look wrong (red and green swapped)? Your LEDs are not WS2812B: check the order setting of your library.

## Datasheet
https://cdn-shop.adafruit.com/datasheets/WS2812B.pdf
