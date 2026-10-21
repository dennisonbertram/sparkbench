---
name: part-ws2812b-16x16-matrix
description: Pinout, electrical limits, wiring and MicroPython driver for the WS2812B 16x16 flexible LED matrix (256 addressable RGB LEDs, WS2812B). Use when designing, wiring, simulating or writing code for a WS2812B 16x16 panel / NeoPixel matrix in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# WS2812B 16x16 LED matrix (WS2812B 16x16 panel)

## Overview
A flexible 160×160 mm circuit board carrying **256 WS2812B** RGB LEDs (Worldsemi) in a 16×16 grid at 10 mm pitch, chained on one data wire. Each LED holds a 24-bit colour (8 bits each of green, red, blue). Hobbyists buy it as the **BTF-LIGHTING WS2812B 16x16 256-pixel flexible panel** (also sold by PMD Way, AZ-Delivery, Probots), with a 3-pin JST-SM input lead, a matching output lead for chaining and an extra red/white pair of power-injection wires.

## Pinout (input connector, order printed on the board)
| Pin | Function |
|---|---|
| 5V | LED supply, 5 V (3.5–5.3 V absolute max) from a separate supply |
| DIN | Data in to the first LED |
| GND | Ground, shared with the microcontroller and the supply |

The output connector on the far side reads **5V, DOUT, GND**: DOUT feeds the DIN of a second panel. Wire colours vary by batch (red = 5V; green = data; white or black = GND), so go by the printed labels.

## Electrical limits
- Supply: 3.5–5.3 V (datasheet absolute maximum); characterised at 4.5–5.5 V, so use a regulated 5 V.
- Current: about 60 mA per LED at full white (0.3 W), so **up to about 15.4 A (77 W)** for the panel; typical animations 4–6 A. Roughly 1 mA per LED when dark (about 0.25 A for the panel).
- Data input high must be at least 0.7 × VDD (3.5 V at 5 V); low at most 0.3 × VDD.

## Interface details
- Single-wire NRZ code at 800 kbit/s: a 0 bit is 0.4 µs high then about 0.85 µs low; a 1 bit is 0.8 µs high then about 0.45 µs low (±150 ns).
- 24 bits per LED in **G R B** order, most significant bit first. The first LED keeps the first 24 bits and passes the rest on. A full frame is 256 × 24 bits ≈ 7.7 ms.
- A low of more than 50 µs latches the colours (newer WS2812B-V5 parts need about 280 µs; MicroPython's `neopixel` waits long enough between writes).
- LED order is a zig-zag: row 0 runs away from the DIN corner, row 1 comes back, and so on. The driver's `index(x, y)` handles this (`serpentine=False` for panels wired row by row).
- A 256-LED buffer is 768 bytes, fine on ESP32 and Pico.

## Wiring
- Power: 5V and GND to a separate 5 V 10–20 A supply; join the supply GND to the board GND. Also connect the extra power wires to the supply.
- ESP32: DIN → D13 through a 74AHCT125 (5 V powered) and a 330 Ω resistor.
- Pico: DIN → GP15 through a 74AHCT125 and a 330 Ω resistor.
- Raspberry Pi 4: DIN → pin 12 (GPIO18) through a 74AHCT125; GND → pin 6 and the supply's GND.
- Add a 1000 µF capacitor across 5V and GND at the panel.

## Using the driver
```python
from machine import Pin
from ws2812b_16x16 import Matrix16x16
m = Matrix16x16(Pin(13), brightness=0.1)
m.pixel(0, 0, (255, 0, 0))   # first LED red
m.show()
```

## Gotchas
- Never power the panel from the board's 5V/VBUS pin: even at 10 % brightness a full-white frame draws about 1.5 A. Use a separate 5 V supply with GNDs joined.
- Connect to the **input** side (DIN). Data sent into DOUT does nothing.
- 3.3 V data into a 5 V panel is borderline. If the first LED flickers or shows wrong colours, add a 74AHCT125 level shifter.
- Far LEDs look dim or yellowish at high brightness: inject power at the extra wires.
- Colours look wrong (red and green swapped)? Your LEDs are not WS2812B: check the order setting of your library.

## Datasheet
https://cdn-shop.adafruit.com/datasheets/WS2812B.pdf
