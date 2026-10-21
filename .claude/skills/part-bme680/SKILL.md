---
name: part-bme680
description: Pinout, electrical limits, wiring and MicroPython driver for the BME680 gas, temperature, humidity & pressure sensor (Bosch BME680, Adafruit #3660 breakout). Use when designing, wiring, simulating or writing code for a BME680 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# BME680 gas, temperature, humidity & pressure sensor (BME680)

## Overview
The **Bosch BME680** combines temperature (−40 to 85 °C, ±1 °C), relative humidity (0–100 %, ±3 %), barometric pressure (300–1100 hPa, ±0.6 hPa) and a heated metal-oxide **gas sensor**. The gas sensor's resistance drops when VOCs (fumes, solvents, stale breath) are in the air, so it is a relative air-quality indicator, not a calibrated ppm reading. Hobbyists buy it on the **Adafruit BME680 breakout (#3660)**, which adds a 3.3 V regulator and I2C level shifting so it works from 3.3 V or 5 V boards.

## Pinout (Adafruit #3660, header order)
| Pin | Function |
|---|---|
| VIN | Supply 3–5 V (onboard AP2112K 3.3 V regulator) |
| 3Vo | 3.3 V regulator output (up to 100 mA), leave unconnected |
| GND | Ground |
| SCK | I2C SCL (SPI clock), 10 kΩ pull-up + level shifter |
| SDO | Address select: pulled up = 0x77; GND = 0x76 (SPI data out) |
| SDI | I2C SDA (SPI data in), 10 kΩ pull-up + level shifter |
| CS | SPI chip select, pulled high = I2C; leave open |

The board also has two STEMMA QT / Qwiic connectors carrying the same I2C bus.

## Electrical limits
- Chip: VDD 1.71–3.6 V, absolute maximum 4.25 V. The Adafruit board takes 3–5 V on VIN.
- Current: up to about 18 mA peak while the gas hot plate heats; µA when idle.
- I2C up to 3.4 MHz; SDO and CS are 3.3 V logic (not level shifted).

## Interface details
- **I2C address 0x77** on the Adafruit board (SDO high), 0x76 with SDO to GND. Chip ID register 0xD0 = **0x61**. Soft reset: write 0xB6 to 0xE0.
- Calibration: 0x8A–0xA0 (T2, T3, P1–P10), 0xE1–0xEE (H1–H7, T1, G1–G3), res_heat_val 0x00, res_heat_range 0x02<5:4>, range_switching_error 0x04<7:4> (signed 4-bit). Note H1/H2 share 0xE2 (H1 = 0xE3<<4 | 0xE2[3:0], H2 = 0xE1<<4 | 0xE2[7:4]).
- Forced mode measurement: write osrs_h to 0x72, then 0x74 = osrs_t<<5 | osrs_p<<2 | 0b01. For gas first set res_heat_0 (0x5A), gas_wait_0 (0x64; 6-bit ms × 1/4/16/64) and 0x71 = 0x10 (run_gas = 1, nb_conv = 0).
- Data at 0x1D–0x2B: status (bit 7 new_data), pressure 0x1F–0x21 (20 bit), temperature 0x22–0x24 (20 bit), humidity 0x25–0x26 (16 bit), gas ADC 0x2A<7:0>,0x2B<7:6> (10 bit), gas_valid 0x2B bit 5, heat_stab bit 4, gas_range 0x2B<3:0>.
- Compensation: datasheet sections 3.3.1–3.3.3 (temperature first, its t_fine feeds pressure; humidity uses °C). Gas: var1 = (1340 + 5·range_sw_err) × const_array1[range]; R = var1 × const_array2[range] / (gas_adc − 512 + var1) Ω.
- Heater code: res_heat_x from par_g1/g2/g3, target and ambient temperature (section 3.3.5); keep the target ≤ 400 °C.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDI → D21, SCK → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDI → GP4, SCK → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDI → pin 3, SCK → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from bme680 import BME680
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
s = BME680(i2c, addr=0x77, heater_temp=320, heater_ms=150)
t, p, h, gas = s.read()   # °C, hPa, %RH, ohms (None if the heater was not stable)
print('T=%.1fC P=%.1fhPa H=%.1f%% G=%.1fkOhm' % (t, p, h, gas / 1000))
```

## Simulation
The simulator's gas slider is the sensor **conductance** in µS (1/R), because the chip's gas ADC value is proportional to conductance. It is modelled in gas range 6, so it covers about 5–11 µS (≈ 200 kΩ down to ≈ 91 kΩ). The printed gas resistance is 1/conductance.

## Gotchas
- Gas resistance is relative: log a baseline in clean air after burn-in (minutes each power-up, about 48 h for a new sensor) and watch for drops. Bosch's closed BSEC library is needed for an "IAQ index".
- Check gas_valid and heat_stab: if heat_stab is 0, the heater time was too short or the target too hot.
- The heater warms the chip; read at most about once per second and keep the heater time short, or the temperature reads high and the humidity low.
- Pin names are SPI-style: SCK is I2C clock, SDI is I2C data.

## Datasheet
https://www.bosch-sensortec.com/media/boschsensortec/downloads/datasheets/bst-bme680-ds001.pdf
