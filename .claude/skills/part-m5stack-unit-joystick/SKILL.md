---
name: part-m5stack-unit-joystick
description: Pinout, electrical limits, wiring and MicroPython driver for the M5Stack Unit Joystick (SKU U024, ATmega328 I2C thumb joystick with push button, address 0x52, HY2.0-4P Grove port). Use when designing, wiring, simulating or writing code for an M5Stack Unit Joystick in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# M5Stack Unit Joystick (U024, I2C)

## Overview
The **M5Stack Unit Joystick (SKU U024)** is a PS2-style analog thumb stick (two 10 kΩ pots plus a push switch) with an **ATmega328** running M5Stack's firmware. The ATmega reads X on ADC0, Y on ADC1 and the button, and answers on I2C at **0x52** with three bytes: X, Y, button. It plugs in with the supplied HY2.0-4P (Grove-style) cable. The newer Unit Joystick2 uses a different chip and protocol.

## Pinout (HY2.0-4P cable, PORT.A order)
| Wire | Pin | Function |
|---|---|---|
| Black | GND | Ground |
| Red | 5V | Supply, 5 V |
| Yellow | SDA | I2C data (470 Ω series resistor, no pull-up on the unit) |
| White | SCL | I2C clock (470 Ω series resistor, no pull-up on the unit) |

## Electrical limits
- Supply: 5 V from the port (M5Stack PORT.A); the ATmega328 runs directly from it (no regulator on the unit). A few mA plus the power LED.
- SDA/SCL: the unit has **no pull-up resistors** (schematic: only R7/R8 470 Ω in series). Your board's I2C pull-ups (to 3.3 V) provide the high level, which keeps the lines safe for an ESP32 or Pico.
- ATmega328P TWI input high is 0.7 × VCC (3.5 V at 5 V). A 3.3 V bus is slightly below that, yet this is how M5Stack's own ESP32 controllers drive it; keep the cable short and the bus at 100 kHz if reads fail.

## Interface details
- **I2C address 0x52** (fixed).
- Read 3 bytes: `[0]` X, `[1]` Y (0–255, about 128 at rest; M5Stack's U024 sheet gives 10–250 in practice), `[2]` button (**0 released, 1 pressed**).
- M5Stack's protocol table calls it register 0x52 with length 3; their MicroPython driver uses `readfrom_mem(0x52, 0x52, 3)` and their Arduino example just reads 3 bytes. The firmware returns the same 3 bytes either way.
- `x - 128` / `y - 128` gives a signed offset from the centre (what UiFlow2's `get_x()`/`get_y()` return).

## Wiring
| Unit | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| 5V (red) | 5V / VIN | VBUS (pin 40) | 5 V (pin 2) |
| GND (black) | GND | GND | GND |
| SDA (yellow) | GPIO21 | GP4 | GPIO2 (pin 3) |
| SCL (white) | GPIO22 | GP5 | GPIO3 (pin 5) |

Add 4.7 kΩ pull-ups from SDA and SCL to **3.3 V** if your board has none (never to 5 V).

## Using the driver
```python
from machine import I2C, Pin
from m5_joystick import UnitJoystick
i2c = I2C(0, sda=Pin(21), scl=Pin(22), freq=100000)
joy = UnitJoystick(i2c)
x, y, pressed = joy.read()
print('X=%d Y=%d B=%d' % (x, y, 1 if pressed else 0))
```

## Gotchas
- The rest position is rarely exactly 128: read the centre at start-up and use a dead band.
- It is a Grove-style socket, not header pins: use a Grove-to-jumper cable on a breadboard.
- Do not confuse it with Unit Joystick2 or the Faces joystick panel: the protocols differ.

## Datasheet
ATmega328P: https://ww1.microchip.com/downloads/en/DeviceDoc/ATmega48A-PA-88A-PA-168A-PA-328-P-DS-DS40002061A.pdf
Product page and protocol: https://docs.m5stack.com/en/unit/joystick. Product sheet: https://mm.digikey.com/Volume0/opasdata/d220001/medias/docus/478/U024_Web.pdf
