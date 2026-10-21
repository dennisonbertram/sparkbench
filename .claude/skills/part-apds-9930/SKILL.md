---
name: part-apds-9930
description: Pinout, electrical limits, wiring and MicroPython driver for the APDS-9930 proximity & ambient light sensor (Broadcom/Avago APDS-9930, CJMCU-9930 module). Use when designing, wiring, simulating or writing code for an APDS-9930 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# APDS-9930 proximity & ambient light sensor (APDS-9930)

## Overview
The **APDS-9930** from Broadcom (Avago) combines an IR-LED proximity sensor (10-bit count, factory-calibrated to about 100 mm) with a two-channel ambient light sensor: Ch0 sees visible + IR, Ch1 sees IR, each a 16-bit count, turned into lux with the datasheet equation. It talks I2C at the fixed address 0x39. Hobbyists buy it on the purple **CJMCU-9930** module, which has no regulator or level shifter: it is 3.3 V only.

## Pinout (CJMCU-9930 module, header order)
| Pin | Function |
|---|---|
| VL | IR LED supply (LEDA, 2.5-4.5 V): wire to 3.3 V for proximity |
| GND | Ground |
| VCC | Sensor supply, 2.4-3.6 V (use 3.3 V) |
| SCL | I2C clock |
| SDA | I2C data |
| INT | Interrupt, open-drain, active low (optional) |

## Electrical limits
- VDD 2.2-3.6 V (3.0 V typical), absolute max 3.8 V on VDD and every digital pin. **Never 5 V.**
- IR LED supply (VL) 2.5-4.5 V; the LED is pulsed at up to 100 mA.
- Current: about 0.2 mA active, 2.2 µA asleep, plus the LED pulses.
- I2C up to 400 kHz.

## Interface details
- **I2C address 0x39** (fixed). ID register 0x12 = **0x39**.
- Every access starts with a command byte: **0xA0 | reg** (auto-increment), 0x80 | reg (repeated byte), **0xE7** clears ALS + proximity interrupts.
- Start-up: wait ≥ 4.5 ms after power-on, ENABLE (0x00) = 0, set ATIME (0x01), PTIME (0x02) = 0xFF, WTIME (0x03), PPULSE (0x0E) = 8, CONTROL (0x0F) = PDRIVE 100 mA | **PDIODE = 10 (0x20, required)** | PGAIN | AGAIN, then ENABLE = 0x07 (PON | AEN | PEN).
- ALS: ALSIT = 2.73 ms × (256 − ATIME); max count = min(65535, 1023 × (256 − ATIME)). After STATUS (0x13) bit 0 AVALID, read 4 bytes from 0x14: Ch0, Ch1, low byte first.
- Lux (open air): IAC = max(CH0 − 1.862·CH1, 0.746·CH0 − 1.291·CH1, 0); lux = IAC × 0.49 × 52 / (ALSIT × AGAIN).
- Proximity: after STATUS bit 1 PVALID, read PDATA (0x18/0x19, low byte first), 0-1023 with PTIME = 0xFF.

## Wiring
- ESP32: VCC → 3V3, VL → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VCC → 3V3(OUT), VL → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VCC and VL → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from apds9930 import APDS9930
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
s = APDS9930(i2c)
ch0, ch1 = s.raw()
print('P=%d CH0=%d CH1=%d LUX=%.0f' % (s.proximity(), ch0, ch1, s.lux(ch0, ch1)))
```

## Gotchas
- 5 V on VCC, VL or the I2C lines will kill it: the board has no regulator or level shifter.
- If VL is not powered the proximity count stays near its no-object level.
- Forgetting PDIODE = 10 in CONTROL leaves proximity dead: the datasheet says it must be set.
- With nothing in front the proximity reads roughly 100-200 counts (crosstalk), not 0; calibrate thresholds for your object.
- If Ch0 reaches the max count the ALS is saturated: lower AGAIN or ATIME.
- Behind a window the lux coefficients change (Broadcom application note).

## Datasheet
https://docs.broadcom.com/doc/AV02-3190EN
