---
name: part-rc522
description: Pinout, electrical limits, wiring and MicroPython driver for the RC522 13.56 MHz RFID reader module (NXP MFRC522, SPI, 8-pin). Use when designing, wiring, simulating or writing code for an RC522 / MFRC522 card reader in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# RC522 RFID reader (MFRC522)

## Overview
The **NXP MFRC522** is a 13.56 MHz reader/writer for ISO/IEC 14443-A cards and tags (MIFARE Classic 1K, Ultralight, NTAG). Hobbyists buy it as the **blue RC522 module** with a printed antenna, an 8-pin header, a white MIFARE Classic card and a key fob. It reads a card's UID from about 0–3 cm. This driver uses SPI.

## Pinout (generic RC522 module, header order)
| Pin | Function |
|---|---|
| SDA | SPI chip select (NSS), active low |
| SCK | SPI clock (up to 10 MHz) |
| MOSI | SPI data into the reader |
| MISO | SPI data out of the reader |
| IRQ | Interrupt output (optional, not used for polling) |
| GND | Ground |
| RST | NRSTPD: low = hard power-down, high = run |
| 3.3V | Supply, 3.3 V only |

## Electrical limits
- Supply: 2.5–3.6 V (3.3 V typical). The module has **no regulator**: never connect 5 V.
- Current: about 13–26 mA reading (datasheet: antenna driver TVDD up to 100 mA max), ~10 µA in hard power-down.
- SPI mode 0, MSB first, up to 10 MHz.

## Interface details
- Register access: first byte = `(reg << 1) & 0x7E`, bit 7 = 1 to read, 0 to write; then data (datasheet 8.1.2).
- VersionReg 0x37: 0x91 = v1.0, 0x92 = v2.0; clones often read 0x88 or 0x12. 0x00/0xFF = wiring fault.
- Set-up after SoftReset (CommandReg 0x0F, wait for PowerDown bit to clear): TModeReg 0x80, TPrescaler 0xA9, TReload 0x03E8 (25 ms timeout), TxASKReg 0x40 (100 % ASK), ModeReg 0x3D (CRC preset 0x6363), antenna on (TxControlReg |= 0x03).
- Reading a UID (ISO 14443-3 A): REQA 0x26 as a 7-bit frame → ATQA (2 bytes); ANTICOLLISION 93 20 → UID0–3 + BCC (XOR); SELECT 93 70 + UID + BCC + CRC_A → SAK + CRC_A; HLTA 50 00 + CRC_A.
- CRC_A: preset 0x6363, reflected polynomial 0x8408, low byte sent first.

## Wiring
- ESP32: 3.3V → 3V3, GND → GND, SDA → D5, SCK → D18, MOSI → D23, MISO → D19, RST → D25 (any free GPIOs work with SoftSPI).
- Pico: 3.3V → 3V3(OUT), GND → GND, SDA → GP17, SCK → GP18, MOSI → GP19, MISO → GP16, RST → GP20.
- Raspberry Pi 4: 3.3V → pin 1, GND → pin 6, SDA → pin 24 (CE0), SCK → pin 23, MOSI → pin 19, MISO → pin 21, RST → pin 22.

## Using the driver
```python
from machine import Pin, SoftSPI
from mfrc522 import MFRC522
spi = SoftSPI(baudrate=1000000, polarity=0, phase=0, sck=Pin(18), mosi=Pin(23), miso=Pin(19))
reader = MFRC522(spi, cs=Pin(5, Pin.OUT, value=1), rst=Pin(25, Pin.OUT, value=0))
print('version 0x%02X' % reader.version())
uid = reader.read_uid()   # bytes of the 4-byte UID, or None
```
`read_uid()` halts the card after reading it, so one tap is reported once; take the card away and back to read it again.

## Gotchas
- 5 V on the 3.3V pin destroys the module.
- Version reads 0x00 or 0xFF: check SDA (chip select), MISO and that RST is high.
- Cards with 7-byte UIDs (NTAG stickers) need a second cascade level; this driver returns None for them.
- Reading data blocks of a MIFARE Classic card needs Crypto1 authentication with the sector key, which this driver does not do.
- Long jumper wires make SPI flaky; keep them short or lower the baudrate.

## Datasheet
https://www.nxp.com/docs/en/data-sheet/MFRC522.pdf
