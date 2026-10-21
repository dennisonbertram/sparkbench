---
name: part-hc-06
description: Pinout, electrical limits, wiring, AT commands and MicroPython driver for the HC-06 Bluetooth serial (SPP) slave module on the common 4-pin backplate (VCC, GND, TXD, RXD). Use when designing, wiring, simulating or writing code for an HC-06 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# HC-06 Bluetooth serial module, slave (HC-06)

## Overview
The **HC-06** is a Classic Bluetooth 2.0 serial-port (SPP) module (CSR BC417, linvor firmware; newer units hc01.com firmware). It is **slave only**: a phone or PC pairs with it (name `linvor` or `HC-06`, PIN `1234`) and whatever the phone sends comes out of the module's TXD; whatever you write to RXD goes to the phone. Hobbyists buy it on the blue **4-pin backplate** (JY-MCU style) with a 3.3 V regulator and a status LED, no button.

## Pinout (4-pin backplate, header order)
| Pin | Function |
|---|---|
| VCC | Supply 3.6–6 V (into the board's 3.3 V regulator) |
| GND | Ground |
| TXD | Module UART output, 3.3 V |
| RXD | Module UART input, **3.3 V logic only** |

Some 6-pin versions add KEY and STATE at the ends; on the HC-06 they are usually not connected.

## Electrical limits
- Supply: 3.6–6 V on VCC; feed it 5 V. The bare module itself runs at 3.1–4.2 V (datasheet), the backplate regulates.
- Logic: 3.3 V. Never drive RXD with 5 V; use a 1k/2k divider from a 5 V Arduino. TXD (3.3 V) reads fine on 5 V inputs.
- Current: 30–40 mA while pairing, about 8 mA while connected.

## Interface details
- UART 8N1, factory 9600 baud (AT+BAUDn changes it permanently: 1=1200 2=2400 3=4800 4=9600 5=19200 6=38400 7=57600 8=115200).
- **AT mode = not connected.** Before a phone connects (LED blinking) the module answers AT commands at its data baud. Once connected (LED steady) all bytes pass through and AT commands are not answered.
- Commands are **capitals with no `\r\n`**. The module ends a command by the pause after it, so send at most one per second.
- Replies have no line ending: `AT` → `OK`; `AT+VERSION` → `OKlinvorV1.8` (datasheet: `LinvorV1.n`); `AT+NAMEmybot` → `OKsetname`; `AT+PIN4321` → `OKsetPIN`; `AT+BAUD4` → `OK9600`; V1.5+: `AT+PN`/`AT+PO`/`AT+PE` parity. Name and PIN cannot be read back.

## Wiring
- ESP32: VCC → VIN (5 V), GND → GND, TXD → RX2 (GPIO16), RXD → TX2 (GPIO17).
- Pico: VCC → VBUS (5 V), GND → GND, TXD → GP1 (UART0 RX), RXD → GP0 (UART0 TX).
- Raspberry Pi 4: VCC → pin 2 (5 V), GND → pin 6, TXD → pin 10 (RXD), RXD → pin 8 (TXD).

## Using the driver
```python
from machine import UART, Pin
from hc06 import HC06
u = UART(2, baudrate=9600, tx=Pin(17), rx=Pin(16))
bt = HC06(u)
bt.ping()                 # only while no phone is connected
print(bt.version())       # linvorV1.8
bt.set_name('MyRobot')    # waits the 1 s gap between commands for you
while True:
    line = bt.readline()  # text lines from the phone app
    if line == '1':
        print('LED on')
```

## Gotchas
- No reply to `AT`: a phone is connected, or the baud is wrong (try 9600, then 38400/115200).
- Adding `\r\n` (e.g. Arduino Serial Monitor "Both NL & CR") breaks commands on linvor firmware.
- A new name may only show after the module is powered off for a while; a new PIN only after it fully discharges.
- Simulator: the module answers AT commands with factory settings; the "Phone connected" control makes the simulated phone send the slider's digit plus `\r\n` once a second. The simulator still answers AT while "connected", the real module does not.

## Datasheet
https://www.martyncurrey.com/?wpdmdl=3421 (Guangzhou HC / wavesen HC-06 data sheet V2.2, AT command set in section 9)
