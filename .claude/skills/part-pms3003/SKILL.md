---
name: part-pms3003
description: Pinout, electrical limits, wiring and MicroPython driver for the PMS3003 particulate matter (PM1.0 / PM2.5 / PM10) sensor (Plantower PMS3003 / G3). Use when designing, wiring, simulating or writing code for a PMS3003 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# PMS3003 particulate matter sensor (PMS3003)

## Overview
The **Plantower PMS3003** (third generation, "G3") pulls air past a laser with a small fan and works out the dust concentration from the scattered light. It reports PM1.0, PM2.5 and PM10 mass concentration in µg/m³ over a 9600-baud UART. Unlike the PMS5003/PMS7003 it sends **no particle counts**, its frames are **24 bytes** long, and it has **no passive mode or serial commands**. Hobbyists buy it as the **bare sensor with its 8-wire 1.25 mm cable plus the common "1.25 to 2.54 mm" adapter board**, which brings the 8 pins out to a 0.1" header.

## Pinout (sensor connector PIN1–PIN8 = adapter header order)
| Pin | Function |
|---|---|
| VCC | Supply, 5 V |
| GND | Ground |
| SET | Sleep control, 3.3 V logic: high/open = run, low = sleep (optional) |
| RXD | Sensor serial input, 3.3 V logic (the PMS3003 takes no commands; optional) |
| TXD | Sensor serial output, 3.3 V logic, 9600 baud → board RX |
| RESET | Module reset, active low, 3.3 V logic (optional) |
| NC | PIN7, not connected |
| NC | PIN8, not connected |

## Electrical limits
- Supply: 5 V (the fan needs it; 3.3 V is not enough).
- Current: up to about 200 mA while running (vendor manual; Plantower quotes 120 mA typical), standby ≤ 2 mA.
- Data pins: 3.3 V TTL logic. Fine for ESP32/Pico directly. A 5 V MCU needs a level shifter on any pin it drives.
- Response time < 10 s. Operating range about −20 to 50 °C.

## Interface details
- UART 9600 baud, 8 data bits, no parity, 1 stop bit. The sensor streams frames on its own.
- Frame (24 bytes):
  - Bytes 0–1: `0x42 0x4D`. Bytes 2–3: frame length = 2×9+2 = 20.
  - Then 9 big-endian 16-bit words:
    1. PM1.0 CF=1
    2. PM2.5 CF=1
    3. PM10 CF=1
    4. PM1.0 atmospheric
    5. PM2.5 atmospheric
    6. PM10 atmospheric
    7–9. Reserved
  - Bytes 22–23: checksum = 16-bit sum of bytes 0–21.
- Example from the datasheet: `42 4D 00 14 00 51 00 6A 00 77 00 35 00 46 00 4F 33 D2 0F 28 00 3F 04 1A` → atmospheric PM1.0 = 53, PM2.5 = 70, PM10 = 79 µg/m³.
- Use the **atmospheric** values (words 4–6) for room or outdoor air. CF=1 (words 1–3) is the standard-particle (TSI-calibrated) value.

## Wiring
- ESP32: VCC → 5V (VIN), GND → GND, TXD → GPIO16 (UART2 RX). RXD optional.
- Pico: VCC → VBUS (5 V), GND → GND, TXD → GP1 (UART0 RX). RXD optional.
- Raspberry Pi 4: VCC → pin 2 (5 V), GND → pin 6, TXD → pin 10 (RXD). Disable the serial console first.
- Leave SET, RESET and both NC pins unconnected unless you use them.

## Using the driver
```python
from machine import UART, Pin
from pms3003 import PMS3003
uart = UART(2, baudrate=9600, tx=Pin(17), rx=Pin(16))
pms = PMS3003(uart)
r = pms.read()          # waits for the next checksum-valid frame
print('PM1=%d PM2.5=%d PM10=%d' % (r['pm1_0'], r['pm2_5'], r['pm10']))
```
`read()` returns `pm1_0`, `pm2_5` and `pm10` (atmospheric) and `pm1_0_cf1`, `pm2_5_cf1` and `pm10_cf1`. Pass `set_pin=` / `reset_pin=` (machine.Pin outputs) to use `sleep()`, `wake()` and `reset()`; the PMS3003 has no serial sleep command. `flush()` drops stale buffered bytes.

## Gotchas
- Wire TX to RX: the sensor's TXD goes to the board's RX pin.
- Code written for the PMS5003/PMS7003 (32-byte frames, length 28) will never find a valid PMS3003 frame. Look for length 20 and 24 bytes.
- Readings are only stable about 30 s after power-up or wake-up, while the fan spins up.
- If frames never arrive, check for 5 V on VCC, that SET is not held low, and the baud rate.
- In the simulator the sensor streams a frame every second and the CF=1 words equal the atmospheric ones. On a real sensor they differ.

## Datasheet
https://github.com/avaldebe/AQmon/raw/master/Documents/PMS3003_LOGOELE.pdf
