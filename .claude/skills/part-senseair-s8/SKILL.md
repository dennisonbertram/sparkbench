---
name: part-senseair-s8
description: Pinout, electrical limits, wiring and MicroPython driver for the Senseair S8 LP NDIR CO2 sensor (Senseair S8 LP, UART Modbus). Use when designing, wiring, simulating or writing code for a Senseair S8 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Senseair S8 LP CO2 sensor (Senseair S8 LP 004-0-0053)

## Overview
The **Senseair S8 LP** is a small NDIR carbon-dioxide sensor. It measures 400–10000 ppm (±40 ppm ±3 % of reading from 400–2500 ppm) and takes a new reading every 4 s. It runs from 5 V, and its UART uses 3.3 V logic with **Modbus RTU** at 9600 baud. It also has a 1 kHz PWM output and an open-collector alarm output. Hobbyists buy the bare module (article 004-0-0053). It has pins on two edges, so wire it with jumper leads.

## Pinout (header order: 4-pin edge, then 5-pin edge)
| Pin | Function |
|---|---|
| G+ | Supply, 4.5–5.25 V (not protected against reverse polarity) |
| G0 | Ground |
| Alarm_OC | Open-collector alarm, pulled up to G+ (5 V) inside (optional) |
| PWM 1kHz | PWM output, 3.3 V, 0–100 % = 0–2000 ppm (optional) |
| DVCC_out | 3.3 V regulator output, max 6 mA (optional, for level shifters) |
| UART_RxD | UART receive, 3.3 V logic → board TX |
| UART_TxD | UART transmit, 3.3 V logic → board RX |
| UART_R/T | RS485 direction output (optional) |
| bCAL_in | Calibration input, active low (optional) |

## Electrical limits
- Supply: 4.5–5.25 V (absolute max 5.5 V). Average current ≤ 18 mA, peaks up to 300 mA.
- UART, PWM and bCAL_in: −0.3 V to DVCC_out + 0.5 V (3.3 V logic). Do not drive them with 5 V.
- Alarm_OC: up to 5.5 V, sinks up to 100 mA, pulled up to G+ through 10 kΩ.

## Interface details
- UART 9600 baud, 8N1 (the sensor sends 2 stop bits, which a 1-stop-bit receiver also accepts). Modbus RTU, "any address" 0xFE.
- Read status + CO2: send `FE 04 00 00 00 04 E5 C6` (Read Input Registers IR1–IR4).
- Reply: `FE 04 08`, MeterStatus (2 bytes), AlarmStatus (2), OutputStatus (2), CO2 in ppm (2, big-endian), CRC-16/MODBUS (poly 0xA001 reflected, init 0xFFFF, low byte first). Datasheet example: 400 ppm → `FE 04 08 00 00 00 00 00 00 01 90 16 E6`.
- MeterStatus bits: 0 fatal error, 1 offset regulation, 2 algorithm, 3 output, 4 self-diagnostics, 5 out of range, 6 memory error. 0 = all fine.

## Wiring
- ESP32: G+ → 5V (VIN), G0 → GND, UART_TxD → GPIO16 (RX2), UART_RxD → GPIO17 (TX2).
- Pico: G+ → VBUS (5 V), G0 → GND, UART_TxD → GP1 (UART0 RX), UART_RxD → GP0 (UART0 TX).
- Raspberry Pi 4: G+ → pin 2 (5 V), G0 → pin 6, UART_TxD → pin 10 (RXD), UART_RxD → pin 8 (TXD).

## Using the driver
```python
from machine import UART, Pin
from senseair_s8 import S8
uart = UART(2, baudrate=9600, tx=Pin(17), rx=Pin(16))
co2, status = S8(uart).read()
print('CO2=%d ppm' % co2)
```

## Gotchas
- No reply nearly always means TxD and RxD are not crossed, or G+ has no 5 V.
- Allow about 60 s of warm-up. The reading only changes every 4 s.
- ABC self-calibration assumes the sensor sees outdoor-level air (about 400 ppm) now and then. In a room that is always occupied, readings drift low.
- Never wire Alarm_OC straight to a 3.3 V GPIO: it sits at 5 V through the internal pull-up.
- Peak current is up to 300 mA, so add a 100 µF capacitor across G+/G0.

## Datasheet
https://rmtplusstoragesenseair.blob.core.windows.net/docs/publicerat/PSP126.pdf
Modbus: https://rmtplusstoragesenseair.blob.core.windows.net/docs/Dev/publicerat/TDE2067.pdf
