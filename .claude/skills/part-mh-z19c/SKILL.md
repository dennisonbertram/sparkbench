---
name: part-mh-z19c
description: Pinout, electrical limits, wiring and MicroPython driver for the MH-Z19C NDIR CO2 sensor (Winsen MH-Z19C). Use when designing, wiring, simulating or writing code for an MH-Z19C in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MH-Z19C NDIR CO2 sensor (MH-Z19C)

## Overview
The **MH-Z19C** from Winsen is an infrared (NDIR) CO2 sensor with a gold-plated optical chamber, the successor of the MH-Z19B. It measures 400–5000 ppm (400–2000 and 400–10000 ppm versions exist) with 1 ppm resolution, accurate to ±(50 ppm + 5 % of reading), with built-in temperature compensation. It talks UART at 9600 baud with 3.3 V logic and also has a PWM output, but **needs a 5 V supply**. This part is the **Winsen MH-Z19C terminal version with the 7-pin JST cable**; a pin version with two side headers (HD, SR, Tx, Rx, Vo / PWM, AOT, GND, Vin) also exists and uses the same protocol.

## Pinout (MH-Z19C terminal version, 7-pin connector order, Winsen manual v1.2)
| Pin | Name | Function |
|---|---|---|
| 1 | HD | Manual zero-point calibration: low for over 7 s = set 400 ppm (optional) |
| 2 | NC | Reserved, leave unconnected |
| 3 | GND | Ground |
| 4 | Vin | Supply, 5 V (4.5–5.5 V) |
| 5 | RXD | UART data input (wire to the microcontroller's TX) |
| 6 | TXD | UART data output (wire to the microcontroller's RX) |
| 7 | PWM | PWM CO2 output (optional) |

## Electrical limits
- Supply: 5.0 ± 0.1 V nominal, must stay within 4.5–5.5 V; supply must deliver at least 150 mA (peak 125 mA, average < 40 mA at 5 V).
- UART levels: 3.3 V TTL, 5 V compatible, so it connects straight to an ESP32 or Pico.
- Preheat 1 min; response T90 < 120 s; working −10 to 50 °C, 0–95 % RH (no condensation).

## Interface details
- UART 9600 baud, 8 data bits, 1 stop bit, no parity. Every frame is 9 bytes.
- Read CO2: send `FF 01 86 00 00 00 00 00 79`; reply `FF 86 HIGH LOW - - - - CS`. CO2 (ppm) = HIGH × 256 + LOW (datasheet example: 01 F4 = 500 ppm).
- Checksum = (0xFF − (byte1 + … + byte7)) + 1, low 8 bits.
- Self-calibration (ABC) 0x79: byte3 0xA0 = on, 0x00 = off, no reply. On from the factory; runs every 24 h, taking the lowest reading as 400 ppm.
- The C manual documents only 0x86 and 0x79; zero calibration is done with the HD pin (low ≥ 7 s).
- PWM: cycle 1004 ms ± 5 %, Cppm = range × (TH − 2 ms) / (T − 4 ms) (range = 2000 for the 2000 ppm example in the manual).

## Wiring
- ESP32: Vin → 5V (VIN/USB), GND → GND, RXD → GPIO17 (UART2 TX), TXD → GPIO16 (UART2 RX).
- Pico: Vin → VBUS (pin 40), GND → GND, RXD → GP4 (UART1 TX), TXD → GP5 (UART1 RX).
- Raspberry Pi 4: Vin → pin 2 (5 V), GND → pin 6, RXD → pin 8 (TXD), TXD → pin 10 (RXD).

## Using the driver
```python
from machine import UART, Pin
from mhz19c import MHZ19C
u = UART(2, baudrate=9600, tx=Pin(17), rx=Pin(16))
print('CO2=%d ppm' % MHZ19C(u).read_co2())
```

## Gotchas
- TX and RX cross over: microcontroller TX → sensor RXD, microcontroller RX ← sensor TXD.
- Do not power it from 3.3 V: readings go low or stop.
- Readings settle only after the preheat; the first minute is not valid.
- ABC suits homes and offices; turn it off (`set_abc(False)`) in greenhouses, farms or fridges.
- Only zero-calibrate (HD low ≥ 7 s, `zero_calibrate_hd(Pin(n))`) after at least 20–30 minutes in stable 400 ppm fresh air.
- Do not press on the gold chamber; ventilate the diffusion window when enclosed.

## Datasheet
https://www.winsen-sensor.com/d/files/mh-z19c-pins%26terminal-type-co2-manual(ver1_2).pdf
