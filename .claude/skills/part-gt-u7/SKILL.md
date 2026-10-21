---
name: part-gt-u7
description: Pinout, electrical limits, wiring and MicroPython driver for the GT-U7 GPS module (Goouuu Tech GT-U7, u-blox 6 engine, NEO-6M compatible). Use when designing, wiring, simulating or writing code for a GT-U7 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# GT-U7 GPS module (GT-U7)

## Overview
The **Goouuu Tech GT-U7** is a 50-channel GPS L1 receiver module built on the u-blox 6 positioning engine, pin- and protocol-compatible with the u-blox NEO-6M. Out of the box it streams NMEA 0183 sentences (GGA, GSA, GSV, RMC, VTG, GLL) on its UART at **9600 baud, 8N1**, once per second, and also accepts UBX commands. Hobbyists buy it on a small black breakout: 3.3 V regulator, backup battery, EEPROM, a PPS LED, micro-USB socket (the module's own USB port) and an IPEX/U.FL socket with a ceramic patch antenna.

## Pinout (Goouuu Tech GT-U7 breakout, header order, component side left to right)
| Pin | Function |
|---|---|
| VCC | Supply, 3.3-5 V (on-board 3.3 V regulator) |
| GND | Ground |
| RXD | Module serial input, 3.3 V logic, 510 ohm series resistor (optional; only for configuration commands) |
| TXD | Module serial output, NMEA at 9600 baud |
| PPS | Time pulse (1 PPS) output, optional |

The labels are printed on the back of the board (reading PPS, TXD, RXD, GND, VCC there because the board is upside down).

## Electrical limits
- GT-U7 module: VCC 2.7-3.6 V (absolute max 3.6 V); the breakout's regulator accepts 3.3-5 V on VCC.
- I/O pins: input 0-VCC of the module (3.3 V), absolute max 3.6 V; VIL < 0.2 x VCC, VIH > 0.7 x VCC; outputs 4 mA. Drive RXD from 3.3 V logic only.
- Current: about 40 mA tracking, up to about 67 mA peak during acquisition; plan on 45 mA for the board with LED.

## Interface details
- UART 9600 baud, 8 data bits, no parity, 1 stop bit (default). NMEA 2.3 output, UBX binary in/out.
- Every sentence: `$<talker><type>,<fields>*<cs>\r\n`, cs = two hex digits, XOR of all characters between `$` and `*`.
- **GGA**: `$GPGGA,hhmmss.ss,ddmm.mmmmm,N,dddmm.mmmmm,E,fix,sats,HDOP,alt,M,geoid,M,,*cs` (fix 0 = none, 1 = GPS, 2 = DGPS).
- **RMC**: `$GPRMC,hhmmss.ss,A|V,lat,N,lon,E,knots,course,ddmmyy,,,mode*cs` (A = valid, V = no fix).
- Position is degrees + minutes: decimal degrees = dd + mm.mmmmm / 60, negative for S and W.
- Without a fix the position fields are empty; the driver keeps `fix = False` and keeps the last position.

## Wiring
- ESP32: VCC -> 3V3 (or 5V), GND -> GND, TXD -> GPIO16 (RX2), RXD -> GPIO17 (TX2); `UART(2, 9600, tx=Pin(17), rx=Pin(16))`.
- Pico: VCC -> 3V3(OUT) (or VBUS), GND -> GND, TXD -> GP1 (UART0 RX), RXD -> GP0 (UART0 TX); `UART(0, 9600, tx=Pin(0), rx=Pin(1))`.
- Raspberry Pi 4: VCC -> pin 1 (3.3 V), GND -> pin 6, TXD -> pin 10 (GPIO15 RXD), RXD -> pin 8 (GPIO14 TXD), optional PPS -> pin 12 (GPIO18); enable the serial port and disable the login console.

## Using the driver
```python
from machine import UART, Pin
import time
from gtu7 import GTU7
gps = GTU7(UART(2, baudrate=9600, tx=Pin(17), rx=Pin(16)))
while True:
    if gps.update() and gps.fix:
        print('LAT=%.4f LON=%.4f ALT=%.1fm' % (gps.latitude, gps.longitude, gps.altitude or 0))
    time.sleep_ms(200)
```
Call `update()` often (at least every few hundred ms) so the UART buffer does not overflow. Also available: `satellites`, `hdop`, `speed_knots`, `course`, `utc_time`, `date`, `fix_quality`, `bad_checksums`.

## Gotchas
- TX and RX cross over: module TXD -> board RX. Note the header order is RXD before TXD.
- No output or garbage: wrong baud rate (must be 9600) or TXD/RXD swapped.
- No fix indoors is normal. Take it outside, antenna's ceramic side to the sky; a cold start takes 30 s or more. The PPS LED blinks once a second once it has a fix.
- The micro-USB socket is the module's own USB interface (data + power) for u-center on a PC; you don't need it with a microcontroller.
- MicroPython floats on many ports are single precision (about 7 significant digits), roughly 1 m at 4 decimals of longitude.
- Listings often claim 5 V tolerant I/O; the module's absolute maximum is 3.6 V, so use a divider on RXD from 5 V logic.

## Datasheet
https://images-na.ssl-images-amazon.com/images/I/91tuvtrO2jL.pdf (GT-U7 GPS Modules)
u-blox NEO-6: https://content.u-blox.com/sites/default/files/products/documents/NEO-6_DataSheet_%28GPS.G6-HW-09005%29.pdf
Protocol (NMEA/UBX): https://content.u-blox.com/sites/default/files/products/documents/u-blox6_ReceiverDescrProtSpec_%28GPS.G6-SW-10018%29_Public.pdf
