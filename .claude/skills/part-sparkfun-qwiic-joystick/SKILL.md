---
name: part-sparkfun-qwiic-joystick
description: Pinout, electrical limits, wiring and MicroPython driver for the SparkFun Qwiic Joystick (COM-15168, ATtiny85 I2C thumb joystick with push button, address 0x20). Use when designing, wiring, simulating or writing code for a Qwiic Joystick in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# SparkFun Qwiic Joystick (COM-15168)

## Overview
The **SparkFun Qwiic Joystick** is an analog 2-axis thumb joystick (two 10 kΩ pots plus a push switch) with an **ATtiny85** running SparkFun's firmware. The ATtiny85 reads each axis with its 10-bit ADC (0–1023, roughly 512 at rest) and the button, and serves them as I2C registers at **0x20**. Connect it with a Qwiic cable or through the 4-pin 0.1" header.

## Pinout (0.1" header, as printed on the board)
| Pin | Function |
|---|---|
| GND | Ground |
| 3V3 | Supply, 3.3 V |
| SDA | I2C data (2.2 kΩ pull-up on board) |
| SCL | I2C clock (2.2 kΩ pull-up on board) |

The two Qwiic connectors carry the same four signals.

## Electrical limits
- Supply: 3.3 V (Qwiic). The ATtiny85 runs from 2.7–5.5 V at 8 MHz, but the I2C pull-ups go to this supply, so use 3.3 V with an ESP32, Pico or Raspberry Pi.
- Current: a few mA (ATtiny85, power LED, two 10 kΩ pots).
- The I2C pull-up jumper can be cut when many boards share the bus.

## Interface details
- **I2C address 0x20** by default; stored in EEPROM and changeable to 0x08–0x77 (write 0x13 to 0x09, then the new address to 0x0A).
- Register map: 0x00 ID (current address), 0x01/0x02 firmware version (2.6), 0x03/0x04 X MSB/LSB, 0x05/0x06 Y MSB/LSB, 0x07 button state, 0x08 button clicked, 0x09 lock, 0x0A address.
- Each axis = 10-bit ADC reading shifted left 6: `value = ((MSB << 8) | LSB) >> 6`.
- 0x07 reads **1 released, 0 pressed**. 0x08 latches 1 after a press; write 0 to clear it.
- The firmware streams the map from the register you ask for, so read 5 bytes from 0x03 to get X, Y and the button from one ADC update.
- Pushing left raises X; pushing up raises Y (SparkFun's example).

## Wiring
- ESP32: 3V3 → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: 3V3 → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: 3V3 → pin 1, GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from qwiic_joystick import QwiicJoystick
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
joy = QwiicJoystick(i2c)
x, y, pressed = joy.read()
print('X=%d Y=%d B=%d' % (x, y, 1 if pressed else 0))
```

## Gotchas
- The rest position is rarely exactly 512: read the centre at start-up and use a dead band (for example 450–575).
- The very first reading after power-up can be 1023; discard it.
- Wait about 30 ms after each register write (the firmware may write EEPROM).
- In the Sparkbench simulator the "clicked" latch (0x08) stays 0; use the button state in 0x07.

## Datasheet
https://ww1.microchip.com/downloads/en/DeviceDoc/Atmel-2586-AVR-8-bit-Microcontroller-ATtiny25-ATtiny45-ATtiny85_Datasheet.pdf
Firmware and register map: https://github.com/sparkfun/Qwiic_Joystick
