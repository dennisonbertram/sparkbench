---
name: part-max17048
description: Pinout, electrical limits, wiring and MicroPython driver for the MAX17048 LiPo fuel gauge (Analog Devices / Maxim MAX17048). Use when designing, wiring, simulating or writing code for a MAX17048 battery monitor in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MAX17048 LiPo fuel gauge (MAX17048)

## Overview
The **MAX17048** (Maxim, now Analog Devices) is a 1-cell Li-ion / LiPo fuel gauge. It needs no sense resistor: its ModelGauge algorithm turns the cell voltage into a **state of charge** in percent. Over I2C it reports the cell voltage (78.125 µV steps, ±7.5 mV), SOC (1/256 % steps) and an approximate charge/discharge rate (0.208 %/hr steps). Hobbyists buy it as the **Adafruit MAX17048 LiPoly / Li-ion Fuel Gauge (#5580)** with two JST-PH battery ports (battery in one, load/charger in the other), STEMMA QT connectors and a 6-pin header.

## Pinout (Adafruit #5580, header order)
| Pin | Function |
|---|---|
| VIN | Logic supply for the I2C pull-ups and LED, 3–5 V |
| GND | Ground (shared with the battery − and the microcontroller) |
| SCL | I2C clock (10 kΩ pull-up) |
| SDA | I2C data (10 kΩ pull-up) |
| INT | Alert output (chip ALRT), open-drain, active low (optional) |
| QStart | Quick-start input, rising edge restarts the SOC estimate (optional; leave unconnected or tie to GND) |

## Electrical limits
- The chip is powered **by the battery** (VDD = cell voltage, 2.5–4.5 V). With no battery, or a flat one, it does not answer on I2C.
- VIN on the breakout: 3–5 V, only feeds the pull-ups and the LED. Use the microcontroller's logic voltage (3.3 V on ESP32/Pico).
- SDA, SCL, ALRT tolerate up to 5.5 V. Current from the cell: 23 µA active, 3–4 µA hibernate.
- Voltage measurement range 2.5–5 V. I2C up to 400 kHz.

## Interface details
- **I2C address 0x36** (fixed; 0x6C write / 0x6D read).
- All registers are 16-bit words, MSB first, at even byte addresses. Read both bytes in one transaction (`readfrom_mem(0x36, reg, 2)`); 8-bit writes are ignored.
- VCELL **0x02**: V = raw × 78.125 µV.
- SOC **0x04**: % = raw / 256 (high byte = whole percent). First value about 1 s after the battery is connected.
- CRATE **0x16**: signed, %/hr = raw × 0.208 (negative = discharging).
- VERSION **0x08** reads 0x001_ (e.g. 0x0012). CONFIG **0x0C** default 0x971C (RCOMP 0x97, low-SOC alert at 4 %). STATUS **0x1A** (RI bit set after power-up).
- MODE **0x06** = 0x4000 quick-starts; CMD **0xFE** = 0x5400 resets (no ACK).

## Wiring
- Battery: 1-cell LiPo into either JST-PH port; load or charger into the other.
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.
- Optional: INT → any GPIO input (falling-edge interrupt for low battery).

## Using the driver
```python
from machine import I2C, Pin
from max17048 import MAX17048
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
gauge = MAX17048(i2c)
v, soc = gauge.read()
print('V=%.3fV SOC=%.1f%% rate=%.1f%%/hr' % (v, soc, gauge.charge_rate()))
```

## Gotchas
- "Not found" / ENODEV almost always means no battery is plugged in: the STEMMA QT / VIN power does not run the chip.
- SOC can read high (above 100 %) or jump right after connecting a battery; it settles over the first charge/discharge cycles. Do not call quick_start() unless the cell is resting.
- The ALRT/INT line stays low after an alert until CONFIG.ALRT is cleared (`clear_alert()`).
- The default model suits common LiPo cells; Maxim's custom model (TABLE registers 0x40–0x7F) is not needed for hobby use.

## Datasheet
https://www.analog.com/media/en/technical-documentation/data-sheets/MAX17048-MAX17049.pdf
