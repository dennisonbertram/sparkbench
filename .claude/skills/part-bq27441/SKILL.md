---
name: part-bq27441
description: Pinout, electrical limits, wiring and MicroPython driver for the BQ27441-G1 LiPo fuel gauge (Texas Instruments BQ27441-G1A on the SparkFun Battery Babysitter PRT-13777). Use when designing, wiring, simulating or writing code for a BQ27441 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# BQ27441 LiPo fuel gauge (BQ27441-G1)

## Overview
The **BQ27441-G1** from Texas Instruments is a single-cell Li-ion/LiPo fuel gauge using Impedance Track. It reports battery voltage (mV), state of charge (%), average current (mA) through a 10 mΩ sense resistor, average power (mW), temperature (0.1 K) and remaining/full capacity (mAh) over I2C. Hobbyists usually buy it on the **SparkFun Battery Babysitter (PRT-13777)**. That board pairs a BQ27441-G1A gauge with a BQ24075 charger that has power-path management.

## Pinout (Battery Babysitter, bottom-edge header, left to right)
| Pin | Function |
|---|---|
| GND | Ground |
| VPU | Pull-up voltage input for SDA/SCL (4.7 kΩ) and GPOUT (10 kΩ). Connect it to your logic supply (3.3 V). |
| SDA | I2C data |
| SCL | I2C clock |
| GPOUT | Gauge interrupt, open-drain (SOC_INT pulses or BAT_LOW). Optional. |
| CE | Charger enable, active low. It has an internal pull-down, so charging stays on if you leave it open. Optional. |

The VOUT +/- pins sit next to these on the same edge. The JST battery connector, micro-USB and VIN charge inputs are on the other edges, so the board is wired with jumper leads.

## Electrical limits
- The gauge runs from the battery (BAT 2.45–4.5 V, internal 1.8 V LDO). It draws 93 µA in NORMAL mode and 9 µA in HIBERNATE.
- VPU (I2C pull-up voltage): 1.62–3.6 V recommended. SDA/SCL have an absolute maximum of 6 V.
- Current sense: ±25 mV across the 10 mΩ resistor, which is about ±2.5 A.
- I2C clock up to 400 kHz. Leave at least 66 µs of bus-free time between packets. Above 100 kHz, write subcommands as single-byte writes.
- Charger input (USB or VIN): 4.35–6.4 V. VOUT gives 3–5.5 V.

## Interface details
- **I2C address 0x55** (fixed).
- Standard commands are 16-bit words with the **low byte first** at the command code. Read them with `readfrom_mem(0x55, cmd, 2)`.
  - Temperature 0x02: 0.1 K, so °C = raw/10 − 273.15.
  - Voltage 0x04: mV.
  - Flags 0x06: bit 3 = BAT_DET.
  - RemainingCapacity 0x0C and FullChargeCapacity 0x0E: mAh.
  - AverageCurrent 0x10: signed mA, negative while discharging.
  - AveragePower 0x18: signed mW.
  - StateOfCharge 0x1C: %.
  - StateOfHealth 0x20: %, with a status byte at 0x21.
- Control() subcommands: write the low byte to 0x00 and the high byte to 0x01, then read the word at 0x00. DEVICE_TYPE (0x0001) returns 0x0421.
- Don't send the same standard command more than twice a second, or the gauge's watchdog may reset it.
- Design Capacity defaults to 1340 mAh on the -G1A. You can change it through the data-memory sequence in TRM section 3.1 (SET_CFGUPDATE, block 0x52, checksum, SOFT_RESET).

## Wiring
- ESP32: GND → GND, VPU → 3V3, SDA → D21, SCL → D22.
- Pico: GND → GND, VPU → 3V3(OUT), SDA → GP4, SCL → GP5.
- Raspberry Pi 4: GND → pin 6, VPU → pin 1 (3.3 V), SDA → pin 3, SCL → pin 5.
- Plug a 1-cell LiPo into the JST connector. To run the project from the battery, connect VOUT to your board's VIN or 5V pin. Never connect VOUT to 3V3.

## Using the driver
```python
from machine import I2C, Pin
from bq27441 import BQ27441
i2c = I2C(0, sda=Pin(21), scl=Pin(22), freq=100000)
g = BQ27441(i2c)
print(g.voltage(), 'mV', g.soc(), '%', g.current(), 'mA', g.temperature(), 'C')
```

## Gotchas
- With no battery connected the gauge is unpowered and gives `OSError: ENODEV`.
- SOC and capacity are only accurate once Design Capacity matches your cell, or after the gauge has learned it over a full charge/discharge cycle.
- Charging only works when the ON/OFF switch is ON. The DIP switches set the charge current: both ON gives 100 mA, which is the default.
- Poll about once a second. Reading too often can trip the gauge's watchdog.

## Datasheet
https://www.ti.com/lit/ds/symlink/bq27441-g1.pdf (Technical Reference Manual: https://www.ti.com/lit/ug/sluuac9a/sluuac9a.pdf)
