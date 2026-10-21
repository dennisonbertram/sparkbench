---
name: part-adafruit-ano-encoder
description: Pinout, electrical limits, wiring and MicroPython driver for the Adafruit ANO Rotary Navigation Encoder to I2C Stemma QT Adapter (product 5740, or 6310 with the encoder soldered; ATtiny816 running seesaw firmware), a scroll wheel plus five-way directional pad read over I2C. Use when designing, wiring, simulating or writing code for an ANO directional navigation / scroll wheel encoder in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Adafruit ANO Rotary Navigation Encoder to I2C (Adafruit 5740)

## Overview
The ANO encoder (Adafruit 5001) is an iPod-style scroll wheel with a centre SELECT button and four direction buttons (UP, LEFT, DOWN, RIGHT). This adapter board puts an **ATtiny816** running Adafruit's **seesaw** firmware under it. The firmware counts the wheel's pulses as a signed 32-bit position and reads the five buttons, so you only need SDA and SCL. Product 5740 is the bare adapter, and you solder the ANO encoder on yourself. Product 6310 is the same board with the encoder already soldered.

## Pinout (header order, as printed on the board)
| Pin | Function |
|---|---|
| VIN | Supply, 3-5 V. It feeds the ATtiny816 directly, so use your board's logic voltage (3.3 V on ESP32 / Pico) |
| GND | Ground |
| SCL | I2C clock (10 k pull-up to VIN on board) |
| SDA | I2C data (10 k pull-up to VIN on board) |
| INT | Interrupt output, pulses low on rotation or a button press once enabled in seesaw (optional) |
| UPDI | Programming pin of the ATtiny816 (leave unconnected) |

The board also has two STEMMA QT / Qwiic sockets.

## Electrical limits
- Supply: 3-5 V on VIN. **There is no regulator or level shifter.** The ATtiny816 (rated 1.8-5.5 V) runs from VIN, and the SDA/SCL pull-ups go to VIN. With a 3.3 V board such as an ESP32 or Pico, power it from 3V3 so that the bus never rises above 3.3 V.
- Current: a few mA, plus about 2 mA for the green power LED.

## Interface details
- **I2C address 0x49** by default. Cutting the A0/A1/A2/A3 jumpers adds 1/2/4/8, giving 0x49-0x58 (16 boards on one bus).
- The seesaw protocol: write `[module base, function register]` with any data after it. To read, write the two bytes, wait about 8 ms, then read. Values are big-endian.
- STATUS base 0x00: HW_ID 0x01 reads **0x86** (ATtiny816). VERSION 0x02 returns 4 bytes, and its upper 16 bits are the product number **5740**. SWRST 0x7F: write 0xFF, then wait about 500 ms.
- ENCODER base 0x11: POSITION 0x30 is the signed 32-bit wheel position (you can also write it to set the position). DELTA 0x40 is the change since its last read, and reading it clears it.
- Buttons are seesaw GPIO pins **SELECT 1, UP 2, LEFT 3, DOWN 4, RIGHT 5**. Set them as inputs with pull-ups using DIRCLR_BULK (0x01 0x03), PULLENSET (0x01 0x0B) and BULK_SET (0x01 0x05), each with the mask 0x0000003E. Then read GPIO_BULK (0x01 0x04, 4 bytes). A pressed button's bit reads 0.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.
- You can also use a STEMMA QT / Qwiic cable instead of the header.

## Using the driver
```python
from machine import I2C, Pin
from ano_encoder import ANOEncoder
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
ano = ANOEncoder(i2c)            # address 0x49
print(ano.position(), ano.buttons())
```

## Gotchas
- Always leave a short delay between the register write and the read. Reading too quickly returns stale or garbage bytes.
- Do not feed VIN from 5 V when your microcontroller uses 3.3 V logic. The on-board pull-ups would pull SDA/SCL to 5 V.
- Direction: if the wheel counts the wrong way for you, negate the position in your code (Adafruit's examples use it as is).
- In the Sparkbench simulator, the slider sets the POSITION register and one toggle drives each button. DELTA, INT and the address-change command are not modelled.

## Datasheet
- ATtiny816 (the chip): https://www.microchip.com/en-us/product/ATtiny816
- Board guide: https://learn.adafruit.com/adafruit-ano-rotary-navigation-encoder-to-i2c-stemma-qt-adapter
