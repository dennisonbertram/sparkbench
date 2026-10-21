---
name: part-rdm6300
description: Pinout, electrical limits, wiring and MicroPython driver for the RDM6300 125 kHz EM4100 RFID reader module (UART, 9600 baud). Use when designing, wiring, simulating or writing code for an RDM6300 / RDM630 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# RDM6300 125 kHz RFID reader (RDM6300)

## Overview
The **RDM6300** reads 125 kHz read-only (EM4100-type) cards and key fobs. While a tag is near its coil it sends the tag's ID over a 9600-baud TTL UART. Hobbyists buy the **RDM6300 125KHz EM4100 RFID reader module** (38.5 x 19 mm) with a separate coil antenna that plugs into P2. It has three headers on different edges, so it is wired with jumper leads.

## Pinout (header by header, as printed P1 / P2 / P3)
| Pin | Function |
|---|---|
| TX (P1-1) | UART data out, 9600 8N1, 5 V TTL level |
| RX (P1-2) | UART data in, no documented commands (leave open) |
| NC (P1-3) | Not connected |
| GND (P1-4) | Ground |
| +5V (P1-5) | Supply, 5 V +/-5 % |
| ANT1, ANT2 (P2) | Antenna coil |
| LED (P3-1) | Read indicator LED output (optional) |
| +5V2 (P3-2) | +5 V for the LED |
| GND2 (P3-3) | Ground |

## Electrical limits
- Supply: 5 V DC +/-5 % (4.75-5.25 V), under 50 mA. Do not run it from 3.3 V.
- TX swings to the 5 V supply: use a divider (1 kOhm series, 2 kOhm to GND) into a 3.3 V GPIO.
- Read range about 5 cm, depending on the tag. Working temperature -10 to +70 C.

## Interface details
- UART 9600 bps, 8N1, output only.
- Frame (14 bytes): `0x02`, 10 ASCII hex characters, 2 ASCII hex checksum characters, `0x03`.
- The 10 characters are 5 bytes: 1 version/customer byte + the 4-byte card number.
- Checksum = XOR of the 5 data bytes. Datasheet example: tag `62E3086CED` -> 62^E3^08^6C^ED = `08`.
- The frame repeats while the tag stays in the field.

## Wiring
- ESP32: +5V -> VIN (5 V), GND -> GND, TX -> divider -> GPIO16 (UART2 RX).
- Pico: +5V -> VBUS, GND -> GND, TX -> divider -> GP1 (UART0 RX).
- Raspberry Pi 4: +5V -> pin 2, GND -> pin 6, TX -> divider -> pin 10 (GPIO15 RXD).

## Using the driver
```python
from machine import UART, Pin
from rdm6300 import RDM6300
u = UART(2, baudrate=9600, rx=Pin(16))
reader = RDM6300(u)
tag, card = reader.wait()
print('TAG=%s CARD=%d' % (tag, card))
```
`read()` returns `(tag_hex, card_number)` or `None`; `card_number` is the last 4 bytes as a decimal, the number often printed on the card.

## Gotchas
- 125 kHz only: it cannot read 13.56 MHz MIFARE / NFC cards.
- Metal near the coil (or the coil unplugged) kills the range.
- Expect the same tag many times while it is held near the coil; de-duplicate in your code.
- Ignore frames with a bad checksum (noise or a tag moving out of range).

## Datasheet
https://files.seeedstudio.com/wiki/125Khz_RFID_module-UART/res/RDM630-Spec.pdf
