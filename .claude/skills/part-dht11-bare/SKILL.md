---
name: part-dht11-bare
description: Pinout, electrical limits, wiring and MicroPython usage for the bare 4-pin Aosong DHT11 temperature & humidity sensor (needs an external pull-up on DATA). Use when designing, wiring, simulating or writing code for a bare DHT11 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# DHT11 temperature & humidity sensor, bare 4-pin (DHT11)

## Overview
The **Aosong DHT11** is a basic temperature (±2 °C) and relative humidity (±5 %RH) sensor with its own single-wire digital protocol (not I2C, not Dallas 1-Wire). This is the **bare blue 4-pin sensor** (e.g. Adafruit #386, which ships with a 4.7 kΩ or 10 kΩ resistor). It has **no pull-up on DATA**: you must fit one (10 kΩ from DATA to VCC; the datasheet recommends 4.7 kΩ for cables up to 5 m).

## Pinout (pins 1-4 from the left, grille facing you)
| Pin | Name | Function |
|---|---|---|
| 1 | VCC | Supply, 3.3–5.5 V |
| 2 | DATA | Single-wire bidirectional data, needs external pull-up to VCC |
| 3 | NC | Not connected: leave it unconnected |
| 4 | GND | Ground |

## Electrical limits
- Supply: 3.3–5.5 V DC (5 V typical).
- Current: 60 µA standby, up to 1 mA while measuring (Adafruit lists 2.5 mA max during conversion).
- Pull-up on DATA: 4.7 kΩ (datasheet, cable < 5 m) to 10 kΩ (common for short breadboard wiring).
- On 3.3 V keep the cable short; a long cable starves the sensor and skews readings.

## Interface details
- Host pulls DATA low for at least 18 ms (max 30 ms), then releases it; the sensor answers 83 µs low + 87 µs high, then sends 40 bits (each bit: 54 µs low, then 23–27 µs high = 0 or 68–74 µs high = 1).
- Data: humidity integer, humidity decimal (0), temperature integer, temperature decimal, checksum = low 8 bits of the sum of the first four bytes.
- Resolution 1 °C / 1 %RH. Read no more often than every 2 s; each read returns the previous measurement.
- MicroPython's built-in `dht` module implements all of this (including the checksum), so no extra driver file is needed.

## Wiring
- ESP32: VCC → 3V3, GND → GND, DATA → GPIO25 (any output-capable GPIO; not 34–39), 10 kΩ from DATA to 3V3, NC unconnected.
- Pico: VCC → 3V3(OUT), GND → GND, DATA → GP2, 10 kΩ from DATA to 3V3.
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, DATA → GPIO4 (pin 7) with 10 kΩ to 3.3 V, read with adafruit_dht.

## Using it
```python
from machine import Pin
import dht, time
sensor = dht.DHT11(Pin(25))
while True:
    sensor.measure()
    print('T=%dC H=%d%%' % (sensor.temperature(), sensor.humidity()))
    time.sleep(2)
```

## Gotchas
- `OSError` from `measure()` means no answer or a bad checksum: check the pull-up, the wiring, and that you are not reading faster than every 2 s; catch it and retry.
- Forgetting the pull-up is the most common fault (the MCU's internal ~45 kΩ pull-up is too weak to be reliable).
- Wait about 1 s after power-up before the first read; after a long pause the first reading is stale.
- Whole-number readings only, and MicroPython's DHT11 class ignores the sign bit newer DHT11s use below 0 °C: use it for 0–50 °C. For better accuracy or sub-zero use a DHT22/AM2302.
- Hand-solder at most 300 °C for under 3 s; no wave soldering, no cleaning liquids.

## Datasheet
https://akizukidenshi.com/goodsaffix/DHT11_20180119.pdf
