---
name: part-adxl362
description: Pinout, electrical limits, wiring and MicroPython driver for the ADXL362 ultralow-power 3-axis SPI accelerometer (Analog Devices ADXL362, SparkFun SEN-11446 breakout). Use when designing, wiring, simulating or writing code for an ADXL362 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# ADXL362 ultralow-power 3-axis accelerometer (ADXL362)

## Overview
The **ADXL362** from Analog Devices is a micropower 3-axis MEMS accelerometer: ±2/±4/±8 g, 12-bit output (1 mg/LSB on ±2 g), about 1.8 µA at 100 Hz, with a die temperature sensor, activity/inactivity detection and a 512-sample FIFO. It talks **4-wire SPI only**. Hobbyists buy it on the **SparkFun Triple Axis Accelerometer Breakout - ADXL362 (SEN-11446)**: the bare chip plus a 0.1 µF cap, **no regulator and no level shifting**.

## Pinout (SparkFun SEN-11446, two 4-pin headers on opposite edges)
| Header | Pin | Function |
|---|---|---|
| JP2-1 | V+ | Supply to VS and VDDIO, 1.6–3.5 V (use 3.3 V) |
| JP2-2 | GND | Ground |
| JP2-3 | INT1 | Interrupt 1 output (optional) / external clock in |
| JP2-4 | INT2 | Interrupt 2 output (optional) / external sample trigger |
| JP1-1 | CS (printed !CS) | Chip select, active low |
| JP1-2 | MISO | SPI data out |
| JP1-3 | MOSI | SPI data in |
| JP1-4 | SCK | SPI clock |

The headers are 0.4 in apart on opposite edges, so Sparkbench wires it with jumper leads.

## Electrical limits
- Supply VS: 1.6–3.5 V operating, absolute maximum 3.6 V. **Never connect V+ to 5 V.**
- Current: 1.8 µA measuring at 100 Hz (normal noise), 13 µA ultralow-noise, 10 nA standby.
- Outputs (MISO, INT1/2) swing to V+, so 3.3 V logic: safe for ESP32 / Pico / Pi.
- SPI: mode 0 (CPOL = CPHA = 0), 1–5 MHz recommended.
- After power loss, let the supply discharge fully to 0 V before re-powering.

## Interface details
- Write registers: `CS low, 0x0A, addr, data..., CS high`. Read: `CS low, 0x0B, addr, then clock out data..., CS high`. Address auto-increments.
- IDs: DEVID_AD 0x00 = **0xAD**, DEVID_MST 0x01 = 0x1D, PARTID 0x02 = **0xF2**.
- Soft reset: write **0x52** to SOFT_RESET (0x1F); the part returns to standby.
- FILTER_CTL 0x2C: RANGE bits [7:6] (00 ±2 g, 01 ±4 g, 1x ±8 g), HALF_BW bit 4, ODR [2:0] (011 = 100 Hz, default 0x13).
- POWER_CTL 0x2D: write **0x02** to enter measurement mode (power-on default is standby, data reads 0). First valid data after 4/ODR.
- Data 0x0E–0x15: XDATA_L/H, YDATA_L/H, ZDATA_L/H, TEMP_L/H. 12-bit two's complement, **low byte first**, sign-extended to 16 bits. Read all 8 bytes in one burst so the axes come from the same sample.
- Scale: 1 mg/LSB (±2 g), 2 mg/LSB (±4 g), 4 mg/LSB (±8 g).
- Temperature (typical only): T ≈ 25 + (raw − 350) × 0.065 °C. The bias varies ±290 LSB part to part; calibrate before trusting it.

## Wiring
- ESP32: V+ → 3V3, GND → GND, SCK → D18, MOSI → D23, MISO → D19, CS → D5.
- Pico: V+ → 3V3(OUT), GND → GND, SCK → GP10, MOSI → GP11, MISO → GP12, CS → GP13 (SPI1).
- Raspberry Pi 4: V+ → pin 1 (3.3 V), GND → pin 6, SCK → pin 23, MOSI → pin 19, MISO → pin 21, CS → pin 24 (CE0).

## Using the driver
```python
from machine import Pin, SPI
from adxl362 import ADXL362
spi = SPI(1, baudrate=1000000, polarity=0, phase=0, sck=Pin(18), mosi=Pin(23), miso=Pin(19))
acc = ADXL362(spi, 5)          # soft reset, ID check, ±2 g, 100 Hz, measurement mode
x, y, z = acc.acceleration()   # in g
print('X=%.3f Y=%.3f Z=%.3f g' % (x, y, z))
```

## Gotchas
- "ADXL362 not found (ID ff ff ff)" or all zeros: MISO not connected, CS not toggling, or wrong SPI mode.
- Readings stuck at 0: POWER_CTL was never set to measurement mode (0x02).
- Z reads about +1 g lying flat, face up; that is gravity, not an error.
- Use a 3.3 V supply only; there is no regulator on the SparkFun board.

## Datasheet
https://www.analog.com/media/en/technical-documentation/data-sheets/adxl362.pdf
