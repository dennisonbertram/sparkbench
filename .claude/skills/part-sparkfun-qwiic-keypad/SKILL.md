---
name: part-sparkfun-qwiic-keypad
description: Pinout, electrical limits, wiring and MicroPython driver for the SparkFun Qwiic Keypad - 12 Button (COM-15290, ATtiny84 I2C telephone keypad with key FIFO). Use when designing, wiring, simulating or writing code for a Qwiic Keypad in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# SparkFun Qwiic Keypad - 12 Button (COM-15290)

## Overview
A 12-key telephone-layout keypad (1-9, *, 0, #) on a Qwiic board. An **ATtiny84** running SparkFun's Qwiic_KeyPad firmware scans the 4x3 matrix and stores each key press, with the time it happened, in a **FIFO** (a ring of 15 slots; when full the oldest press is overwritten). Your board pops presses one at a time over I2C, so it does not have to poll fast or spend 7 GPIOs.

## Pinout (0.1" header, left to right as printed: RST, INT, SCL, SDA, 3.3V, GND)
| Pin | Function |
|---|---|
| RST | ATtiny84 reset, active low, 4.7 kΩ pull-up on the board (leave unconnected) |
| INT | Active-low interrupt: low while presses wait in the FIFO, 4.7 kΩ pull-up (optional) |
| SCL | I2C clock (2.2 kΩ pull-up on the board) |
| SDA | I2C data (2.2 kΩ pull-up on the board) |
| 3.3V | Supply, 3.3 V |
| GND | Ground |

The two Qwiic (JST-SH) connectors carry GND, 3.3V, SDA, SCL.

## Electrical limits
- Supply: 3.3 V (no regulator; the Qwiic system is 3.3 V). Do not feed 5 V: the pull-ups would put 5 V on your SDA/SCL.
- Current: under 4 mA (including the power LED).
- I2C 100/400 kHz.

## Interface details
- **I2C address 0x4B**; closing the ADR jumper forces **0x4A**; writing register 0x07 stores a new address (0x08-0x77) in EEPROM.
- Read: write the register number, then read; the firmware returns the map from that register onward.
- Registers: 0x00 ID (always **0x4B**); 0x01/0x02 firmware major/minor; **0x03 oldest key as ASCII** ('0'-'9', '*', '#', 0 = none); 0x04-0x05 ms since that press (MSB first, 16-bit); **0x06 bit 0 = load next FIFO entry**; 0x07 I2C address.
- Popping a key: write `0x06 0x01`, then read 0x03 (and 0x04-0x05). The firmware loads the next entry *during that read request* and clears bit 0.

## Wiring
- ESP32: 3.3V → 3V3, GND → GND, SDA → D21, SCL → D22 (INT → any input pin if used).
- Pico: 3.3V → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: 3.3V → pin 1, GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from qwiic_keypad import QwiicKeypad
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
kp = QwiicKeypad(i2c)           # checks ID 0x4B
e = kp.read_event()             # ('5', 230) = key 5 pressed 230 ms ago, or None
key = kp.get_key()              # just the character, or None
```
Call `read_event()` in a loop until it returns None to drain every waiting press.

## Gotchas
- Reading 0x03 without first writing 0x06 = 0x01 returns the same key again; always request the update first.
- Keys come back as ASCII characters, not numbers 0-11.
- The time field is 16-bit, so it wraps after about 65 s.
- Many Qwiic boards on one bus all add 2.2 kΩ pull-ups; cut the I2C jumper on some if needed.
- In the Sparkbench simulator the key slider records one press each time it moves to a key.

## Datasheet
Register map: https://learn.sparkfun.com/tutorials/qwiic-keypad-hookup-guide/all and firmware https://github.com/sparkfun/Qwiic_Keypad ; ATtiny84: https://ww1.microchip.com/downloads/en/DeviceDoc/Atmel-7701_Automotive-Microcontrollers-ATtiny24-44-84_Datasheet.pdf
