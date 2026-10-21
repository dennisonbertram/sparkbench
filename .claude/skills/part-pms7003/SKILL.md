---
name: part-pms7003
description: Pinout, electrical limits, wiring and MicroPython driver for the PMS7003 particulate matter (PM1.0 / PM2.5 / PM10) sensor (Plantower PMS7003, on the Soldered 333058 adapter). Use when designing, wiring, simulating or writing code for a PMS7003 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# PMS7003 particulate matter sensor (PMS7003)

## Overview
The **Plantower PMS7003** is a slim (48×37×12 mm) laser dust sensor. A small fan pulls air past a laser, and the sensor counts the light the particles scatter. It reports PM1.0, PM2.5 and PM10 mass concentration in µg/m³ (effective range 0–500, maximum ≥ 1000, resolution 1). It also reports the number of particles above 0.3, 0.5, 1.0, 2.5, 5.0 and 10 µm in 0.1 L of air. Data comes out of a 9600-baud UART. The sensor's own connector is a 1.27 mm 2×5 header, which does not fit a breadboard. Hobbyists plug it into the **Soldered PMS7003 sensor adapter (333058)**. The adapter has a 2×5 1.27 mm socket, a 6-pin 0.1" header and a TPS613222A boost converter that turns 3.3 V into the 5 V the fan needs.

## Pinout (Soldered 333058 adapter, header order)
| Pin | Function |
|---|---|
| VCC | Supply, 3.3 V (3.0–5.5 V). The boost converter makes 5 V for the sensor. |
| GND | Ground. The sensor's metal case is grounded too. |
| RX | Sensor serial input, 3.3 V logic. Wire it to the board's TX. Only needed for commands. |
| TX | Sensor serial output, 3.3 V logic, 9600 baud. Wire it to the board's RX. |
| RESET | Reset, active low, pulled up inside. Optional. |
| SET | Sleep control, pulled up inside: high or open = run, low = sleep. Optional. |

The sensor's own connector, from the datasheet:
- 1, 2: VCC 5 V
- 3, 4: GND
- 5: RESET
- 6, 8: NC
- 7: RX
- 9: TX
- 10: SET

## Electrical limits
- Sensor: 4.5–5.5 V (5.0 V typical), ≤ 100 mA active, ≤ 200 µA in sleep.
- Adapter VCC: 3.3 V nominal. The TPS613222A accepts 0.9–5.5 V but needs about 3 V to supply the fan's current. Allow about 180 mA from 3.3 V.
- Data pins: 3.3 V logic (L < 0.8 V, H > 2.7 V). They connect straight to an ESP32 or Pico. A 5 V MCU needs a level shifter.
- Operating range: −10 to 60 °C, 0–99 % RH.

## Interface details
- UART 9600 baud, 8 data bits, no parity, 1 stop bit.
- **Active mode** is the power-up default. The sensor sends 32-byte frames unprompted, every 2.3 s when readings are steady and every 200–800 ms when they change fast.
- Frame layout:
  - Bytes 0–1: `0x42 0x4D`.
  - Bytes 2–3: frame length, 28.
  - Then 13 big-endian 16-bit words:
    1. PM1.0, CF=1
    2. PM2.5, CF=1
    3. PM10, CF=1
    4. PM1.0, atmospheric
    5. PM2.5, atmospheric
    6. PM10, atmospheric
    7–12. Particle counts above 0.3, 0.5, 1.0, 2.5, 5.0 and 10 µm per 0.1 L
    13. Reserved
  - Bytes 30–31: check code, the 16-bit sum of bytes 0–29.
- Use the **atmospheric** values (words 4–6). The CF=1 values are for the factory environment.
- **Commands** go to the sensor's RX: `0x42 0x4D CMD DATAH DATAL`, then the 16-bit sum of those 5 bytes.
  - `E1 00 00`: switch to passive mode. `E1 00 01`: switch back to active mode.
  - `E2 00 00`: read one frame in passive mode, e.g. `42 4D E2 00 00 01 71`.
  - `E4 00 00`: sleep. `E4 00 01`: wake up.

## Wiring
- **ESP32:** VCC → 3V3, GND → GND, TX → GPIO16 (UART2 RX), RX → GPIO17 (UART2 TX, optional).
- **Pico:** VCC → 3V3(OUT), GND → GND, TX → GP1 (UART0 RX), RX → GP0 (UART0 TX, optional).
- **Raspberry Pi 4:** VCC → pin 1 (3.3 V), GND → pin 6, TX → pin 10 (RXD), RX → pin 8 (TXD). Disable the serial console first.
- Leave SET and RESET unconnected unless you use them.

## Using the driver
```python
from machine import UART, Pin
from pms7003 import PMS7003
uart = UART(2, baudrate=9600, tx=Pin(17), rx=Pin(16))
pms = PMS7003(uart)
r = pms.read()          # waits for the next checksum-valid frame
print('PM1=%d PM2.5=%d PM10=%d' % (r['pm1_0'], r['pm2_5'], r['pm10']))
```
`read()` returns a dict with these keys:
- `pm1_0`, `pm2_5`, `pm10`: atmospheric values.
- `pm1_0_cf1`, `pm2_5_cf1`, `pm10_cf1`: CF=1 values.
- `n0_3` through `n10`: particle counts.

Other methods:
- `passive_mode()` and `active_mode()` switch modes.
- `request()` does a passive read.
- `sleep()` and `wake()` use the SET pin if you gave one, otherwise a command.
- `reset()` pulses RESET.

## Gotchas
- Cross the serial lines: the adapter's TX is the sensor's output and goes to the board's RX.
- Readings are integers in µg/m³. They are only stable at least 30 s after power-up or wake-up, while the fan spins up.
- If no frames arrive, check:
  - the supply,
  - that SET is not held low,
  - that the 2×5 ribbon or socket is seated the right way round,
  - the baud rate.
- A checksum mismatch usually means a loose wire. The driver drops that frame and resyncs on `0x42 0x4D`.
- Placement:
  - Mount it at least 20 cm above the floor.
  - Keep the inlet and outlet clear and out of an air purifier's airflow.
  - It is meant for indoor air. Protect it from mist, kitchens and outdoor use.
- In the simulator, the sensor streams a frame every 2.3 s and the CF=1 words equal the atmospheric ones. On a real sensor they differ at higher concentrations.

## Datasheet
https://download.kamami.pl/p564008-PMS7003%20series%20data%20manua_English_V2.5.pdf

Adapter design files: https://github.com/SolderedElectronics/PMS7003-sensor-adapter-hardware-design
