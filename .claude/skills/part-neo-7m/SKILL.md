---
name: part-neo-7m
description: Pinout, electrical limits, wiring and MicroPython driver for the NEO-7M GPS module (u-blox NEO-7M on a Waveshare UART GPS NEO-7M-C board). Use when designing, wiring, simulating or writing code for a NEO-7M in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# NEO-7M GPS module (NEO-7M)

## Overview
The **u-blox NEO-7M** is a 56-channel u-blox 7 GNSS receiver (GPS by default; GLONASS, Galileo, QZSS and SBAS selectable). Out of the box it streams NMEA 0183 sentences (GGA, GLL, GSA, GSV, RMC, VTG, TXT) on its UART at **9600 baud, 8N1**, once per second. The modelled board is the **Waveshare UART GPS NEO-7M-C**: RT9193-33 3.3 V regulator, rechargeable backup battery, AT24C32 EEPROM, fix LED, 510 Ω series resistors on TXD/RXD and an active antenna on an IPX socket.

## Pinout (Waveshare UART GPS NEO-7M-C, header P1 order)
| Pin | Function |
|---|---|
| VCC | Supply, 3.3–5 V (on-board 3.3 V regulator) |
| GND | Ground |
| TXD | Module serial output, NMEA at 9600 baud, 3.3 V logic |
| RXD | Module serial input, 3.3 V logic (optional; only for configuration commands) |
| PPS | Time pulse, 1 pulse per second by default (optional) |

## Electrical limits
- NEO-7M chip: VCC 1.65–3.6 V (absolute max 3.6 V); the board's regulator takes 3.3–5 V on VCC (Waveshare quotes 2.7–5.0 V).
- I/O pins: input range 0–VCC of the chip (3.3 V), absolute max 3.6 V; VIL ≤ 0.2·VCC, VIH ≥ 0.7·VCC. Drive RXD from 3.3 V logic only.
- Current: about 35 mA for the board (Waveshare), NEO-7M peak up to 67 mA; 22 mA acquisition / 17 mA tracking at 3 V (datasheet).

## Interface details
- UART 9600 baud, 8 data bits, no parity, 1 stop bit (datasheet "Default messages"). Also accepts UBX and NMEA commands on RXD.
- Every sentence: `$<talker><type>,<fields>*<cs>\r\n`, cs = two hex digits, XOR of all characters between `$` and `*`. Talker is `GP` (GPS only, default); `GL`/`GN` appear when GLONASS is enabled, so the driver reads the type after the 2-letter talker.
- **GGA**: `$GPGGA,hhmmss.ss,ddmm.mmmmm,N,dddmm.mmmmm,E,fix,sats,HDOP,alt,M,geoid,M,,*cs` (fix 0 = none).
- **RMC**: `$GPRMC,hhmmss.ss,A|V,lat,N,lon,E,knots,course,ddmmyy,,,mode*cs` (A = valid, V = no fix).
- Decimal degrees = dd + mm.mmmmm / 60, negative for S and W.
- Without a fix the position fields are empty; the driver keeps `fix = False` and keeps the last position.

## Wiring
- ESP32: VCC → 3V3 (or 5V), GND → GND, TXD → GPIO16 (RX2), RXD → GPIO17 (TX2); `UART(2, 9600, tx=Pin(17), rx=Pin(16))`.
- Pico: VCC → 3V3(OUT) (or VBUS), GND → GND, TXD → GP1 (UART0 RX), RXD → GP0 (UART0 TX); `UART(0, 9600, tx=Pin(0), rx=Pin(1))`.
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, TXD → pin 10 (GPIO15 RXD), RXD → pin 8 (GPIO14 TXD); enable the serial port and disable the login console.
- PPS (optional) → any GPIO input; rising edge marks the start of each second once there is a fix.

## Using the driver
```python
from machine import UART, Pin
import time
from neo7m import NEO7M
gps = NEO7M(UART(2, baudrate=9600, tx=Pin(17), rx=Pin(16)))
while True:
    if gps.update() and gps.fix:
        print('LAT=%.4f LON=%.4f ALT=%.1fm' % (gps.latitude, gps.longitude, gps.altitude or 0))
    time.sleep_ms(200)
```
Call `update()` often (at least every few hundred ms) so the UART buffer does not overflow. Also available: `satellites`, `hdop`, `speed_knots`, `course`, `utc_time`, `date`, `fix_quality`, `bad_checksums`.

## Gotchas
- TXD and RXD cross over: module TXD → board RX.
- No output or garbage: wrong baud rate (must be 9600) or TX/RX swapped.
- No fix indoors is normal. Put the antenna near a window or outdoors; a cold start can take 1–3 minutes. The LED stays lit while searching and blinks once fixed.
- MicroPython floats on many ports are single precision (about 7 significant digits), good to about 1 m at 4 decimal places.
- The TXD/RXD pins go straight to the 3.3 V chip (through 510 Ω); don't drive RXD from 5 V logic without a divider.

## Datasheet
https://content.u-blox.com/sites/default/files/products/documents/NEO-7_DataSheet_%28UBX-13003830%29.pdf
Board: https://www.waveshare.com/wiki/UART_GPS_NEO-7M-C (schematic: https://www.waveshare.com/w/upload/3/37/UART-GPS-NEO-Schematic.pdf)
