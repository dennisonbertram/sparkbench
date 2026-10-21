---
name: part-dht11
description: Pinout, electrical limits, wiring and MicroPython usage for the DHT11 temperature & humidity sensor on a KY-015 module (Aosong DHT11). Use when designing, wiring, simulating or writing code for a DHT11 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# DHT11 temperature & humidity module (DHT11, KY-015)

## Overview
The **Aosong DHT11** is a basic temperature (0 to 50 °C, ±2 °C) and relative humidity (20–90 %RH, ±5 %RH) sensor with its own single-wire digital protocol (not I2C, not Dallas 1-Wire). Hobbyists buy it on the **KY-015 module** (37-in-1 sensor kit board) with the DATA pull-up resistor already fitted and a 3-pin header.

## Pinout (KY-015 module, header order)
| Pin | Function |
|---|---|
| S | DATA, single-wire bidirectional data (pull-up on the board) |
| + | Supply, 3.3–5.5 V |
| - | Ground |

Some clones order the pins differently: follow the labels printed on your board.

## Electrical limits
- Supply: 3.3–5.5 V DC.
- Current: about 0.3 mA while measuring, 60 µA standby.
- On 3.3 V keep the cable under 1 m; the bare sensor needs about 5.1 kΩ pull-up (fitted on the KY-015).

## Interface details
- Host pulls DATA low for at least 18 ms, then releases it; the sensor answers 80 µs low + 80 µs high, then sends 40 bits (each bit: 50 µs low, then 26–28 µs high = 0 or 70 µs high = 1).
- Data: humidity integer, humidity decimal, temperature integer, temperature decimal, checksum = low 8 bits of the sum of the first four bytes.
- Resolution 1 °C / 1 %RH. Sample no faster than every 1–2 s; each read returns the previous measurement.
- MicroPython's built-in `dht` module implements all of this (including the checksum), so no extra driver file is needed.

## Wiring
- ESP32: + → 3V3, - → GND, S → any output-capable GPIO (e.g. GPIO25; not GPIO 34–39).
- Pico: + → 3V3(OUT), - → GND, S → GP2.
- Raspberry Pi 4: + → pin 1 (3.3 V), - → pin 6, S → GPIO4 (pin 7), read with adafruit_dht.

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
- `OSError` from `measure()` means no answer or a bad checksum: check wiring and that you are not reading faster than every 2 s; catch it and retry.
- Wait about 1 s after power-up before the first read.
- Whole-number readings only; for 0.1 °C resolution or below-zero temperatures use a DHT22/AM2302.
- Keep it away from the regulator and the microcontroller, which warm the air nearby.

## Datasheet
https://components101.com/sites/default/files/component_datasheet/DHT11-Temperature-Sensor.pdf
