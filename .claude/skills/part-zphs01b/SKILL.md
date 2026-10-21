---
name: part-zphs01b
description: Pinout, electrical limits, wiring and MicroPython driver for the Winsen ZPHS01B multi-in-one air quality module (PM1.0/PM2.5/PM10, CO2, CH2O, CO, O3, NO2, TVOC grade, temperature, humidity over UART). Use when designing, wiring, simulating or writing code for a ZPHS01B in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# ZPHS01B multi-in-one air quality module (ZPHS01B)

## Overview
The **ZPHS01B** from Winsen is a 135 × 50 × 26 mm box with many sensors inside: a laser dust sensor (PM1.0, PM2.5, PM10, 0–1000 µg/m³), an NDIR CO2 sensor (0–5000 ppm), electrochemical formaldehyde (CH2O, 0–6.25 mg/m³), carbon monoxide (0–500 ppm), ozone (0–10 ppm) and NO2 (0.1–10 ppm) cells, a TVOC sensor that reports a grade from 0 to 3, and temperature/humidity. The board asks for readings over a 9600-baud UART and the module sends all of them back in one frame. Hobbyists buy the **Winsen ZPHS01B module**. It has an XH2.54 4-pin socket.

## Pinout (XH2.54-4P socket, pins 1–4)
| Pin | Name | Function |
|---|---|---|
| 1 | GND | Ground |
| 2 | +5V | 5 V DC supply |
| 3 | RXD | Serial input (3 V TTL, 3.3 V compatible) |
| 4 | TXD | Serial output (3 V TTL), 9600 baud |

GND comes first and +5V second, which is unusual. Check pin 1 before you power it.

## Electrical limits
- Supply: 5 V DC. The datasheet gives no tolerance, so keep it close to 5 V. It draws under 300 mA on average and up to 500 mA at peak, so give it its own 5 V supply (at least 500 mA) and connect that supply's ground to the board's GND.
- UART: 3 V TTL levels, compatible with 3.3 V. It connects straight to an ESP32 or Pico with no level shifter.
- Operating range: −10–50 °C and 15–80 %RH, non-condensing. Warm it up for 3 minutes or more after first power-on.

## Interface details
- UART 9600 baud, 8 data bits, 1 stop bit, no parity. It only answers requests and never sends on its own.
- Read command: `FF 01 86 00 00 00 00 00 79`.
- Reply is 26 bytes, with 16-bit fields sent high byte first:

| Bytes | Field | Decoding |
|---|---|---|
| 0–1 | `FF 86` | header |
| 2–3 / 4–5 / 6–7 | PM1.0 / PM2.5 / PM10 | µg/m³ |
| 8–9 | CO2 | ppm |
| 10 | VOC | grade 0–3 |
| 11–12 | Temperature | (raw − 500) × 0.1 °C |
| 13–14 | Humidity | %RH |
| 15–16 | CH2O | raw × 0.001 mg/m³ |
| 17–18 | CO | raw × 0.1 ppm |
| 19–20 | O3 | raw × 0.01 ppm |
| 21–22 | NO2 | raw × 0.01 ppm |
| 23–24 | reserved | |
| 25 | check | (NOT(byte1 + … + byte24)) + 1 |

- Datasheet example: `FF 86 00 65 00 36 00 96 01 9A 00 02 FD 00 28 00 28 00 05 00 20 00 50 00 00 EA` decodes to PM1.0 101, PM2.5 54, PM10 150, CO2 410 ppm, 26.5 °C, 40 %RH, CH2O 0.040 mg/m³, CO 0.5 ppm, O3 0.32 ppm, NO2 0.80 ppm.

## Wiring
- ESP32: +5V → external 5 V supply (+), GND → supply (−) and ESP32 GND, TXD → GPIO16 (UART2 RX), RXD → GPIO17 (UART2 TX).
- Pico: +5V → external 5 V supply (+), GND → supply (−) and Pico GND, TXD → GP1 (UART0 RX), RXD → GP0 (UART0 TX).
- Raspberry Pi 4: +5V → external 5 V supply, GND → supply (−) and pin 6, TXD → pin 10 (RXD), RXD → pin 8 (TXD).

## Using the driver
```python
from machine import UART, Pin
from zphs01b import ZPHS01B
uart = UART(2, baudrate=9600, tx=Pin(17), rx=Pin(16))
r = ZPHS01B(uart).read()
print(r['co2'], r['pm2_5'], r['temperature'], r['humidity'], r['ch2o'], r['co'], r['o3'], r['no2'], r['voc'])
```
`read()` sends the command, finds the `FF 86` header, checks the check byte and returns a dict in datasheet units. If no valid reply arrives within the timeout, it raises `OSError`.

## Gotchas
- RXD must be wired, because the module only talks after it receives the read command.
- The check byte covers bytes 1–24 of the reply (MH-Z19-style sum, but over the long frame), not just bytes 1–7.
- Temperature carries an offset of +500 (0.1 °C units), so raw 0x0159 means −15.5 °C.
- Gas readings drift for the first few minutes. Ignore them until it has warmed up for 3 minutes or more.
- Keep the dust inlet and the fan outlet open, and keep the module out of strong drafts, kitchens, bathrooms and organic solvents.

## Datasheet
https://www.winsen-sensor.com/d/files/zphs01b-english-version1_1-20200713.pdf
