---
name: part-scd30
description: Pinout, electrical limits, wiring and MicroPython driver for the SCD30 CO2, temperature & humidity sensor module (Sensirion SCD30). Use when designing, wiring, simulating or writing code for an SCD30 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# SCD30 CO2 sensor module (SCD30)

## Overview
The **SCD30** from Sensirion is a true NDIR CO2 sensor module: it outputs 0–40000 ppm, accurate to ±(30 ppm + 3 %) from 400–10000 ppm, and also reports temperature and relative humidity. Over I2C it returns all three as 32-bit floats, with a new reading every 2 s by default. Hobbyists buy the **bare Sensirion SCD30 module** (article 1-101625-10, also sold by SparkFun as SEN-15112). It has one row of 7 holes at 2.54 mm pitch and no regulator. SDA/SCL already have 45 k pull-ups to 3 V inside the module.

## Pinout (Sensirion SCD30 module, header order)
| Pin | Function |
|---|---|
| VDD | Supply, 3.3–5.5 V |
| GND | Ground |
| SCL (printed TX/SCL) | I2C clock (Modbus TX when SEL is high) |
| SDA (printed RX/SDA) | I2C data (Modbus RX when SEL is high) |
| RDY | Data-ready output, high when a reading is waiting (optional) |
| PWM | PWM CO2 output, 0–5000 ppm (optional, not used with I2C) |
| SEL | Interface select: floating/GND = I2C, high = Modbus |

## Electrical limits
- Supply: 3.3–5.5 V (absolute max 6.0 V).
- Current: 19 mA average at the 2 s interval, peaks of 75 mA while measuring.
- I2C input high level max **3.0 V**. The lines are pulled to 3 V inside the module, so never pull them up to 5 V.
- I2C at most 100 kHz; Sensirion recommends **50 kHz or less**. The sensor stretches the clock (30 ms, up to 150 ms about once a day) and does not support repeated start.

## Interface details
- **I2C address 0x61** (fixed).
- Commands are 16-bit, MSB first. Any 16-bit argument is followed by its CRC. Every word the sensor returns is followed by a CRC-8 (poly 0x31, init 0xFF; CRC(0xBEEF) = 0x92).
- `trigger_continuous_measurement` **0x0010** + pressure in mbar (0 = off): `00 10 00 00 81`. The sensor remembers this across power cycles.
- `stop_continuous_measurement` **0x0104**. `set_measurement_interval` **0x4600** + 2–1800 s.
- `get_data_ready_status` **0x0202**: wait > 3 ms, then read 3 bytes. The word is 1 when a reading is ready.
- `read_measurement` **0x0300**: wait > 3 ms, then read 18 bytes. You get CO2, T and RH, each a big-endian IEEE-754 float sent as two words, with a CRC after each word. CO2 [ppm] = float, T [°C] = float, RH [%] = float (datasheet example `43 DB 8C 2E` = 439.1 ppm).
- Other commands: ASC on/off 0x5306, forced recalibration 0x5204 (400–2000 ppm), temperature offset 0x5403 (0.01 °C), altitude 0x5102 (m), firmware 0xD100, soft reset 0xD304.

## Wiring
- ESP32: VDD → 3V3, GND → GND, RX/SDA → D21, TX/SCL → D22, leave SEL, RDY and PWM unconnected.
- Pico: VDD → 3V3(OUT), GND → GND, RX/SDA → GP4, TX/SCL → GP5.
- Raspberry Pi 4: VDD → pin 1 (3.3 V), GND → pin 6, RX/SDA → pin 3, TX/SCL → pin 5. The Pi's 1.8 k pull-ups go to 3.3 V, which is slightly above the 3.0 V input limit. Many people run it this way, but a slower bus is wise: set `dtparam=i2c_arm_baudrate=50000`.
- VDD can be 5 V (e.g. from VBUS) as long as SDA/SCL are not pulled above 3.0 V.

## Using the driver
```python
from machine import I2C, Pin
from scd30 import SCD30
i2c = I2C(0, sda=Pin(21), scl=Pin(22), freq=50000)
sensor = SCD30(i2c)          # starts continuous measurement (no pressure compensation)
co2, t, h = sensor.read()    # waits for the next reading
print('CO2=%dppm T=%.1fC H=%.0f%%' % (co2, t, h))
```

## Gotchas
- The first reading arrives about 2 s after start; `read()` polls data-ready and waits.
- At 100 kHz or above, or on a master without clock stretching, reads fail. Use `freq=50000`.
- The module needs up to 2 s after power-up before it answers; the driver retries for 2 s.
- Automatic self-calibration is off by default. If you turn it on, the sensor must see fresh air (about 400 ppm) for an hour a day for 7 days.
- Self-heating makes the temperature read high; correct it with `set_temperature_offset()`.
- A CRC mismatch nearly always means a loose SDA/SCL wire or a bus that is too fast.

## Datasheet
https://sensirion.com/media/documents/4EAF6AF8/61652C3C/Sensirion_CO2_Sensors_SCD30_Datasheet.pdf
Interface description: https://sensirion.com/media/documents/D7CEEF4A/6165372F/Sensirion_CO2_Sensors_SCD30_Interface_Description.pdf
