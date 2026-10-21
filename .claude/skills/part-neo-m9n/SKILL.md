---
name: part-neo-m9n
description: Pinout, electrical limits, wiring and MicroPython driver for the u-blox NEO-M9N GPS/GNSS receiver on the SparkFun GPS Breakout NEO-M9N (GPS-15712 U.FL, GPS-15733 chip antenna, GPS-17285 SMA). Use when designing, wiring, simulating or writing code for a NEO-M9N in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# NEO-M9N GPS breakout (NEO-M9N)

## Overview
The **u-blox NEO-M9N** is a 92-channel GNSS receiver that tracks GPS, GLONASS, Galileo and BeiDou concurrently (about 1.5 m accuracy, up to 25 Hz). By default it streams NMEA 0183 sentences once per second on its UART at **38400 baud** (and on I2C/SPI/USB). Hobbyists buy it as the **SparkFun GPS Breakout - NEO-M9N** (GPS-15712 U.FL, GPS-15733 chip antenna, GPS-17285 SMA). The breakout adds a 3.3 V regulator for its 5V pin, a rechargeable backup battery, two Qwiic connectors, USB-C, and PTH headers on two edges.

## Pinout (SparkFun GPS-15712, top header, left to right)
| Pin | Function |
|---|---|
| GND | Ground |
| 5V | Optional 5 V input (max 6 V) to the on-board 3.3 V regulator; leave open when 3V3 is powered |
| 3V3 | 3.3 V supply straight to the NEO-M9N VCC (2.7-3.6 V) |
| CS | I2C SDA (default) / SPI chip select when D_SEL is closed |
| RX/MOSI | UART input, 3.3 V logic (optional, for configuration) |
| TX/MISO | UART output, NMEA 38400 baud 8N1 |
| SCK | I2C SCL (default) / SPI clock when D_SEL is closed |

Bottom edge (optional, not modelled): PPS, RST, SAFE, INT, GND, 3V3, SDA, SCL.

## Electrical limits
- Chip VCC 2.7-3.6 V (absolute max 3.6 V). The 5V pin accepts up to 6 V through the regulator.
- Current: 50 mA acquisition / 36 mA tracking with all four GNSS (3.0 V, 1 Hz); peak 100 mA.
- I/O: 3.3 V logic, inputs must not exceed VCC (absolute max 3.6 V). No level shifting on the board; never drive RX/MOSI from a 5 V UART.

## Interface details
- UART default 38400 baud, 8N1 (datasheet 5.5 "Default interface settings"); configurable 4800-921600.
- D_SEL open (default) = UART + I2C; D_SEL to GND (SparkFun jumper closed) = SPI, which disables the UART.
- Default NMEA output: GGA, GLL, GSA, GSV, RMC, VTG, TXT at 1 Hz, no UBX. Multi-GNSS position sentences use the **GN** talker ($GNGGA, $GNRMC).
- Checksum: XOR of every character between `$` and `*`, as two hex digits.
- GGA: time, lat `ddmm.mmmmm`,N/S, lon `dddmm.mmmmm`,E/W, fix quality, satellites, HDOP, altitude (m MSL).
- RMC: time, status A/V, lat, lon, speed (knots), course, date `ddmmyy`.
- Degrees = dd + mm.mmmmm / 60, negative for S and W.

## Wiring
- ESP32: 3V3 → 3V3, GND → GND, TX/MISO → GPIO16 (RX2), RX/MOSI → GPIO17 (TX2).
- Pico: 3V3 → 3V3(OUT), GND → GND, TX/MISO → GP1 (UART0 RX), RX/MOSI → GP0 (UART0 TX).
- Raspberry Pi 4: 3V3 → pin 1, GND → pin 6, TX/MISO → pin 10 (RXD), RX/MOSI → pin 8 (TXD); set the serial port to 38400.

## Using the driver
```python
from machine import UART, Pin
import time
from neom9n import NEOM9N
gps = NEOM9N(UART(2, baudrate=38400, tx=Pin(17), rx=Pin(16)))
while True:
    if gps.update() and gps.fix:
        print('LAT=%.4f LON=%.4f ALT=%.1fm' % (gps.latitude, gps.longitude, gps.altitude or 0))
    time.sleep_ms(100)
```

## Gotchas
- 38400 baud, not 9600: code copied from NEO-6M/M8N projects prints garbage until the baud rate is changed.
- Default NMEA output includes GSV for four constellations, so it is a lot of text per second; call `update()` often (every 100 ms or so) so the UART buffer does not overflow. Use a bigger `rxbuf=` on the UART if needed.
- Match the sentence type after the two-letter talker ID; the real module sends $GN..., the Sparkbench simulator sends $GP... The driver handles both.
- Closing the D_SEL jumper switches the header to SPI and the UART goes silent.
- The U.FL version needs an antenna plugged in with a view of the sky; cold start about 24 s, hot start about 2 s thanks to the backup battery.

## Datasheet
https://content.u-blox.com/sites/default/files/NEO-M9N-00B_DataSheet_UBX-19014285.pdf
