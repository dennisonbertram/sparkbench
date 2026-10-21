---
name: part-sparkfun-qwiic-button
description: Pinout, electrical limits, wiring and MicroPython driver for the SparkFun Qwiic Button with red LED (BOB-15932, ATtiny84 I2C button with built-in LED). Use when designing, wiring, simulating or writing code for a Qwiic Button in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# SparkFun Qwiic Button - Red LED (BOB-15932)

## Overview
A 12 mm tactile push button with a red LED inside, on a 1" x 1" Qwiic board. An **ATtiny84** running SparkFun's firmware debounces the button and exposes it as an I2C register map: pressed / clicked status, time-stamped press and click queues, an active-low INT output, and LED brightness / pulsing. No soldering needed with Qwiic cables; a 0.1" header row is also broken out.

## Pinout (0.1" header, left to right as printed: INT, SCL, SDA, 3.3V, GND)
| Pin | Function |
|---|---|
| INT | Interrupt output, active low, 10 kΩ pull-up to 3.3 V on the board (optional) |
| SCL | I2C clock (2.2 kΩ pull-up on the board) |
| SDA | I2C data (2.2 kΩ pull-up on the board) |
| 3.3V | Supply, 3.3 V |
| GND | Ground |

The two Qwiic (JST-SH) connectors carry GND, 3.3V, SDA, SCL.

## Electrical limits
- Supply: 3.3 V (no regulator; the ATtiny84 needs ≥ 2.7 V at its clock; the Qwiic system is 3.3 V). Do not feed 5 V: the pull-ups would put 5 V on your SDA/SCL.
- Current: a few mA, up to roughly 15 mA with the LED at full brightness.
- I2C 100/400 kHz.

## Interface details
- **I2C address 0x6F** (all jumpers open). Closing jumpers A0-A3 pulls that address bit low: address = 0b0110 A3 A2 A1 A0 (0x60-0x6F). The address can also be set in software (register 0x1F, kept in EEPROM).
- Read: write the register number, then read. 16/32-bit registers are **little-endian**.
- Registers: 0x00 ID = **0x5D**; 0x01/0x02 firmware minor/major; **0x03 status** (bit 0 eventAvailable, bit 1 hasBeenClicked, bit 2 isPressed); 0x04 interrupt enable (bit 0 clicked, bit 1 pressed); 0x05-0x06 debounce ms (default 10); 0x07 pressed-queue status (bit 0 pop request, bit 1 empty, bit 2 full); 0x08 / 0x0C ms since newest / oldest press; 0x10, 0x11, 0x15 the same for clicks; **0x19 LED brightness 0-255**; 0x1A pulse granularity; 0x1B-0x1C pulse cycle ms (0 = steady); 0x1D-0x1E pulse off time ms; 0x1F I2C address.

## Wiring
- ESP32: 3.3V → 3V3, GND → GND, SDA → D21, SCL → D22 (INT → any input pin if used).
- Pico: 3.3V → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: 3.3V → pin 1, GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from qwiic_button import QwiicButton
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
btn = QwiicButton(i2c)          # checks ID 0x5D
if btn.is_pressed():
    btn.led_on(255)
else:
    btn.led_off()
btn.led_config(200, cycle_ms=1000, off_ms=500)   # pulse the LED
```
`has_been_clicked()`, `available()` and `clear_events()` handle press-and-release events; `pop_pressed_queue()` / `pop_clicked_queue()` return how many ms ago each event happened.

## Gotchas
- Clear hasBeenClicked / eventAvailable yourself (`clear_events()`); they stay set until you do.
- Many Qwiic boards on one bus all add 2.2 kΩ pull-ups; cut the I2C jumper on some if the bus gets too strong.
- Closed address jumpers override a software-set address.
- In the Sparkbench simulator only the live "pressed" bit follows the button; the click/event latches and queues are not simulated.

## Datasheet
https://cdn.sparkfun.com/assets/learn_tutorials/1/1/0/8/Qwiic_Button_I2C_Register_Map.pdf (register map), schematic https://cdn.sparkfun.com/assets/8/b/a/2/f/Qwiic_Button.pdf
