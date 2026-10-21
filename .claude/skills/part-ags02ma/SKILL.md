---
name: part-ags02ma
description: Pinout, electrical limits, wiring and MicroPython driver for the AGS02MA TVOC gas sensor (Aosong/ASAIR AGS02MA, Adafruit 5593). Use when designing, wiring, simulating or writing code for an AGS02MA in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# AGS02MA TVOC gas sensor (AGS02MA)

## Overview
The **AGS02MA** from Aosong (ASAIR) is a MEMS metal-oxide gas sensor with its own ASIC. It reports total volatile organic compounds (TVOC) from 0 to 99999 ppb, calibrated with ethanol, ±25 % of the reading. It talks I2C, but **only slowly (30 kHz max)**. Hobbyists buy it as the **Adafruit AGS02MA I2C TVOC Gas Sensor (PID 5593)**: the bare 4-lead sensor with no pull-ups.

## Pinout (sensor leads, left to right, front view)
| Pin | Function |
|---|---|
| VDD | Supply, 3.3–5.5 V |
| SDA | I2C data (needs a 1–10 kΩ pull-up to VDD) |
| GND | Ground |
| SCL | I2C clock (needs a 1–10 kΩ pull-up to VDD) |

The leads sit on a 2.5 mm pitch, close enough for a 2.54 mm breadboard or socket.

## Electrical limits
- Supply: 3.3–5.5 V DC. Anything above 5.5 V, or reversed polarity, destroys it.
- Current: 28 ± 5 mA (heater), so feed it from the 3V3 rail, not a GPIO.
- I2C: **≤ 30 kHz**. Use 20 kHz.
- Preheat ≥ 120 s; sampling period ≥ 2 s; operating range 0–50 °C, 0–95 %RH.

## Interface details
- **I2C address 0x1A** (can be changed and saved with register 0x21).
- After any write, wait 30 ms before the next write or read.
- TVOC: write register **0x00**, wait 30 ms, read 5 bytes: status, TVOC bits 23–16, 15–8, 7–0 (ppb), CRC.
- Status bit 0 **RDY**: 0 = data ready, 1 = not ready or still preheating. Bits 3–1 = 000 means the unit is ppb.
- Do not read TVOC more often than every 1.5 s or RDY stays 1.
- Resistance: register 0x20, 4 data bytes MSB first, unit 0.1 kΩ. Version: register 0x11, Data4.
- Zero-point calibration (in fresh air, after 5 min powered): write 0x01 then 0x00 0x0C 0xFF 0xF3 0xFC. It is lost at power-off.
- CRC-8 over Data1–Data4: polynomial 0x31, initial value 0xFF.

## Wiring
- ESP32: VDD → 3V3, GND → GND, SDA → D21, SCL → D22, plus 10 kΩ from SDA and from SCL to 3V3.
- Pico: VDD → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5, plus 10 kΩ pull-ups to 3V3.
- Raspberry Pi 4: VDD → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5 (the Pi has 1.8 kΩ pull-ups already). Set the I2C clock to 20 kHz with `dtparam=i2c_arm_baudrate=20000`.

## Using the driver
```python
from machine import I2C, Pin
import time
from ags02ma import AGS02MA
i2c = I2C(0, sda=Pin(21), scl=Pin(22), freq=20000)
s = AGS02MA(i2c)
while True:
    ppb = s.tvoc()          # None while preheating (RDY = 1)
    print('warming up' if ppb is None else 'TVOC=%dppb' % ppb)
    time.sleep(2)
```

## Gotchas
- It will **not** answer at 100 or 400 kHz. Boards that can't clock I2C that slowly (e.g. SAMD21/SAMD51) can't use it. Other sensors on the same bus must also run at 20 kHz.
- If there are no pull-ups, or the supply is below 3.0 V, it won't communicate.
- New sensors read high at first. Burn them in: 12 h if stored up to a week, 72–96 h if stored longer.
- Keep it out of direct airflow, away from silicone sealants, and never blow lighter gas on it.

## Datasheet
https://cdn-shop.adafruit.com/product-files/5593/datasheet+ags02ma.pdf
