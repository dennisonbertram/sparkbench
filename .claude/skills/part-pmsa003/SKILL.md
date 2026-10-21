---
name: part-pmsa003
description: Pinout, electrical limits, wiring and MicroPython driver for the Plantower PMSA003 laser particulate (PM1.0 / PM2.5 / PM10) sensor (PMSA003). Use when designing, wiring, simulating or writing code for a PMSA003 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# PMSA003 particulate matter sensor (PMSA003)

## Overview
The **Plantower PMSA003** blows air past a laser and counts the light flashes from dust, smoke and pollen. It reports PM1.0, PM2.5 and PM10 mass concentration (µg/m³, 0–500 effective range, ≥1000 maximum, 1 µg/m³ resolution) and particle counts per 0.1 L, over a UART at 9600 baud. The sensor has a tiny 2×5 1.27 mm socket, so hobbyists buy it **with its adapter board**, which brings out a 4-pin 2.54 mm header (GND, VCC, RX, TX). SET and RESET are not on that header; both are pulled up inside the sensor.

## Pinout (adapter board 4-pin header, header order)
| Pin | Function |
|---|---|
| GND | Ground (pin 1, arrow on the silkscreen) |
| VCC | Supply 5 V (4.5–5.5 V), feeds the fan |
| RX | Sensor serial input (3.3 V logic): to the MCU's TX. Only needed for commands |
| TX | Sensor serial output (3.3 V logic, 9600 8N1): to the MCU's RX |

Sensor connector itself (for reference): 1–2 VCC, 3–4 GND, 5 RESET (low = reset), 6 NC, 7 RX, 8 NC, 9 TX, 10 SET (high/open = run, low = sleep).

## Electrical limits
- Supply: 4.5–5.5 V (typ. 5.0 V). Active current ≤ 100 mA, standby ≤ 200 µA.
- Logic: 3.3 V TTL (L < 0.8 V, H > 2.7 V). Use a level shifter with a 5 V microcontroller.
- Operating: −10 to +60 °C, 0–99 % RH (non-condensing).

## Interface details
- UART 9600 baud, 8 data bits, no parity, 1 stop bit.
- **Active mode** (default after power-up): sends a 32-byte frame by itself every ~2.3 s (stable air) or every 0.2–0.8 s (fast-changing air).
- Frame: `0x42 0x4D`, frame length (2 bytes, = 28), then 13 big-endian 16-bit words:
  1–3 PM1.0 / PM2.5 / PM10 CF=1 (factory), 4–6 PM1.0 / PM2.5 / PM10 atmospheric environment (use these),
  7–12 particle counts > 0.3 / 0.5 / 1.0 / 2.5 / 5.0 / 10 µm per 0.1 L, 13 reserved,
  then check code = 16-bit sum of the previous 30 bytes, high byte first.
- Commands (host → sensor): `42 4D CMD DATAH DATAL LRCH LRCL`, LRC = 16-bit sum of the first 5 bytes.
  - `E2 00 00` read one frame in passive mode → `42 4D E2 00 00 01 71`
  - `E1 00 00` passive mode, `E1 00 01` active mode
  - `E4 00 00` sleep, `E4 00 01` wake up (wait ≥ 30 s after waking for stable data)

## Wiring
- ESP32: VCC → VIN (5 V from USB), GND → GND, TX → GPIO16 (UART2 RX), RX → GPIO17 (UART2 TX).
- Pico: VCC → VBUS (pin 40), GND → GND, TX → GP1 (UART0 RX), RX → GP0 (UART0 TX).
- Raspberry Pi 4: VCC → pin 2 (5 V), GND → pin 6, TX → pin 10 (GPIO15 RXD), RX → pin 8 (GPIO14 TXD). Disable the serial console first.

## Using the driver
```python
from machine import UART, Pin
from pmsa003 import PMSA003
uart = UART(2, baudrate=9600, tx=Pin(17), rx=Pin(16))
r = PMSA003(uart).read()
if r:
    print('PM1=%d PM2.5=%d PM10=%d ug/m3' % (r['pm1_0'], r['pm2_5'], r['pm10']))
```
`read()` syncs on 0x42 0x4D, checks the frame length and the sum, and returns a dict (or None on timeout). `set_passive()` / `read_passive()`, `sleep()` / `wake()` send the datasheet commands (they need RX wired).

## Gotchas
- 3.3 V on VCC: the fan barely turns or stops, and readings are nonsense. Use 5 V.
- Swapped TX/RX gives no data at all: the sensor's TX goes to the MCU's RX.
- Wait ~30 s after power-up for the fan to settle before logging.
- The metal case is grounded; keep it off other circuitry. Keep inlet and outlet clear and do not put it in an air purifier's air stream.
- CF=1 values read higher than atmospheric values at high concentrations; for air-quality indexes use the atmospheric ones.

## Datasheet
https://download.kamami.pl/p566824-pmsa003f.pdf
