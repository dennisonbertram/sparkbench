---
name: part-pms5003
description: Pinout, electrical limits, wiring and MicroPython driver for the PMS5003 particulate matter (PM1.0 / PM2.5 / PM10) sensor (Plantower PMS5003). Use when designing, wiring, simulating or writing code for a PMS5003 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# PMS5003 particulate matter sensor (PMS5003)

## Overview
The **Plantower PMS5003** pulls air past a laser with a small fan and counts the scattered-light pulses. It reports PM1.0, PM2.5 and PM10 mass concentration in µg/m³ (effective range 0–500, maximum ≥ 1000, resolution 1) and the number of particles above 0.3/0.5/1.0/2.5/5.0/10 µm per 0.1 L of air, over a 9600-baud UART. Hobbyists buy it as the **Adafruit PM2.5 Air Quality Sensor and Breadboard Adapter Kit (#3686)**: the sensor, its 8-wire 1.25 mm cable and a small "1.25T to 2.54" adapter board with a 0.1" header.

## Pinout (Adafruit #3686 adapter board, header order)
| Pin | Function |
|---|---|
| VCC | Supply, 5 V (4.5–5.5 V) |
| GND | Ground (the metal case is grounded too) |
| SET | Sleep control, 3.3 V logic, pulled up inside: high/open = run, low = sleep (optional) |
| RXD | Sensor serial input, 3.3 V logic → board TX (only needed for commands) |
| TXD | Sensor serial output, 3.3 V logic, 9600 baud → board RX |
| RST | Reset, active low, pulled up inside (optional) |
| NC | Not connected; leave open |
| NC | Not connected; leave open |

The adapter's labels follow the sensor's own connector, PIN1–PIN8 in the datasheet.

## Electrical limits
- Supply: 4.5–5.5 V, 5.0 V typical. The fan needs 5 V, so 3.3 V is not enough.
- Current: ≤ 100 mA active, ≤ 200 µA in sleep.
- Data pins: 3.3 V logic (L < 0.8 V, H > 2.7 V). They are fine for ESP32/Pico directly. A 5 V MCU needs a level shifter.
- Operating range: −10 to 60 °C, 0–99 % RH.

## Interface details
- UART 9600 baud, 8 data bits, no parity, 1 stop bit.
- **Active mode** (the power-up default): the sensor sends 32-byte frames unprompted, about every 2.3 s when readings are steady and every 200–800 ms when they change fast.
  - Bytes 0–1: `0x42 0x4D`. Bytes 2–3: frame length = 28.
  - Then 13 big-endian 16-bit words:
    1. PM1.0 CF=1
    2. PM2.5 CF=1
    3. PM10 CF=1
    4. PM1.0 atmospheric
    5. PM2.5 atmospheric
    6. PM10 atmospheric
    7–12. Particle counts above 0.3, 0.5, 1.0, 2.5, 5.0 and 10 µm per 0.1 L
    13. Reserved
  - Bytes 30–31: checksum = 16-bit sum of bytes 0–29.
- Use the **atmospheric** values (words 4–6) for room or outdoor air. The CF=1 values are meant for factory calibration.
- **Commands** (sent to RXD): `0x42 0x4D CMD DATAH DATAL` followed by the 16-bit sum of those 5 bytes.
  - `E1 00 00` switches to passive mode, `E1 00 01` back to active mode.
  - `E2 00 00` reads one frame in passive mode.
  - `E4 00 00` puts the sensor to sleep, `E4 00 01` wakes it.
  - Example: passive read = `42 4D E2 00 00 01 71`.

## Wiring
- ESP32: VCC → 5V (VIN), GND → GND, TXD → GPIO16 (UART2 RX), RXD → GPIO17 (UART2 TX, optional).
- Pico: VCC → VBUS (5 V), GND → GND, TXD → GP1 (UART0 RX), RXD → GP0 (UART0 TX, optional).
- Raspberry Pi 4: VCC → pin 2 (5 V), GND → pin 6, TXD → pin 10 (RXD), RXD → pin 8 (TXD). Disable the serial console first.
- Leave SET, RST and both NC pins unconnected unless you use them.

## Using the driver
```python
from machine import UART, Pin
from pms5003 import PMS5003
uart = UART(2, baudrate=9600, tx=Pin(17), rx=Pin(16))
pms = PMS5003(uart)
r = pms.read()          # waits for the next checksum-valid frame
print('PM1=%d PM2.5=%d PM10=%d' % (r['pm1_0'], r['pm2_5'], r['pm10']))
```
`read()` returns `pm1_0`, `pm2_5` and `pm10` (atmospheric), `pm1_0_cf1`, `pm2_5_cf1` and `pm10_cf1`, and the counts `n0_3` through `n10`. The other methods are `passive_mode()`, `active_mode()`, `request()` (a passive read), `sleep()` and `wake()` (these use the SET pin if you gave one, otherwise a command), and `reset()`.

## Gotchas
- Wire TX to RX: the sensor's TXD goes to the board's RX pin.
- Values are integers in µg/m³. Readings are only stable about 30 s after power-up or wake-up, while the fan spins up.
- If frames never arrive, check for 5 V on VCC (not 3.3 V), that SET is not held low, and the baud rate.
- A checksum mismatch usually means a loose wire or a UART buffer overflow. The driver drops the frame and resyncs on `0x42 0x4D`.
- Mount it at least 20 cm above the floor, and keep the inlet and outlet clear and away from purifier airflow. It is meant for indoor air, so protect it from mist and kitchens.
- In the simulator the sensor streams a frame every second and the CF=1 words equal the atmospheric ones. On a real sensor they differ above about 30 µg/m³.

## Datasheet
https://cdn-shop.adafruit.com/product-files/3686/plantower-pms5003-manual_v2-3.pdf
