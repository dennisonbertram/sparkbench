---
name: part-sfa30
description: Pinout, electrical limits, wiring and MicroPython driver for the Sensirion SFA30 formaldehyde (HCHO) sensor module with humidity & temperature output (SFA30-D-T) in I2C mode. Use when designing, wiring, simulating or writing code for an SFA30 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# SFA30 formaldehyde sensor (SFA30-D-T)

## Overview
The **Sensirion SFA30** is an electrochemical formaldehyde (HCHO) sensor module rated for 0–1000 ppb (1 ppb resolution, ±20 ppb or ±20 %). An on-board Sensirion SHT sensor compensates for humidity and temperature and reports both. It measures every 0.5 s and each read returns the average since the previous read. It speaks UART (SHDLC) or I2C; this part uses **I2C** (SEL tied to GND). Hobbyists buy the **SFA30-D-T module** (alone or in the SEK-SFA30 kit) and wire its Molex Micro-Lock Plus 1.25 mm 7-pin connector out with jumper leads.

## Pinout (Molex 7-pin connector, pin 1 to pin 5; pins 6 and 7 are NC)
| Pin | Function |
|---|---|
| VDD | Supply, 3.15–5.5 V |
| GND | Ground |
| SDA | I2C data (RX in UART mode), open-drain |
| SCL | I2C clock (TX in UART mode), open-drain |
| SEL | Interface select: GND = I2C, floating/VDD = UART |

## Electrical limits
- Supply 3.15–5.5 V (absolute max 6.0 V); 1 mA average (2 mA max) measuring, 2.5–5 mA peak, 0.5 mA idle.
- I/O: VIH ≥ 1.75 V, VIL ≤ 0.9 V, inputs up to 5.5 V. I2C levels follow the supply voltage.
- I2C standard mode only (100 kHz). Operating range 0–40 °C (rated), 10–90 %RH non-condensing.

## Interface details
- **I2C address 0x5D.** Commands are 16-bit, sent MSB first with no CRC. Each 2-byte data word is followed by a CRC-8 (poly 0x31, init 0xFF; CRC(0xBEEF) = 0x92).
- Start continuous measurement `00 06` (only from idle). Stop `01 04`. Reset `D3 04`. Device marking `D0 60` (48 bytes).
- Read measured values: write `03 27`, wait 5 ms, read 9 bytes = 3 × (int16 MSB, LSB, CRC):
  - HCHO [ppb] = raw / 5
  - RH [%] = raw / 100
  - T [°C] = raw / 200 (two's complement)
- There is no result for the first 0.5 s after start. HCHO reads 0 for 10 s after power-up.

## Wiring
- Pull-ups: 10 kΩ from SDA and from SCL to the bus voltage (3.3 V on ESP32/Pico). The module has none.
- ESP32: VDD → 3V3, GND → GND, SEL → GND, SDA → D21, SCL → D22.
- Pico: VDD → 3V3(OUT), GND → GND, SEL → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VDD → pin 1 (3.3 V), GND → pin 6, SEL → pin 9 (GND), SDA → pin 3, SCL → pin 5. The Pi already has 1.8 kΩ pull-ups.

## Using the driver
```python
from machine import I2C, Pin
from sfa30 import SFA30
i2c = I2C(0, sda=Pin(21), scl=Pin(22), freq=100000)
s = SFA30(i2c)
s.start()                  # waits 600 ms for the first result
hcho, rh, t = s.read()     # ppb, %RH, degC
```

## Gotchas
- SEL must be at GND when the module powers up, or it stays in UART mode and never answers at 0x5D.
- Sensirion calls the I2C interface preliminary and recommends UART for cables over 20 cm. Keep I2C leads under 10 cm.
- Read at least once every 60 s. Slower reads switch the averaging to exponential smoothing, which tracks roughly the last minute.
- A CRC mismatch nearly always means missing pull-ups, a long cable, or a bus speed above 100 kHz.
- Do not press on the electrochemical cell (orange top / black bottom), and keep the marked clear area unobstructed.

## Datasheet
https://static.chipdip.ru/lib/228/DOC011228506.pdf (SFA30 datasheet V1.1)
https://sensirion.com/en/media/documents/974A16B3/634D0684/Sensirion_Formaldehyde_Sensor_I2C_Interface.pdf (I2C interface)
