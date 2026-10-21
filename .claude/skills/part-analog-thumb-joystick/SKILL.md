---
name: part-analog-thumb-joystick
description: Pinout, electrical limits, wiring and MicroPython driver for the Adafruit analog 2-axis thumb joystick with select button + breakout board (Adafruit product 512; two 10 kΩ pots + push switch). Use when designing, wiring, simulating or writing code for an analog thumb joystick in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Analog thumb joystick (Adafruit #512)

## Overview
Adafruit's **Analog 2-axis Thumb Joystick with Select Button + Breakout Board** (product 512) is a PSP/Xbox-style
thumb stick soldered to a small breakout with a 5-pin 0.1" header. There is no chip on it:
- **Two 10 kΩ potentiometers** (X and Y). Each wiper outputs **0 V at one end, Vcc at the other, about Vcc/2 at rest**
  (silkscreen: "X and Y act like 10K pots", "Xout and Yout are Analog out")
- A **select switch**: "SEL shorts to ground when pressed" (active low, no pull-up on the board)
- Supply: any voltage **up to 5 V**; about 1 mA at 5 V (0.66 mA at 3.3 V)

## Pinout (5-pin header, from the Adafruit Eagle files, JP1 pin 1 first)
| Pin | Name | Function |
|-----|------|----------|
| 1 | GND | Ground (pot ends and switch) |
| 2 | Sel | Select switch to GND, low while pressed (needs a pull-up) |
| 3 | Yout | Y-axis wiper voltage, 0..Vcc |
| 4 | Xout | X-axis wiper voltage, 0..Vcc |
| 5 | Vcc | Supply for both pots, up to 5 V (use 3.3 V with a 3.3 V MCU) |

Read left to right on the silkscreen the header says Vcc, Xout, Yout, Sel, GND (the same pins from the other end).

## Electrical limits
- The wipers swing all the way to Vcc. **Powered from 5 V, Xout/Yout reach 5 V, which can damage an ESP32 or Pico ADC pin.** With a 3.3 V MCU connect Vcc to 3V3.
- 10 kΩ pots: source impedance at the wiper up to 2.5 kΩ, fine for MCU ADCs.

## Interface details
Ratiometric potentiometer divider:
```
Vout = position × Vcc        position(%) = 100 × Vout / Vcc
```
At rest each axis reads about 50 % (1.65 V at 3.3 V). Spring centring is imprecise; use a dead zone.
Sel: GPIO input with the internal pull-up; reads 0 while the stick is pressed.

## Wiring
| Breakout | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| GND | GND | GND | GND |
| Sel | GPIO4 (internal pull-up) | GP15 (internal pull-up) | GPIO17 (internal pull-up) |
| Yout | GPIO35 (ADC1) | GP27 / ADC1 | External ADC (e.g. MCP3008 CH1) |
| Xout | GPIO34 (ADC1) | GP26 / ADC0 | External ADC (e.g. MCP3008 CH0) |
| Vcc | 3V3 | 3V3(OUT) | 3V3 (pin 1) |

The Raspberry Pi 4 has no ADC. On the ESP32 use ADC1 pins (ADC2 stops working with Wi-Fi on).

## Using the driver
```python
from thumbjoystick import ThumbJoystick
import time
js = ThumbJoystick(34, 35, 4)     # GPIOs wired to Xout, Yout, Sel
while True:
    print('X=%d Y=%d SEL=%d' % (round(js.x()), round(js.y()), js.pressed()))
    time.sleep(0.2)
```
`x()` / `y()` give 0–100 % of travel, `xy_centered()` gives −100..+100 with a dead zone, `pressed()` is True while the stick is pushed. Pass `vcc=` if the board is not on 3.3 V.

## Gotchas
- **Never power it from 5 V on a 3.3 V board.**
- **Sel floats when released**: always enable `Pin.PULL_UP`.
- Which way is "up" depends on how you mount it; flip or swap axes in software.
- The ESP32 ADC is nonlinear near 0 V and the top of its range, so the ends of travel read a little short.
- You have to solder the stick to the breakout yourself (it ships as a mini kit).

## Datasheet
No chip datasheet (passive part). Product page: https://www.adafruit.com/product/512 — board design: https://github.com/adafruit/2-axis-joystick-breakout-board-with-mounting-holes
