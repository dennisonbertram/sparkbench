---
name: part-max17043
description: Pinout, electrical limits, wiring and MicroPython driver for the MAX17043 LiPo fuel gauge (Maxim / Analog Devices MAX17043, SparkFun LiPo Fuel Gauge PRT-20680). Use when designing, wiring, simulating or writing code for a MAX17043 battery monitor in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MAX17043 LiPo fuel gauge (MAX17043)

## Overview
The **MAX17043** (Maxim, now Analog Devices) is a 1-cell Li-ion / LiPo fuel gauge. It needs no sense resistor: its ModelGauge algorithm turns the cell voltage into a **state of charge** in percent. Over I2C it reports the cell voltage (12-bit, 1.25 mV steps, ±12.5 mV) and SOC (1/256 % steps), and it has a low-SOC alert output. Hobbyists buy it as the **SparkFun LiPo Fuel Gauge - MAX17043 (PRT-20680)**: a small red board with a 2-pin JST battery connector (+ / − pads) and two 1x3 headers.

## Pinout (SparkFun PRT-20680 v1.2, header by header)
| Pin | Function |
|---|---|
| SDA | I2C data (2.2 kΩ pull-up to VCC) |
| SCL | I2C clock (2.2 kΩ pull-up to VCC) |
| QST | Quick-start input (chip QSTRT), rising edge restarts the SOC estimate; 2.2 kΩ to GND on the board (optional) |
| VCC | Supply for the pull-ups only, up to 5.5 V (use 3.3 V) |
| GND | Ground (shared with the battery − and the microcontroller) |
| ALT | Alert output (chip ALRT), open-drain, active low (optional) |

The two headers are on opposite edges, so the board is wired with jumper leads. The battery goes on the JST connector or the + / − pads.

## Electrical limits
- The chip is powered **by the battery** (VDD = cell voltage, 2.5–4.5 V; CELL pin up to 5 V). With no battery it does not answer on I2C.
- VCC on the v1.2 board only feeds the pull-ups: give it the microcontroller's logic voltage. (The older v1.1 tied the pull-ups to the battery, up to 4.2 V on SDA/SCL.)
- SDA, SCL, QSTRT, ALRT tolerate up to 5.5 V. About 50 µA active, under 1 µA asleep. I2C up to 400 kHz.

## Interface details
- **I2C address 0x36** (fixed; 0x6C write / 0x6D read).
- All registers are 16-bit words, MSB first, at even addresses; read and write both bytes in one transaction.
- VCELL **0x02**: 12-bit result in bits 15..4 → V = (raw >> 4) × 1.25 mV. Updates every 500 ms.
- SOC **0x04**: % = raw / 256 (high byte = whole percent).
- MODE **0x06** = 0x4000 quick-start. VERSION **0x08**. COMMAND **0xFE** = 0x5400 power-on reset (no ACK).
- CONFIG **0x0C**, default 0x971C: RCOMP (high byte, 0x97), SLEEP (bit 7), ALRT flag (bit 5), ATHD (bits 4..0, threshold = 32 − ATHD %, default 4 %).
- No CRATE, STATUS or voltage alerts: those are MAX17048 features.

## Wiring
- Battery: 1-cell LiPo into the JST connector; run + / − to your system's battery input too.
- ESP32: VCC → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VCC → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.
- Optional: ALT → any GPIO input (falling edge = low battery).

## Using the driver
```python
from machine import I2C, Pin
from max17043 import MAX17043
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
gauge = MAX17043(i2c)
v, soc = gauge.read()
print('V=%.3fV SOC=%.1f%%' % (v, soc))
gauge.set_alert_threshold(10)   # ALT goes low below 10 %
```

## Gotchas
- "Not found" / ENODEV usually means no battery is connected: VCC does not run the chip.
- VCELL's low 4 bits always read 0; shift right by 4 before multiplying by 1.25 mV (or multiply the whole word by 78.125 µV).
- Holding SDA and SCL low for 2.5 s puts the chip to sleep; any bus edge wakes it.
- ALT stays low until software clears CONFIG.ALRT (`clear_alert()`).
- Don't quick-start under load or while charging: the first SOC guess will be wrong.

## Datasheet
https://www.analog.com/media/en/technical-documentation/data-sheets/MAX17043-MAX17044.pdf
