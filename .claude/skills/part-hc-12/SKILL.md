---
name: part-hc-12
description: Pinout, electrical limits, wiring, AT commands and MicroPython driver for the HC-12 433 MHz wireless serial module (Si4463 + STM8S003, 5-pin header VCC, GND, RXD, TXD, SET). Use when designing, wiring, simulating or writing code for an HC-12 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# HC-12 433 MHz wireless serial module (HC-12)

## Overview
The **HC-12** is a half-duplex radio "serial cable": bytes written to one module's RXD come out of another module's TXD. It uses a Silicon Labs **Si4463** transceiver (433.4–473.0 MHz, 100 channels of 400 kHz, up to 100 mW / +20 dBm) driven by an STM8S003 MCU. Range is about 1 km line of sight at the slowest air rate. Hobbyists buy it as a small green board with a **5-pin 2.54 mm header** (VCC, GND, RXD, TXD, SET), a spring antenna and an IPEX socket. You need two modules (one on each board).

## Pinout (5-pin header, header order)
| Pin | Function |
|---|---|
| VCC | Supply 3.2–5.5 V (into the module's LDO), at least 200 mA capability |
| GND | Ground |
| RXD | Module UART input, 3.3 V TTL, 1k series, weak pull-up |
| TXD | Module UART output, 3.3 V TTL, 1k series |
| SET | Low = AT command mode (internal 10k pull-up); leave high/floating for radio use |

The other castellated pads (ANT, GND, GND, NC) are on the far edge and are not used on the header.

## Electrical limits
- Supply 3.2–5.5 V. Transmit current up to 100 mA (idle: FU3 16 mA, FU1 3.6 mA, FU2 80 uA, sleep 22 uA). Datasheet: above 4.5 V with long transmit duty, add a 1N4007 in series to keep the LDO cool.
- Logic is 3.3 V TTL. From a 5 V board, divide the signal into RXD (1k/2k). TXD is 3.3 V and reads fine on 5 V inputs.
- Always fit an antenna before transmitting.

## Interface details
- UART, factory **9600 8N1**, channel **001 (433.4 MHz)**, mode **FU3**, power **+20 dBm**. Both ends must share channel, baud and FU mode.
- FU3 air rate follows the UART baud: 1200/2400 → 5 kbps (−117 dBm, longest range), 4800/9600 → 15 kbps, 19200/38400 → 58 kbps, 57600/115200 → 236 kbps. FU1: 3.6 mA idle, 250 kbps air. FU2: 80 uA idle, 1200–4800 baud only, ≥1 s between packets.
- **AT mode**: pull SET low, wait **40 ms**, then send commands with no line ending (replies end with `\r\n`). Release SET and wait **80 ms** before sending data. After leaving AT mode the module resets: wait **200 ms** before entering it again. Holding SET low at power-up forces AT mode at 9600 8N1 (recovery if you forgot the baud).
- Commands: `AT`→`OK`; `AT+B9600`→`OK+B9600`; `AT+C021`→`OK+C021` (channel 1–127); `AT+FU1..4`; `AT+P1..8` (−1, 2, 5, 8, 11, 14, 17, 20 dBm); `AT+RB/RC/RF/RP` read one setting (`OK+B9600`, `OK+RC001`, `OK+FU3`, `OK+RP:+20dBm`); `AT+RX` all four; `AT+V`→`www.hc01.com HC-12_V2.4`; `AT+DEFAULT`; `AT+SLEEP`. Settings take effect when you leave AT mode and survive power-off.

## Wiring
- ESP32: VCC → 3V3 (or 5 V), GND → GND, TXD → GPIO16 (RX2), RXD → GPIO17 (TX2), SET → GPIO4.
- Pico: VCC → 3V3(OUT) or VBUS, GND → GND, TXD → GP1 (UART0 RX), RXD → GP0 (UART0 TX), SET → GP2.
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, TXD → pin 10 (RXD), RXD → pin 8 (TXD), SET → GPIO17 (pin 11).

## Using the driver
```python
from machine import UART, Pin
from hc12 import HC12
u = UART(2, baudrate=9600, tx=Pin(17), rx=Pin(16))
radio = HC12(u, Pin(4, Pin.OUT, value=1))
radio.ping()                  # pulls SET low and waits 40 ms for you
print(radio.channel(), radio.baud(), radio.power_dbm())
radio.set_channel(21)         # 441.4 MHz; set the other module the same
radio.exit_at()               # SET high, 80 ms, new settings active
radio.write(b'hello\r\n')     # goes over the air
line = radio.readline()       # text lines from the other HC-12, or None
```

## Gotchas
- Nothing arrives: channel, baud or FU mode differ between the two modules, or one is still in AT mode (SET low).
- Garbled AT replies: AT mode uses the module's current baud; hold SET low at power-up to force 9600.
- Neighbouring links need channels at least five apart; very close modules (under 10 m) can also need that spacing.
- The module resets on supply dips while transmitting: add a bulk capacitor and use a supply good for 200 mA.
- Simulator: the module answers the query commands with factory settings regardless of the SET pin (the real one only answers while SET is low; otherwise it would transmit the text). The "Other HC-12 transmitting" control makes the remote module send the slider's digit plus `\r\n` once a second.

## Datasheet
https://statics3.seeedstudio.com/assets/file/bazaar/product/HC-12_english_datasheets.pdf (HC-12 V2.4 user manual; pin table, AT commands, SET timing)
