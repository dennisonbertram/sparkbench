---
name: part-neo-m8n
description: Pinout, electrical limits, wiring and MicroPython driver for the u-blox NEO-M8N GPS/GNSS module (NEO-M8N, GY-GPSV3-NEO-M8N). Use when designing, wiring, simulating or writing code for a NEO-M8N in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# NEO-M8N GPS module (NEO-M8N)

## Overview
The **u-blox NEO-M8N** is a concurrent GNSS receiver: by default it tracks GPS and GLONASS together (BeiDou or Galileo can be enabled). It streams NMEA 0183 sentences over a UART at 9600 baud, once per second. Hobbyists buy it on the **GY-GPSV3-NEO-M8N** module (silkscreen HW-448), which adds a 3.3 V regulator, a backup battery, an EEPROM, a fix LED and a U.FL socket for the ceramic patch antenna.

## Pinout (GY-GPSV3-NEO-M8N, header order)
| Pin | Function |
|---|---|
| VCC | Supply, 3.3–5 V (on-board regulator) |
| RX | Module serial input, 3.3 V logic (optional, for configuration) |
| TX | Module serial output, NMEA 9600 baud 8N1 |
| GND | Ground |

## Electrical limits
- Chip supply 2.7–3.6 V (absolute max 3.6 V); the module's regulator accepts 3.3–5 V on VCC.
- Current: about 32 mA acquiring, 30 mA tracking (GPS + GLONASS, 3 V); peak up to 67 mA.
- I/O pins: 3.3 V logic, absolute max 3.6 V. Do not drive RX from a 5 V UART without a level shifter.

## Interface details
- UART 9600 baud, 8N1, autobauding off (datasheet "Default messages").
- Default NMEA output: GGA, GLL, GSA, GSV, RMC, VTG, TXT at 1 Hz. With GPS + GLONASS the talker ID is **GN** ($GNGGA, $GNRMC); GPS-only gives $GP...
- Checksum: XOR of every character between `$` and `*`, as two hex digits.
- GGA: time, lat `ddmm.mmmmm`,N/S, lon `dddmm.mmmmm`,E/W, fix quality, satellites, HDOP, altitude (m MSL).
- RMC: time, status A/V, lat, lon, speed (knots), course, date `ddmmyy`.
- Degrees = dd + mm.mmmmm / 60, negative for S and W.

## Wiring
- ESP32: VCC → 3V3 (or 5V/VIN), GND → GND, TX → GPIO16 (RX2), RX → GPIO17 (TX2).
- Pico: VCC → 3V3(OUT) (or VBUS), GND → GND, TX → GP1 (UART0 RX), RX → GP0 (UART0 TX).
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, TX → pin 10 (RXD), RX → pin 8 (TXD).

## Using the driver
```python
from machine import UART, Pin
import time
from neom8n import NEOM8N
gps = NEOM8N(UART(2, baudrate=9600, tx=Pin(17), rx=Pin(16)))
while True:
    if gps.update() and gps.fix:
        print('LAT=%.4f LON=%.4f ALT=%.1fm' % (gps.latitude, gps.longitude, gps.altitude or 0))
    time.sleep_ms(200)
```

## Gotchas
- Code that only matches `$GPGGA` never sees a fix on a NEO-M8N; match the sentence type after the two-letter talker ID (the driver does this). The Sparkbench simulator sends $GP sentences; the real module sends $GN.
- Garbage characters mean the wrong baud rate; the factory default is 9600.
- Cold start needs a clear sky view: about 26 s outdoors, often never indoors. The fix LED blinks once a second only when it has a fix.
- The antenna must be plugged into the U.FL socket, ceramic side facing the sky.

## Datasheet
https://content.u-blox.com/sites/default/files/NEO-M8-FW3_DataSheet_UBX-15031086.pdf
