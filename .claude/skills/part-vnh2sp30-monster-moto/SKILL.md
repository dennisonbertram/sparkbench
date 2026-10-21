---
name: part-vnh2sp30-monster-moto
description: Pinout, electrical limits, wiring and MicroPython driver for the SparkFun Monster Moto Shield (DEV-10182, two ST VNH2SP30-E 30 A full-bridge motor drivers). Use when designing, wiring, simulating or writing code for a VNH2SP30 / Monster Moto shield in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# VNH2SP30 Monster Moto dual motor shield (VNH2SP30-E)

## Overview
The **VNH2SP30-E** from ST is a complete protected H-bridge (two high-side and two low-side switches plus drivers) for one brushed DC motor: 30 A max, 19 mΩ per leg, PWM up to 20 kHz, current-sense output, thermal shutdown, under- and over-voltage shutdown. The **SparkFun Monster Moto Shield (DEV-10182)** and its many clones put two of them on an Arduino-format shield, so it drives **two motors**. Practical continuous current is about 14 A per motor.

## Pinout (shield, header by header)
Arduino headers (from the SparkFun v12 schematic and example sketch):

| Header pin | Name | Function |
|---|---|---|
| 5V | 5V | Feeds only the EN pull-ups (~2 mA) |
| GND | GND | Logic ground |
| A0 | EN1 | Motor 1 enable/diagnostic (ENA+ENB joined), pulled up to 5 V with 4.7 kΩ |
| A1 | EN2 | Motor 2 enable/diagnostic |
| A2 | CS1 | Motor 1 current sense (0.132 V/A) |
| A3 | CS2 | Motor 2 current sense |
| D4 | INA2 | Motor 2 INA |
| D5 | PWM1 | Motor 1 PWM (speed) |
| D6 | PWM2 | Motor 2 PWM |
| D7 | INA1 | Motor 1 INA |
| D8 | INB1 | Motor 1 INB |
| D9 | INB2 | Motor 2 INB |

Screw terminals: power **VIN +** / **−** (5.5–16 V motor supply), motor 1 **A1/B1** (OUTA1/OUTB1), motor 2 **A2/B2** (OUTA2/OUTB2).

INA/INB/PWM go through 1 kΩ series resistors; PWM also has a 1 kΩ pull-down, so an unwired PWM keeps the motor off.

## Electrical limits
- Motor supply: 5.5–16 V (under-voltage shutdown ≤ 5.5 V, over-voltage shutdown 16–22 V, absolute max 41 V).
- Current: 30 A max continuous per chip (current limit 30–70 A); ~14 A practical without extra cooling.
- Logic inputs (INA, INB, PWM, EN): VIL ≤ 1.25 V, **VIH ≥ 3.25 V** (2.7 V typical), clamp 5.5 V min. They are 5 V logic: 3.3 V GPIOs usually work but are at the edge of the guaranteed range — for guaranteed operation use a 5 V buffer (74AHCT125).
- PWM: 0–20 kHz.
- CS: I_sense = I_out / K, K = 11370 typ. (9665–13075), into 1.5 kΩ → 0.132 V per amp; above ~25 A it exceeds 3.3 V. Sparkbench puts a 10k/20k divider in front of the ADC.
- EN1/EN2 sit at 5 V (pull-up to the 5V pin): never wire them straight to a 3.3 V GPIO.

## Interface details (ST datasheet Table 12, EN high)
| INA | INB | OUTA | OUTB | Mode |
|---|---|---|---|---|
| 1 | 1 | H | H | Brake to VCC |
| 1 | 0 | H | L | Clockwise |
| 0 | 1 | L | H | Counterclockwise |
| 0 | 0 | L | L | Brake to GND |

- PWM switches the low side: "a 0 on the PWM pin turns off both LSA and LSB". INA = INB = 0 with PWM = 0 leaves all switches off (coast).
- CS is valid only in CW/CCW (high impedance while braking).
- On over-temperature or a short the chip pulls EN/DIAG low and latches the faulty leg off; take INA/INB low and high again to restart.

## Wiring
- Power: battery + → VIN +, battery − → −, motors → A1/B1 and A2/B2. Shield 5V → board 5 V (VBUS/VIN on ESP32 and Pico), GND → GND.
- ESP32: INA1 → D25, INB1 → D26, PWM1 → D27, INA2 → D14, INB2 → D32, PWM2 → D33, EN1/EN2 unconnected (avoid strapping pins such as GPIO12).
- Pico: INA1 → GP2, INB1 → GP3, PWM1 → GP4, INA2 → GP6, INB2 → GP7, PWM2 → GP8.
- Raspberry Pi 4: PWM1 → GPIO18 (pin 12), PWM2 → GPIO19 (pin 35), INA/INB → any GPIO.
- Current sense (optional): CS1/CS2 → ADC pins through a 10 kΩ (top) / 20 kΩ (bottom) divider.

## Using the driver
```python
from vnh2sp30 import MonsterMoto
moto = MonsterMoto(25, 26, 27, 14, 32, 33)   # INA1, INB1, PWM1, INA2, INB2, PWM2; 20 kHz PWM
moto.m1.cw(60)        # 60 %
moto.m2.ccw(30)
moto.m1.drive(-80)    # -100..100
moto.m1.brake(); moto.m2.coast(); moto.m1.brake_vcc()
# current sense via the 10k/20k divider: MonsterMoto(..., cs1=34, cs2=35); moto.m1.current()  # amps
```

## Gotchas
- 5 V logic part: on 3.3 V boards it typically works (VIH typ. 2.7 V) but is not guaranteed; use a 74AHCT125 for reliability.
- The motor supply is separate: the shield does not connect VIN to the Arduino VIN. Never power motors from the board.
- Common ground between battery and microcontroller is required.
- Above 16 V the chip shuts down (over-voltage): a 4S LiPo (16.8 V) is too much.
- `brake()` keeps PWM high (low sides on); setting PWM to 0 instead lets the motor coast.

## Datasheet
https://www.st.com/resource/en/datasheet/vnh2sp30-e.pdf
