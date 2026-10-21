---
name: part-adafruit-led-arcade-button-1x4
description: Pinout, electrical limits, wiring and MicroPython driver for the Adafruit LED Arcade Button 1x4 STEMMA QT I2C breakout (product 5296), which reads four arcade buttons and PWM-dims their LEDs over I2C with an ATtiny817 running seesaw firmware. Use when designing, wiring, simulating or writing code for this arcade button board in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Adafruit LED Arcade Button 1x4 STEMMA QT (Adafruit 5296)

## Overview
A 3" x 0.8" board with eight 2-pin JST XH sockets: four for arcade button switches (SWITCH1, SW #2, SW #3, SWITCH4) and four for the buttons' built-in LEDs (LED1-LED4). An **ATtiny817** running Adafruit's **seesaw** firmware reads the switches and PWM-dims the LEDs, so the whole board needs only SDA and SCL. Each LED is switched low-side by a BSS138 MOSFET from an on-board AP3602 5 V charge pump, so 5 V button LEDs light fully even from a 3.3 V supply. Two STEMMA QT / Qwiic sockets. Buttons and JST XH cables are sold separately.

## Pinout (header order, as printed on the board)
Two identical 6-pad rows sit in the middle of the board (one on each long edge), so it is wired with jumper leads to one row or with a STEMMA QT cable. Seen from the top, from pin 1:

| Pin | Function |
|---|---|
| VIN | Supply, 3-5 V; powers the ATtiny817, the I2C pull-ups and the 5 V LED charge pump |
| GND | Ground |
| SCL | I2C clock, 10 k pull-up to VIN |
| SDA | I2C data, 10 k pull-up to VIN |
| INT | seesaw interrupt output (ATtiny pin PB2), goes low on a button change when enabled |
| UPDI | ATtiny817 programming pin; leave unconnected |

## Electrical limits
- Supply: 3-5 V on VIN. There is no regulator: the ATtiny817 and the 10 k SDA/SCL pull-ups run straight from VIN, so power VIN from your board's logic voltage (3V3 for ESP32/Pico/Pi). INT also swings to VIN.
- Current: a few mA for the ATtiny; the LEDs run from a 5 V charge pump, which draws roughly twice the LED current from VIN (about 10-20 mA per lit arcade LED at 5 V).
- The LED sockets are low-side switched (BSS138); use the LEDs in Adafruit arcade buttons, which have their resistor built in.

## Interface details
- **I2C address 0x3A** by default. Cutting A0/A1/A2/A3 on the back adds 1/2/4/8 (0x3A-0x49, up to 16 boards).
- seesaw protocol: write `[module base, function register]` plus any data. To read, write the two bytes, wait (8 ms, as Adafruit's libraries do), then read. Big-endian.
- STATUS base 0x00: HW_ID 0x01 reads **0x87** (ATtiny817). SWRST 0x7F: write 0xFF, then wait about 500 ms.
- Buttons: SWITCH1-SWITCH4 are seesaw pins **18, 19, 20, 2**. Set them input with pull-up: DIRCLR_BULK (0x01 0x03), PULLENSET (0x01 0x0B), BULK_SET (0x01 0x05), mask 0x001C0004. Read GPIO_BULK (0x01 0x04, 4 bytes); a bit reads 0 while its button is pressed. INTENSET (0x01 0x08) with the same mask enables INT.
- LEDs: LED1-LED4 are seesaw pins **12, 13, 0, 1**. Write TIMER base 0x08, PWM 0x01, then pin, duty high byte, duty low byte (16-bit value, 0 = off, 65535 = full on; the firmware uses 8-bit PWM internally).

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.
- Or use a STEMMA QT / Qwiic cable.
- Each arcade button: switch leads into SWITCHn, LED leads into LEDn (the LED socket's + pad is the 5 V side).

## Using the driver
```python
from machine import I2C, Pin
from arcade_qt import ArcadeQT
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
arc = ArcadeQT(i2c)               # address 0x3A
print(arc.buttons())              # [1, 2, 3, 4] True = pressed
arc.led(0, 65535)                 # button 1 LED full on
arc.led(1, 8000)                  # button 2 LED dim
```

## Gotchas
- Button order is 1, 2, 3, 4 = seesaw pins 18, 19, 20, 2 (not consecutive); LEDs are 12, 13, 0, 1.
- Always wait a few ms between the register write and the read, or you get stale bytes.
- An LED whose button has no LED, or is plugged in reversed, simply stays dark.
- In the Sparkbench simulator the four buttons are toggles; LED PWM writes are accepted but not shown.

## Datasheet
- ATtiny817 (the chip): https://cdn-learn.adafruit.com/assets/assets/000/105/460/original/ATtiny417-814-816-817-DataSheet-DS40002288A.pdf
- Board guide: https://learn.adafruit.com/adafruit-led-arcade-button-qt
