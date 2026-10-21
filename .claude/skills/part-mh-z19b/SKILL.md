---
name: part-mh-z19b
description: Pinout, electrical limits, wiring and MicroPython driver for the MH-Z19B NDIR CO2 sensor (Winsen MH-Z19B). Use when designing, wiring, simulating or writing code for an MH-Z19B in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MH-Z19B NDIR CO2 sensor (MH-Z19B)

## Overview
The **MH-Z19B** from Winsen is an infrared (NDIR) CO2 sensor with a gold-plated optical chamber. It measures 0–5000 ppm (0–2000 / 10000 ppm versions exist), accurate to ±(50 ppm + 5 % of reading), with built-in temperature compensation. It talks UART at 9600 baud with 3.3 V logic, but **needs a 5 V supply**. Hobbyists buy the **Winsen MH-Z19B terminal version with the 7-pin JST cable** (this part); a pin version with two side headers (Vin, GND, PWM, HD, Rx, Tx, Vo) also exists.

## Pinout (MH-Z19B terminal version, 7-pin connector order, Winsen manual v1.6)
| Pin | Name | Function |
|---|---|---|
| 1 | NC1 | Reserved, leave unconnected |
| 2 | NC2 | Reserved, leave unconnected |
| 3 | GND | Ground |
| 4 | Vin | Supply, 4.5–5.5 V |
| 5 | RXD | UART data input (wire to the microcontroller's TX) |
| 6 | TXD | UART data output (wire to the microcontroller's RX) |
| 7 | NC7 | Reserved, leave unconnected |

Winsen: "All the pins for reserved must be vacant while the sensor is working."

## Electrical limits
- Supply: 4.5–5.5 V DC; supply must deliver at least 150 mA (peak 150 mA, average < 20 mA at 5 V on current units, < 60 mA on older ones).
- UART levels: 3.3 V TTL, 5 V compatible, so it connects straight to an ESP32 or Pico.
- Preheat 3 min; response T90 < 120 s; working −10 to 50 °C, 0–95 % RH.

## Interface details
- UART 9600 baud, 8 data bits, 1 stop bit, no parity. Every frame is 9 bytes.
- Read CO2: send `FF 01 86 00 00 00 00 00 79`; reply `FF 86 HIGH LOW - - - - CS`. CO2 (ppm) = HIGH × 256 + LOW. Datasheet example: reply `FF 86 01 F4 00 00 00 00 85` = 500 ppm.
- Checksum = (0xFF − (byte1 + … + byte7)) + 1, low 8 bits.
- Zero calibration 0x87 (sets 400 ppm, no reply), span calibration 0x88 with span in bytes 3–4 (no reply), auto-baseline (ABC) 0x79 with byte3 0xA0 = on / 0x00 = off (on from the factory).

## Wiring
- ESP32: Vin → 5V (VIN/USB), GND → GND, RXD → GPIO17 (UART2 TX), TXD → GPIO16 (UART2 RX).
- Pico: Vin → VBUS (pin 40), GND → GND, RXD → GP4 (UART1 TX), TXD → GP5 (UART1 RX).
- Raspberry Pi 4: Vin → pin 2 (5 V), GND → pin 6, RXD → pin 8 (TXD), TXD → pin 10 (RXD).

## Using the driver
```python
from machine import UART, Pin
from mhz19b import MHZ19B
u = UART(2, baudrate=9600, tx=Pin(17), rx=Pin(16))
print('CO2=%d ppm' % MHZ19B(u).read_co2())
```

## Gotchas
- TX and RX cross over: microcontroller TX → sensor RXD, microcontroller RX ← sensor TXD.
- Do not power it from 3.3 V: readings go low or stop.
- Readings are meaningless for the first 3 minutes after power-up.
- ABC recalibrates the lowest reading of each 24 h to 400 ppm; turn it off (`set_abc(False)`) in greenhouses or rooms that never get fresh air.
- Only zero-calibrate after at least 20 minutes in outdoor-fresh (400 ppm) air.
- Do not press on the gold chamber.

## Datasheet
https://www.winsen-sensor.com/d/files/infrared-gas-sensor/ndir-co2-sensor/mh-z19b-co2-manual(ver1_6).pdf
