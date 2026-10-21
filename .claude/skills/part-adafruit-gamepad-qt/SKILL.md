---
name: part-adafruit-gamepad-qt
description: Pinout, electrical limits, wiring and MicroPython driver for the Adafruit Mini I2C STEMMA QT Gamepad (product 5743, ATtiny816 running seesaw firmware: 2-axis thumbstick + A/B/X/Y/Select/Start buttons). Use when designing, wiring, simulating or writing code for the Gamepad QT in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Adafruit Gamepad QT (Adafruit 5743)

## Overview
A small game controller read over I2C. An **ATtiny816** running Adafruit's **seesaw** firmware reads a 2-axis analog thumbstick with its 10-bit ADC and six buttons (A, B, X, Y, Select, Start), so you only need SDA and SCL. It has one STEMMA QT / Qwiic socket, a 6-pin 0.1" header (shipped loose), a green power LED and a red IRQ LED.

## Pinout (header order, as printed on the back)
| Pin | Function |
|---|---|
| UPDI | ATtiny816 programming pin (leave unconnected) |
| IRQ | Interrupt output, active low (optional; must be enabled in seesaw) |
| SDA | I2C data (10 k pull-up to VIN on board) |
| SCL | I2C clock (10 k pull-up to VIN on board) |
| GND | Ground |
| VIN | Supply, 3-5 V |

Seen from the front (buttons up) the same header reads VIN, GND, SCL, SDA, IRQ, UPDI from left to right.

## Electrical limits
- Supply: 3-5 V on VIN (the ATtiny816 itself is rated 1.8-5.5 V). There is no regulator or level shifter: the chip and the SDA/SCL pull-ups run straight from VIN. **Power it from 3.3 V** on an ESP32, Pico or Raspberry Pi so the I2C lines never see 5 V.
- Current: a few mA (plus the LEDs).

## Interface details
- **I2C address 0x50** by default. Cutting A0/A1 on the back adds 1/2, giving 0x51-0x53.
- seesaw protocol: write `[module base, function register]` plus any data. To read, write the two bytes, wait about 8 ms, then read. Values are big-endian.
- STATUS base 0x00: HW_ID 0x01 reads **0x86** (ATtiny816). SWRST 0x7F: write 0xFF, then wait about 500 ms.
- Buttons are seesaw GPIO pins **A=5, B=1, X=6, Y=2, Select=0, Start=16**. Set them as inputs with pull-ups using DIRCLR_BULK (0x01 0x03), PULLENSET (0x01 0x0B) and BULK_SET (0x01 0x05), each with the pin mask. Then read GPIO_BULK (0x01 0x04, 4 bytes). A held button reads **0**.
- Joystick: ADC base 0x09. On ATtiny seesaw the channel register is 0x07 + pin number: **0x15 = X (pin 14)** and **0x16 = Y (pin 15)**. Each returns 2 bytes, 0-1023, about 512 at rest. The raw count falls as you push right/up, so Adafruit's example (and `joystick()` here) reports `1023 - raw`.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.
- Or simply use a STEMMA QT / Qwiic cable.

## Using the driver
```python
from machine import I2C, Pin
from seesaw_gamepad import GamepadQT
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
pad = GamepadQT(i2c)              # address 0x50
print(pad.joystick(), pad.buttons())   # (512, 511) {'A'}
```

## Gotchas
- Always leave the short delay between the register write and the read. Reading too quickly returns stale or garbage bytes.
- The stick does not centre at exactly 512, and it has some jitter. Use a dead zone (Adafruit's example ignores changes of 3 or less).
- In the Sparkbench simulator, the sliders set the raw ADC counts that the chip returns, before the `1023 - raw` flip. The IRQ output is not modelled.
- Using several pads on one bus: give each one its own address with the A0/A1 jumpers.

## Datasheet
- ATtiny816 (the chip): https://ww1.microchip.com/downloads/aemDocuments/documents/MCU08/ProductDocuments/DataSheets/ATtiny416-816-DataSheet-DS40001913C.pdf
- Board guide: https://learn.adafruit.com/gamepad-qt
