---
name: part-drv8838
description: Pinout, electrical limits, wiring and MicroPython driver for the DRV8838 single brushed DC motor driver carrier (TI DRV8838, Pololu #2990). Use when designing, wiring, simulating or writing code for a DRV8838 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# DRV8838 single brushed DC motor driver (DRV8838)

## Overview
The **DRV8838** from TI is a tiny single H-bridge (280 mΩ high + low side) for one brushed DC motor at 0–11 V. It uses a PHASE/ENABLE interface: one pin sets the direction, the other switches the bridge on (PWM it for speed). It has a separate 1.8–7 V logic supply, a sleep pin, and over-current, over-temperature and VCC under-voltage protection. There is no fault output. Hobbyists buy it as the **Pololu DRV8838 Single Brushed DC Motor Driver Carrier (#2990)**. This 0.4″ × 0.5″ board has the shape of a 10-pin DIP and adds a reverse-polarity MOSFET on the motor supply and a 10 kΩ pull-up on SLP.

## Pinout (Pololu #2990)
Two rows of five, 0.4″ apart. Logic row (top to bottom as printed), then the motor row (top to bottom):

| Pin | Function |
|---|---|
| GND | Ground |
| VCC | Logic supply 1.8–7 V |
| EN | ENABLE: high = drive, low = brake. PWM for speed |
| PH | PHASE: low = forward, high = reverse |
| SLP | nSLEEP: low = sleep/coast. 10 kΩ pull-up on the board, so it runs if left open |
| GND (GND2) | Ground (same net) |
| VIN | Motor supply, reverse-protected, about 1.5–11 V |
| O2 | Motor output OUT2 |
| O1 | Motor output OUT1 |
| VM | Motor supply after the protection MOSFET (normally an output) |

## Electrical limits
- VCC: 1.8–7 V. The outputs switch off below 1.7 V (UVLO).
- VM: 0–11 V (absolute max 12 V). Use VIN above about 1.5 V. Below a few volts, feed VM directly.
- Logic inputs: high above 0.5 × VCC, low below 0.25 × VCC, max 5.5 V. 3.3 V GPIOs are fine.
- Current: 1.8 A peak. Pololu measured about 1.7 A continuous before thermal shutdown. Over-current trips at 1.9 A minimum and retries after 1 ms.
- PWM on EN: up to 250 kHz.
- Supply current: about 0.3 mA from VCC and 40 µA from VM when idle. Asleep it draws nanoamps, plus VCC/10 kΩ through the board's SLP pull-up.
- Wake-up time after SLP goes high: up to 30 µs.

## Interface details (datasheet Table 7-2)
| SLP | PH | EN | OUT1 | OUT2 | Motor |
|---|---|---|---|---|---|
| 0 | X | X | Z | Z | Coast (sleep) |
| 1 | X | 0 | L | L | Brake |
| 1 | 0 | 1 | H | L | Forward |
| 1 | 1 | 1 | L | H | Reverse |

Speed: hold PH for the direction and PWM EN. The duty cycle equals the speed, and the motor brakes during the low part of each period.

## Wiring
- Power: VCC → 3V3, GND → GND, motor supply + → VIN (1.5–11 V; Sparkbench adds a separate DC supply), motor supply − → GND. The motor goes across O1 and O2.
- ESP32: PH → D26, EN → D27, SLP → D25 (optional).
- Pico: PH → GP3, EN → GP2, SLP → GP4 (optional).
- Raspberry Pi 4: PH → GPIO27 (pin 13), EN → GPIO18 (pin 12, hardware PWM), SLP → GPIO17 (pin 11).
- SLP can stay unconnected unless you want coasting or low-power sleep.

## Using the driver
```python
from drv8838 import DRV8838
m = DRV8838(26, 27, slp=25)   # PH, EN, SLP
m.forward()                   # full speed
m.reverse(60)                 # 60 % (PWM on EN)
m.brake()                     # EN low, outputs shorted to GND
m.coast()                     # SLP low, outputs Hi-Z (needs slp=)
```

## Gotchas
- Nothing happens? Check VCC first. Without logic power the chip stays off, even when VIN is present.
- With EN low the motor brakes and cannot coast. To let it coast, drive SLP low.
- If the grounds are not connected, the motor behaves erratically.
- Motor start-up current from USB 5 V can brown out the microcontroller. Use a separate battery on VIN.
- The board gets hot enough to burn you at over 1 A, well before thermal shutdown.
- The same carrier also comes with a DRV8837 (IN1/IN2 interface). This driver is for the DRV8838 (PH/EN) only.

## Datasheet
https://www.ti.com/lit/ds/symlink/drv8838.pdf
