---
name: part-mh-z16
description: Pinout, electrical limits, wiring and MicroPython driver for the MH-Z16 NDIR CO2 sensor (Winsen MH-Z16). Use when designing, wiring, simulating or writing code for an MH-Z16 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MH-Z16 NDIR CO2 sensor (MH-Z16)

## Overview
The **MH-Z16** from Winsen is a tube-shaped infrared (NDIR) CO2 module (97 × 20 × 17 mm, gold-plated optical chamber) with built-in temperature compensation. Its range is set by command, from 0–2000 ppm up to 0–15 %vol, with accuracy ±(100 ppm + 6 % of reading). It has three outputs: UART (9600 baud, 3.3 V interface level), PWM, and an analog voltage (0.4–2 V). It **needs a 5 V supply** that can deliver 150 mA. Hobbyists buy the **Winsen MH-Z16 with its 7-wire cable** plugged into the 7-pin connector on the end board (pins 1–7). That is the part modelled here.

## Pinout (MH-Z16 7-pin connector, Winsen manual V2.4 section 6)
| Pin | Name | Function |
|---|---|---|
| 1 | HD | Manual zero calibration: pull low for > 7 s in 400 ppm air |
| 2 | Vout | Analog output, 0.4–2 V = 0 to full range |
| 3 | GND | Ground |
| 4 | Vin | Supply, 4.5–5.5 V |
| 5 | RXD | UART data input (wire to the microcontroller's TX) |
| 6 | TXD | UART data output (wire to the microcontroller's RX) |
| 7 | PWM | PWM output, 1004 ms cycle |

## Electrical limits
- Supply: 4.5–5.5 V DC. Average current < 85 mA, but the supply must deliver at least 150 mA. Outside this range the reading goes low or the sensor stops working.
- Interface level 3.3 V, so RXD/TXD connect straight to an ESP32 or Pico.
- Preheat 3 min. Response T90 < 30 s. Working range −10 to 50 °C, 0–95 % RH (no condensation).

## Interface details
- UART 9600 baud, 8 data bits, 1 stop bit, no parity. Every frame is 9 bytes.
- Read CO2: send `FF 01 86 00 00 00 00 00 79`. The reply is `FF 86 HIGH LOW - - - - CS`, and CO2 (ppm) = HIGH × 256 + LOW. Datasheet example: `FF 86 02 20 00 00 00 00 58` = 544 ppm.
- Checksum = (0xFF − (byte1 + … + byte7)) + 1, low 8 bits.
- Other commands, none of which reply:
  - Zero calibration 0x87 (`FF 01 87 00 00 00 00 00 78`).
  - Span calibration 0x88 with the span in bytes 3–4 (`FF 01 88 07 D0 00 00 00 A0` = 2000 ppm).
  - Self-calibration (ABC) on/off 0x79 (byte3 0xA0 on / 0x00 off).
  - Detection range 0x99 with the range in bytes 4–7.
- Analog: C = (Vo − 0.4 V) × full scale / 1.6 V. Vo is 0 V if the self-check finds a fault.
- PWM (0–2000 ppm range): C = 2000 × (TH − 2 ms) / (TH + TL − 4 ms).

## Wiring
- ESP32: Vin → 5V (VIN/USB), GND → GND, RXD → GPIO17 (UART2 TX), TXD → GPIO16 (UART2 RX).
- Pico: Vin → VBUS (pin 40), GND → GND, RXD → GP4 (UART1 TX), TXD → GP5 (UART1 RX).
- Raspberry Pi 4: Vin → pin 2 (5 V), GND → pin 6, RXD → pin 8 (TXD), TXD → pin 10 (RXD).
- HD, Vout and PWM can stay unconnected for UART use.

## Using the driver
```python
from machine import UART, Pin
from mhz16 import MHZ16
u = UART(2, baudrate=9600, tx=Pin(17), rx=Pin(16))
print('CO2=%d ppm' % MHZ16(u).read_co2())
```

## Gotchas
- TX and RX cross over: microcontroller TX → sensor RXD, microcontroller RX ← sensor TXD.
- Do not power it from 3.3 V. Readings go low or stop.
- Readings are meaningless for the first 3 minutes after power-up.
- Self-calibration sets the zero point (400 ppm) every 24 h. Turn it off (`set_abc(False)`) in greenhouses, farms, fridges or rooms that never get fresh air.
- Only zero-calibrate (by command, or by holding HD low for 7 s) after at least 20 minutes in fresh (400 ppm) air. Never tie HD to GND permanently.
- The reply is a 16-bit count, so on the 10 % and 15 % ranges, readings above 65535 ppm cannot be returned. Check the range your unit was shipped with.
- Do not press on the gold-plated chamber. Recalibrate at least every 6 months.

## Datasheet
https://www.winsen-sensor.com/d/files/MH-Z16.pdf
