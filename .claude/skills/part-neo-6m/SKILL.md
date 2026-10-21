---
name: part-neo-6m
description: Pinout, electrical limits, wiring and MicroPython driver for the NEO-6M GPS module (u-blox NEO-6M on a GY-NEO6MV2 board). Use when designing, wiring, simulating or writing code for a NEO-6M in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# NEO-6M GPS module (NEO-6M)

## Overview
The **u-blox NEO-6M** is a 50-channel GPS L1 receiver. Out of the box it streams NMEA 0183 sentences (GGA, GLL, GSA, GSV, RMC, VTG, TXT) on its UART at **9600 baud, 8N1**, once per second. Hobbyists buy it as the **GY-NEO6MV2** module: a 3.3 V regulator, backup battery, EEPROM, a fix LED and a ceramic patch antenna on a U.FL lead.

## Pinout (GY-NEO6MV2, header order)
| Pin | Function |
|---|---|
| VCC | Supply, 3.3–5 V (on-board 3.3 V regulator) |
| RX | Module serial input, 3.3 V logic (optional; only for configuration commands) |
| TX | Module serial output, NMEA at 9600 baud |
| GND | Ground |

## Electrical limits
- NEO-6M chip: VCC 2.7–3.6 V (absolute max 3.6 V); the module's regulator accepts 3.3–5 V on VCC.
- I/O pins: input range 0–VCC of the chip (3.3 V), absolute max 3.6 V. Drive RX from 3.3 V logic only.
- Current: about 39 mA tracking (datasheet typical), up to 67 mA peak; about 45 mA for the module with LED.

## Interface details
- UART 9600 baud, 8 data bits, no parity, 1 stop bit (datasheet default settings). Also accepts UBX and NMEA commands on RX.
- Every sentence: `$<talker><type>,<fields>*<cs>\r\n`, where cs is two hex digits = XOR of all characters between `$` and `*`.
- **GGA**: `$GPGGA,hhmmss.ss,ddmm.mmmmm,N,dddmm.mmmmm,E,fix,sats,HDOP,alt,M,geoid,M,,*cs` (fix 0 = none, 1 = GPS, 2 = DGPS).
- **RMC**: `$GPRMC,hhmmss.ss,A|V,lat,N,lon,E,knots,course,ddmmyy,,,mode*cs` (A = valid, V = warning/no fix).
- Position is degrees + minutes: decimal degrees = dd + mm.mmmmm / 60, negative for S and W (e.g. 4717.11399 N = 47.285233°).
- Without a fix the position fields are empty; the driver keeps `fix = False` and does not overwrite the last position.

## Wiring
- ESP32: VCC → 3V3 (or 5V), GND → GND, TX → GPIO16 (RX2), RX → GPIO17 (TX2); `UART(2, 9600, tx=Pin(17), rx=Pin(16))`.
- Pico: VCC → 3V3(OUT) (or VBUS), GND → GND, TX → GP1 (UART0 RX), RX → GP0 (UART0 TX); `UART(0, 9600, tx=Pin(0), rx=Pin(1))`.
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, TX → pin 10 (GPIO15 RXD), RX → pin 8 (GPIO14 TXD); enable the serial port and disable the login console.

## Using the driver
```python
from machine import UART, Pin
import time
from neo6m import NEO6M
gps = NEO6M(UART(2, baudrate=9600, tx=Pin(17), rx=Pin(16)))
while True:
    if gps.update() and gps.fix:
        print('LAT=%.4f LON=%.4f ALT=%.1fm' % (gps.latitude, gps.longitude, gps.altitude or 0))
    time.sleep_ms(200)
```
Call `update()` often (at least every few hundred ms) so the UART buffer does not overflow. Also available: `satellites`, `hdop`, `speed_knots`, `course`, `utc_time`, `date`, `fix_quality`, `bad_checksums`.

## Gotchas
- TX and RX cross over: module TX → board RX.
- No output at all or garbage: wrong baud rate (must be 9600) or TX/RX swapped.
- No fix indoors is normal. Take it outside with the ceramic side of the antenna facing the sky; the first (cold) start can take a minute or more. The LED blinks once a second once it has a fix.
- MicroPython floats on many ports are single precision (about 7 significant digits), good to about 1 m at 4 decimal places of longitude.
- Many listings call the RX/TX pins "5 V tolerant"; the chip's absolute maximum is 3.6 V, so don't drive RX from 5 V logic without a divider.

## Datasheet
https://content.u-blox.com/sites/default/files/products/documents/NEO-6_DataSheet_%28GPS.G6-HW-09005%29.pdf
Protocol (NMEA/UBX): https://content.u-blox.com/sites/default/files/products/documents/u-blox6_ReceiverDescrProtSpec_%28GPS.G6-SW-10018%29_Public.pdf
