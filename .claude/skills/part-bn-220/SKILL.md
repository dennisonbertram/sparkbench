---
name: part-bn-220
description: Pinout, electrical limits, wiring and MicroPython driver for the Beitian BN-220 GPS/GNSS module (u-blox M8030-KT, UART NMEA). Use when designing, wiring, simulating or writing code for a BN-220 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# BN-220 GPS module (BN-220)

## Overview
The **Beitian BN-220** is a small (22 × 20 × 6 mm) GNSS receiver built on the u-blox **M8030-KT** with a ceramic patch antenna. It tracks GPS, GLONASS, Galileo, BeiDou, QZSS and SBAS and streams **NMEA-0183** text over a TTL serial line: **9600 baud, 8N1, 1 Hz** by default (GGA, GLL, GSA, GSV, RMC, VTG). Horizontal accuracy 2.0 m CEP, cold start about 26 s, hot start 1 s. It is sold for drones with a 4-wire 1.0 mm JST-SH cable.

## Pinout (BN-220 cable connector, pin 1 to 4)
| Pin | Function |
|---|---|
| GND | Ground |
| TX | Serial data out of the module (NMEA) -> board RX |
| RX | Serial data into the module (UBX config) <- board TX, optional |
| VCC | Supply 3.0–5.5 V, typical 5.0 V |

## Electrical limits
- Supply: 3.0–5.5 V DC (typ. 5.0 V); about 50 mA while acquiring.
- Serial lines are 3.3 V TTL by default, safe for ESP32 / Pico GPIO.
- Operating temperature −40 to +85 °C.

## Interface details
- UART 9600 baud (configurable 4800–921600 with UBX commands), 8 data bits, no parity, 1 stop bit.
- Sentences start with `$` and end with `*hh\r\n`; `hh` is the XOR of every character between `$` and `*`.
- Talker ID is `GN` in multi-GNSS mode (the default) or `GP`; match on the sentence type.
- **GGA**: time, lat (ddmm.mmmmm), N/S, lon (dddmm.mmmmm), E/W, fix quality (0 = none, 1 = GPS, 2 = DGPS, 6 = dead reckoning), satellites used, HDOP, altitude (m MSL).
- **RMC**: time, status (A valid / V warning), lat, N/S, lon, E/W, speed (knots), course (° true), date ddmmyy.
- Decimal degrees = degrees + minutes / 60, negative for S and W.

## Wiring
- ESP32: VCC -> 5V (or 3V3), GND -> GND, TX -> GPIO16 (RX2), RX -> GPIO17 (TX2), UART 2.
- Pico: VCC -> VBUS (5 V) or 3V3(OUT), GND -> GND, TX -> GP1 (UART0 RX), RX -> GP0 (UART0 TX).
- Raspberry Pi 4: VCC -> pin 2 (5 V), GND -> pin 6, TX -> pin 10 (RXD), RX -> pin 8 (TXD); enable the serial port and disable the login shell on it.

## Using the driver
```python
from machine import UART, Pin
import time
from bn220 import BN220
gps = BN220(UART(2, baudrate=9600, tx=Pin(17), rx=Pin(16)))
while True:
    if gps.update():
        print('LAT=%.4f LON=%.4f ALT=%.1fm sats=%d' % (gps.latitude, gps.longitude, gps.altitude, gps.satellites))
    time.sleep_ms(100)
```
`update()` returns True each time a GGA sentence with a fix arrives. Also available: `has_fix`, `valid`, `speed_knots`, `course`, `time` (UTC h, m, s), `date` (day, month, year), `hdop`.

## Gotchas
- Cross TX and RX. Nothing printed at all usually means TX went to the board's TX.
- Cable colours vary between batches: go by the pin order (GND, TX, RX, VCC), not the colour.
- Indoors it may never get a fix; until then GGA has fix quality 0 and empty position fields. The red PPS LED flashes once fixed; the blue LED flashes with every data burst.
- Keep it away from the ESP32's Wi-Fi antenna and switching regulators; antenna facing the sky.
- MicroPython floats are single precision on many ports: parse degrees and minutes separately (the driver does) and print at most 4–5 decimals.

## Datasheet
https://old.unmannedtechshop.co.uk/wp-content/uploads/2022/02/BN-220-GPSAntenna-datasheet.pdf
