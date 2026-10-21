---
name: part-mh-z14a
description: Pinout, electrical limits, wiring and MicroPython driver for the MH-Z14A NDIR CO2 sensor (Winsen MH-Z14A). Use when designing, wiring, simulating or writing code for an MH-Z14A in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MH-Z14A NDIR CO2 sensor (MH-Z14A)

## Overview
The **MH-Z14A** from Winsen is an infrared (NDIR) CO2 module with a gold-plated optical chamber on a 57.5 × 34.7 mm board. It measures 0–2000 / 0–5000 / 0–10000 ppm (range settable by command), accurate to ±(50 ppm + 5 % of reading) up to 5000 ppm, with built-in temperature compensation. It has three outputs: UART (9600 baud, 3.3 V logic, 5 V tolerant), PWM and an analog voltage (0.4–2 V). It **needs a 5 V supply** that can deliver 150 mA. Hobbyists buy the **Winsen MH-Z14A with the 7-wire terminal cable** plugged into its 7-pin connector (pads 20–26), which is the part modelled here; the same signals are also on a 2 × 10 pad field (pads 1–19).

## Pinout (MH-Z14A 7-pin terminal connector, pads 20–26, Winsen manual V1.2)
| Pin | Pad | Name | Function |
|---|---|---|---|
| 1 | 20 | HD | Manual zero calibration: pull low for > 7 s in 400 ppm air |
| 2 | 21 | Vo | Analog output, 0.4–2 V = 0 to full range |
| 3 | 22 | GND | Ground |
| 4 | 23 | Vin | Supply, 4.5–5.5 V |
| 5 | 24 | RXD | UART data input (wire to the microcontroller's TX) |
| 6 | 25 | TXD | UART data output (wire to the microcontroller's RX) |
| 7 | 26 | PWM | PWM output, 1004 ms cycle |

## Electrical limits
- Supply: 4.5–5.5 V DC, at least 150 mA (average < 60 mA, peak 150 mA at 5 V). Outside this range readings go low or the sensor stops.
- UART levels: 3.3 V TTL, 5 V compatible, so RXD/TXD connect straight to an ESP32 or Pico.
- Preheat 3 min; response T90 < 120 s; working −10 to 50 °C, 0–95 % RH (no condensation).

## Interface details
- UART 9600 baud, 8 data bits, 1 stop bit, no parity. Every frame is 9 bytes.
- Read CO2: send `FF 01 86 00 00 00 00 00 79`; reply `FF 86 HIGH LOW - - - - CS`. CO2 (ppm) = HIGH × 256 + LOW. Datasheet example: `FF 86 02 20 00 00 00 00 58` = 544 ppm.
- Checksum = (0xFF − (byte1 + … + byte7)) + 1, low 8 bits.
- Zero calibration 0x87 (`FF 01 87 00 00 00 00 00 78`), span calibration 0x88 with span in bytes 3–4, ABC on/off 0x79 (byte3 0xA0 on / 0x00 off; on from the factory), range 0x99 with range in bytes 4–7. None of these reply.
- Analog: C = (Vo − 0.4 V) × range / 1.6 V. PWM (0–2000 ppm range): C = 2000 × (TH − 2 ms) / (TH + TL − 4 ms).

## Wiring
- ESP32: Vin → 5V (VIN/USB), GND → GND, RXD → GPIO17 (UART2 TX), TXD → GPIO16 (UART2 RX).
- Pico: Vin → VBUS (pin 40), GND → GND, RXD → GP4 (UART1 TX), TXD → GP5 (UART1 RX).
- Raspberry Pi 4: Vin → pin 2 (5 V), GND → pin 6, RXD → pin 8 (TXD), TXD → pin 10 (RXD).
- HD, Vo and PWM can stay unconnected for UART use.

## Using the driver
```python
from machine import UART, Pin
from mhz14a import MHZ14A
u = UART(2, baudrate=9600, tx=Pin(17), rx=Pin(16))
print('CO2=%d ppm' % MHZ14A(u).read_co2())
```

## Gotchas
- TX and RX cross over: microcontroller TX → sensor RXD, microcontroller RX ← sensor TXD.
- Do not power it from 3.3 V: readings go low or stop.
- Readings are meaningless for the first 3 minutes after power-up.
- ABC recalibrates the lowest reading of each 24 h to 400 ppm; turn it off (`set_abc(False)`) in greenhouses or rooms that never get fresh air.
- Only zero-calibrate (command or HD low for 7 s) after at least 20 minutes in outdoor-fresh (400 ppm) air; never tie HD to GND permanently.
- Vo is 0.4–2 V, so a 3.3 V ADC reads it directly, but it is coarser than UART.
- Do not press on the gold chamber.

## Datasheet
https://www.winsen-sensor.com/d/files/MH-Z14A.pdf
