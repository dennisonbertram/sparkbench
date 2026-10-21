---
name: part-hc-05
description: Pinout, electrical limits, wiring, AT commands and MicroPython driver for the HC-05 Bluetooth serial (SPP) module on the ZS-040 6-pin breakout. Use when designing, wiring, simulating or writing code for an HC-05 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# HC-05 Bluetooth serial module (HC-05)

## Overview
The **HC-05** is a Classic Bluetooth 2.0+EDR serial-port (SPP) module built on the CSR BC417. A phone or PC pairs with it (PIN 1234) and whatever it sends comes out of the module's UART, and back. It can be a slave (default) or a master. Hobbyists buy it on the blue **ZS-040 breakout**: a 3.3 V regulator, a status LED, an AT-mode push button and a 6-pin header.

## Pinout (ZS-040 breakout, header order, components side up)
| Pin | Function |
|---|---|
| STATE | Connection status output: high while a Bluetooth link is up (3.3 V) |
| RXD | Module UART input, **3.3 V logic only** |
| TXD | Module UART output, 3.3 V |
| GND | Ground |
| VCC | Supply 3.6–6 V (into the board's 3.3 V regulator) |
| EN | EN/KEY: high at power-up = full AT command mode (same as holding the button) |

## Electrical limits
- Supply: 3.6–6 V on VCC (silkscreen "Power: 3.6V–6V"); the 3.3 V rail is too low, use 5 V.
- Logic: 3.3 V ("Level: 3.3V"). Never drive RXD with 5 V; use a 1k/2k divider from a 5 V Arduino.
- Current: up to about 40 mA while pairing/transmitting.

## Interface details
- UART 8N1. Data mode: the configured baud (AT+UART?; 38400 in the datasheet, often 9600 on ZS-040 boards).
- **Full AT mode**: hold the button (or EN high) while powering up; the LED blinks slowly and the module answers at **38400 baud** regardless of the data baud.
- Commands end with `\r\n`. Replies: optional `+CMD:<param>` lines, then `OK`, or `FAIL` / `ERROR:(code)`.
- Useful commands: `AT` → `OK`; `AT+VERSION?` → `+VERSION:2.0-20100601`; `AT+NAME?` / `AT+NAME=<name>`; `AT+ROLE?` (0 slave, 1 master, 2 slave-loop); `AT+UART?` / `AT+UART=9600,0,0`; `AT+PSWD?`; `AT+ADCN?` (paired-device count); `AT+STATE?`; `AT+ORGL` (factory reset); `AT+RESET`.
- In data mode AT commands are not answered: they are sent over the Bluetooth link.

## Wiring
- ESP32: VCC → VIN (5 V), GND → GND, TXD → RX2 (GPIO16), RXD → TX2 (GPIO17), STATE optional to any input.
- Pico: VCC → VBUS (5 V), GND → GND, TXD → GP1 (UART0 RX), RXD → GP0 (UART0 TX).
- Raspberry Pi 4: VCC → pin 2 (5 V), GND → pin 6, TXD → pin 10 (RXD), RXD → pin 8 (TXD).

## Using the driver
```python
from machine import UART, Pin
from hc05 import HC05
u = UART(2, baudrate=38400, tx=Pin(17), rx=Pin(16))  # AT mode
bt = HC05(u)
bt.ping()
print(bt.version(), bt.name(), bt.paired_count())
bt.command('AT+NAME=MyRobot')
```
In data mode just use `u.write()` / `u.read()` at the data baud.

## Gotchas
- No reply to `AT`: the module is in data mode (fast-blinking LED). Power it up with the button held.
- Garbage characters: wrong baud. AT mode is 38400; data mode is whatever `AT+UART?` says.
- Some firmware wants commands without `?` or answers with slightly different text; the driver accepts any `+X:` line.
- Simulator: the simulated module is always in AT mode with factory settings; only `AT+ADCN?` follows the slider.

## Datasheet
https://components101.com/sites/default/files/component_datasheet/HC-05%20Datasheet.pdf
