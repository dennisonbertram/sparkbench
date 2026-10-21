---
name: part-cm1106
description: Pinout, electrical limits, wiring and MicroPython driver for the Cubic CM1106 single-beam NDIR CO2 sensor module (Wuhan Cubic CM1106, UART). Use when designing, wiring, simulating or writing code for a CM1106 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Cubic CM1106 NDIR CO2 sensor (CM1106)

## Overview
The **CM1106** from Wuhan Cubic Optoelectronics is a small (33 × 19.7 × 8.9 mm) single-beam infrared (NDIR) CO2 sensor. The standard version measures 0–2000 ppm (5000 / 10000 ppm versions are made to order), accurate to ±(50 ppm + 5 % of reading), with 1 ppm resolution. It talks UART at 9600 baud with **3.3 V logic** but **needs a 5 V supply**. Hobbyists buy the **Cubic CM1106 module with two pin headers** (this part): a 5-pin CON5 (UART side) and a 4-pin CON4 (power side) on opposite edges, so it is wired with jumper leads.

## Pinout (Cubic CM1106 "I/O definitions", header by header)
| Header | Pin | Name | Function |
|---|---|---|---|
| CON5 | 1 | +3.3V | 3.3 V output (100 mA max) – leave unconnected |
| CON5 | 2 | RX | UART receive (wire to the microcontroller's TX) |
| CON5 | 3 | TX | UART transmit (wire to the microcontroller's RX) |
| CON5 | 4 | R/T | RS485 direction (reserved) |
| CON5 | 5 | CA | Manual calibration: short to GND for 2 s |
| CON4 | 1 | +5V | Supply input |
| CON4 | 2 | GND | Ground |
| CON4 | 3 | A | Alarm output (reserved) |
| CON4 | 4 | PWM | PWM output, 1004 ms period, high time = ppm/2 + 2 ms |

## Electrical limits
- Supply: DC 5 V ± 5 % (4.75–5.25 V); average 70 mA, peak 120 mA.
- UART levels: 3.3 V TTL, so RX/TX connect straight to an ESP32 or Pico.
- Response T90 < 120 s; working −10 to 50 °C, 0–95 % RH non-condensing.

## Interface details
- UART 9600 baud, 8 data bits, 1 stop bit, no parity.
- Frame: host sends `11 LEN CMD DATA… CS`, module answers `16 LEN CMD DATA… CS`. LEN = data bytes + 1 (CMD).
- Checksum CS = 256 − (sum of all previous bytes, header included) mod 256.
- Read CO2: send `11 01 01 ED`; reply `16 05 01 DF1 DF2 DF3 DF4 CS`. CO2 (ppm) = DF1 × 256 + DF2. DF3 = status (bit0 preheating, bit1 sensor error, bit2 over range, bit3 under range, bit4 not calibrated, bit5 light aging, bit6 drift). Datasheet example: `16 05 01 02 58 00 00 8A` = 600 ppm.
- Calibrate: `11 03 03 DF1 DF2 CS` sets the reading to DF1×256+DF2 ppm (400–1500), reply `16 01 03 E6`.
- ABC: `11 07 10 64 DF2 DF3 01 90 64 CS`, DF2 0 = on / 2 = off, DF3 = cycle in days (default 7); reply `16 01 10 D9`.

## Wiring
- ESP32: +5V → 5V (VIN/USB), GND → GND, RX → GPIO17 (UART2 TX), TX → GPIO16 (UART2 RX).
- Pico: +5V → VBUS (pin 40), GND → GND, RX → GP4 (UART1 TX), TX → GP5 (UART1 RX).
- Raspberry Pi 4: +5V → pin 2 (5 V), GND → pin 6, RX → pin 8 (TXD), TX → pin 10 (RXD).

## Using the driver
```python
from machine import UART, Pin
from cm1106 import CM1106
u = UART(2, baudrate=9600, tx=Pin(17), rx=Pin(16))
print('CO2=%d ppm' % CM1106(u).read_co2())
```

## Gotchas
- TX and RX cross over: microcontroller TX → sensor RX, microcontroller RX ← sensor TX.
- Power from 5 V, not 3.3 V. Do not feed anything into the +3.3V pin – it is an output.
- Ignore readings while status bit0 (preheating) is set after power-up.
- ABC treats the lowest reading of each cycle as 400 ppm; turn it off (`set_abc(False)`) where the sensor never sees fresh air.
- Manual calibration (CA to GND for 2 s, or `calibrate(400)`) only in stable outdoor-level air.

## Datasheet
https://www.energiazero.org/cartelle/project-work/Monitor%20CO2/CM1106%20CO2%20SENSOR%20MODULE%20INTRODUCTION.pdf
(UART protocol: https://endrich.com/Datenbl%C3%A4tter/Sensoren/Gassensoren/CM1106H-NS.pdf)
