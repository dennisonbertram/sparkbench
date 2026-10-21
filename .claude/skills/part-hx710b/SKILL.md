---
name: part-hx710b
description: Pinout, electrical limits, wiring and MicroPython driver for the HX710B air pressure sensor module (Avia HX710B 24-bit ADC + MPS20N0040D-S 0-40 kPa bridge). Use when designing, wiring, simulating or writing code for an HX710B in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# HX710B air pressure sensor module (HX710B)

## Overview
The **HX710B** from Avia Semiconductor is a 24-bit ADC with a fixed gain-128 amplifier for bridge sensors, read over a simple two-wire clock/data interface (the same style as the HX711). Hobbyists buy it on the red **HX710B air pressure sensor module**, which pairs it with an **MPS20N0040D-S** 0-40 kPa piezoresistive pressure sensor with a hose barb. The module outputs raw counts proportional to the bridge's millivolt signal; you calibrate counts to pressure yourself.

## Pinout (HX710B air pressure module, header order)
| Pin | Function |
|---|---|
| VCC | Supply, 2.7-5.5 V (also bridge excitation and ADC reference) |
| OUT | Serial data out (chip pin DOUT); low = data ready |
| SCK | Serial clock in (chip pin PD_SCK); high > 60 us = power down |
| GND | Ground |

## Electrical limits
- Supply (AVDD/DVDD): 2.6-5.5 V per the pin table, 2.7-5.5 V per the electrical table; the board has no regulator. Vendors list it as 3.3-5 V.
- DVDD should match the MCU supply: power it from 3.3 V on an ESP32 / Pico so OUT never exceeds 3.3 V.
- Current: about 1.2 mA running, < 1 uA powered down (plus the bridge current through the sensor).
- Full-scale input: +/-0.5 x VREF / 128 (about +/-12.9 mV at 3.3 V, +/-19.5 mV at 5 V).

## Interface details
- When OUT is high, the conversion is not ready; keep SCK low.
- When OUT goes low, give **25-27 positive SCK pulses**. Pulses 1-24 shift out the 24-bit result, MSB first, in two's complement (0x800000 to 0x7FFFFF). Read OUT after each rising edge.
- The total pulse count picks the **next** conversion: 25 = differential input at 10 Hz, 26 = (DVDD-AVDD) at 40 Hz, 27 = differential input at 40 Hz.
- SCK high time: 0.2-50 us. After a reset or a change of input or rate, the first valid data comes 4 conversion periods later.
- Voltage: V(INP-INN) = raw x VREF / 2^31. On this module VREF comes from VCC.
- Pressure: uncalibrated. Take the count with the port open to air as zero, take a second count at a known pressure, and fit kPa = m x (raw - zero).

## Wiring
- ESP32: VCC → 3V3, GND → GND, OUT → D25, SCK → D26.
- Pico: VCC → 3V3(OUT), GND → GND, OUT → GP2, SCK → GP3.
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, OUT → GPIO5 (pin 29), SCK → GPIO6 (pin 31).

## Using the driver
```python
from hx710b import HX710B
adc = HX710B(25, 26, vref=3.3)   # OUT, SCK
zero = adc.tare()                # port open to air
raw = adc.read_raw()
print('IN=%.3fmV' % adc.millivolts(raw), 'counts above zero:', raw - zero)
```

## Gotchas
- An I2C or SPI library will not work with it. Use bit-banged clock pulses, as the driver does. HX711 libraries also work if they send 25 pulses.
- If interrupts stretch an SCK high pulse past 60 us, the chip powers down and the read is corrupted. The driver disables IRQs while it shifts.
- Readings drift with the supply because VREF = VCC. Use a clean 3.3 V rail and re-zero after power-up.
- 26 pulses do not read pressure: they select the supply-difference channel.
- The simulator models the 25-pulse (differential, 10 Hz) mode, with the slider as the bridge signal in mV at VCC = 3.3 V.

## Datasheet
https://www.datasheetcafe.com/wp-content/uploads/2015/09/HX710B.pdf
