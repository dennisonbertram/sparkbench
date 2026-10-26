// Board pinouts and per-pin capabilities. The pin names match the physical
// silkscreen (and the Wokwi element pin names where one exists).
import type { BoardId } from './types';

export type Cap = 'in' | 'out' | 'adc' | 'pwm' | 'touch';

export interface BoardPin {
  name: string; // silkscreen name, e.g. "D21" or "GP4" or "GPIO17"
  gpio?: number;
  role: 'gpio' | 'power' | 'gnd' | 'other';
  voltage?: number; // for power pins
  caps?: Cap[];
  /** Why the planner should avoid this pin (shown as a warning if used). */
  caution?: string;
  /** Lower = preferred by the auto pin assigner. */
  rank?: number;
  alt?: string[]; // alternate functions for display: SDA, SCL, TX…
  physical?: number; // header pin number (Pi / Pico)
  /** Header + pad for boards whose pins are numbered per connector (Nicla: "J1-3"). */
  header?: string;
  /** The pin's name in the board's firmware API when it isn't the GPIO number: a MicroPython Pin() id
   * ("D0", "PE12" on the Nicla Vision) or an Arduino pin number/constant ("5", "A0" on the Nicla Voice). */
  fw?: string;
}

export interface BoardDef {
  id: BoardId;
  partType: string;
  name: string;
  short: string;
  /** 'arduino': the program is a C++ sketch (sketch.ino); the browser Python simulator can't run it. */
  language: 'micropython' | 'python' | 'arduino';
  logicV: number;
  maxPinMa: number;
  i2c: { sda: string; scl: string; id: number };
  spi?: { sck: string; mosi: string; miso: string; cs: string; id: number };
  supply3v3: string;
  supply5v: string;
  gnd: string;
  pins: BoardPin[];
  ledPin?: string;
  flashing: string[];
  adcBits: number;
  /** supply5v is a power *input* only (Nicla VIN): there is no 5 V output on the header. */
  supply5vInput?: boolean;
  /** Where every electrical fact for this board comes from (see docs/boards/). */
  sources?: string;
  /** Pin layout family: 'nicla' = J1/J2 castellated edge headers (BoardPin.header "J1-3"). */
  header?: 'nicla';
}

const io = (caps: Cap[] = ['in', 'out', 'pwm']): Cap[] => caps;

// ---------------------------------------------------------------- ESP32 DevKit V1 (30 pin)
const esp32Pins: BoardPin[] = [
  { name: 'VIN', role: 'power', voltage: 5 },
  { name: 'GND.1', role: 'gnd' },
  { name: 'GND.2', role: 'gnd' },
  { name: '3V3', role: 'power', voltage: 3.3 },
  { name: 'EN', role: 'other', caution: 'Reset pin — not a GPIO.' },
  { name: 'VP', gpio: 36, role: 'gpio', caps: ['in', 'adc'], caution: 'Input-only pin (no output, no internal pull-ups).', rank: 6 },
  { name: 'VN', gpio: 39, role: 'gpio', caps: ['in', 'adc'], caution: 'Input-only pin (no output, no internal pull-ups).', rank: 6 },
  { name: 'D34', gpio: 34, role: 'gpio', caps: ['in', 'adc'], caution: 'Input-only pin (no output, no internal pull-ups).', rank: 5 },
  { name: 'D35', gpio: 35, role: 'gpio', caps: ['in', 'adc'], caution: 'Input-only pin (no output, no internal pull-ups).', rank: 5 },
  { name: 'D32', gpio: 32, role: 'gpio', caps: io(['in', 'out', 'pwm', 'adc', 'touch']), rank: 2 },
  { name: 'D33', gpio: 33, role: 'gpio', caps: io(['in', 'out', 'pwm', 'adc', 'touch']), rank: 2 },
  { name: 'D25', gpio: 25, role: 'gpio', caps: io(), rank: 1, alt: ['DAC1'] },
  { name: 'D26', gpio: 26, role: 'gpio', caps: io(), rank: 1, alt: ['DAC2'] },
  { name: 'D27', gpio: 27, role: 'gpio', caps: io(), rank: 1 },
  { name: 'D14', gpio: 14, role: 'gpio', caps: io(), rank: 2, caution: 'Outputs a PWM signal at boot.' },
  { name: 'D12', gpio: 12, role: 'gpio', caps: io(), rank: 9, caution: 'Strapping pin: pulled high at boot it breaks flash voltage selection. Avoid.' },
  { name: 'D13', gpio: 13, role: 'gpio', caps: io(), rank: 1 },
  { name: 'D23', gpio: 23, role: 'gpio', caps: io(), rank: 1, alt: ['MOSI'] },
  { name: 'D22', gpio: 22, role: 'gpio', caps: io(), rank: 3, alt: ['SCL'] },
  { name: 'TX0', gpio: 1, role: 'gpio', caps: io(), rank: 10, caution: 'USB serial TX — used for programming and print().' },
  { name: 'RX0', gpio: 3, role: 'gpio', caps: io(), rank: 10, caution: 'USB serial RX — used for programming.' },
  { name: 'D21', gpio: 21, role: 'gpio', caps: io(), rank: 3, alt: ['SDA'] },
  { name: 'D19', gpio: 19, role: 'gpio', caps: io(), rank: 1, alt: ['MISO'] },
  { name: 'D18', gpio: 18, role: 'gpio', caps: io(), rank: 1, alt: ['SCK'] },
  { name: 'D5', gpio: 5, role: 'gpio', caps: io(), rank: 4, caution: 'Strapping pin (must be high at boot); fine for outputs/buttons with pull-up.', alt: ['SS'] },
  { name: 'TX2', gpio: 17, role: 'gpio', caps: io(), rank: 1 },
  { name: 'RX2', gpio: 16, role: 'gpio', caps: io(), rank: 1 },
  { name: 'D4', gpio: 4, role: 'gpio', caps: io(['in', 'out', 'pwm', 'touch']), rank: 1 },
  { name: 'D2', gpio: 2, role: 'gpio', caps: io(), rank: 4, caution: 'Strapping pin and on-board blue LED.' },
  { name: 'D15', gpio: 15, role: 'gpio', caps: io(), rank: 4, caution: 'Strapping pin (outputs debug at boot when high).' },
];

// ---------------------------------------------------------------- Raspberry Pi Pico
const picoLeft = ['GP0', 'GP1', 'GND.1', 'GP2', 'GP3', 'GP4', 'GP5', 'GND.2', 'GP6', 'GP7', 'GP8', 'GP9', 'GND.3', 'GP10', 'GP11', 'GP12', 'GP13', 'GND.4', 'GP14', 'GP15'];
const picoRight = ['VBUS', 'VSYS', 'GND.8', '3V3_EN', '3V3', 'ADC_VREF', 'GP28', 'AGND', 'GP27', 'GP26', 'RUN', 'GP22', 'GND.7', 'GP21', 'GP20', 'GP19', 'GP18', 'GND.6', 'GP17', 'GP16'];
const picoPins: BoardPin[] = [...picoLeft.map((n, i) => [n, i + 1] as const), ...picoRight.map((n, i) => [n, 40 - i] as const)].map(([name, physical]) => {
  if (name.startsWith('GND') || name === 'AGND') return { name, role: 'gnd', physical } as BoardPin;
  if (name === 'VBUS') return { name, role: 'power', voltage: 5, physical } as BoardPin;
  if (name === 'VSYS') return { name, role: 'power', voltage: 5, physical, caution: 'System input 1.8–5.5 V.' } as BoardPin;
  if (name === '3V3') return { name, role: 'power', voltage: 3.3, physical } as BoardPin;
  if (!name.startsWith('GP')) return { name, role: 'other', physical, caution: 'Special function pin — not a GPIO.' } as BoardPin;
  const gpio = Number(name.slice(2));
  const caps: Cap[] = gpio >= 26 ? ['in', 'out', 'pwm', 'adc'] : ['in', 'out', 'pwm'];
  const rank = gpio >= 26 ? 3 : gpio <= 1 ? 6 : 1;
  const alt: string[] = [];
  if (gpio % 4 === 0 && gpio <= 20) alt.push(`I2C${(gpio / 2) % 2}_SDA`);
  if (gpio % 4 === 1 && gpio <= 21) alt.push(`I2C${((gpio - 1) / 2) % 2}_SCL`);
  return { name, gpio, role: 'gpio', caps, rank, physical, alt, caution: gpio <= 1 ? 'UART0 TX/RX — fine to use but disables serial on these pins.' : undefined } as BoardPin;
});

// ---------------------------------------------------------------- Raspberry Pi 4 (40-pin header)
const piHeader: (string | number)[] = [
  '3V3.1', '5V.1', 2, '5V.2', 3, 'GND.1', 4, 14, 'GND.2', 15, 17, 18, 27, 'GND.3', 22, 23, '3V3.2', 24, 10, 'GND.4', 9, 25, 11, 8, 'GND.5', 7, 'ID_SD', 'ID_SC', 5, 'GND.6', 6, 12, 13, 'GND.7', 19, 16, 26, 20, 'GND.8', 21,
];
const piAlt: Record<number, string[]> = { 2: ['SDA1'], 3: ['SCL1'], 14: ['TXD'], 15: ['RXD'], 18: ['PWM0'], 12: ['PWM0'], 13: ['PWM1'], 19: ['PWM1', 'MISO1'], 10: ['MOSI'], 9: ['MISO'], 11: ['SCLK'], 8: ['CE0'], 7: ['CE1'] };
const rpiPins: BoardPin[] = piHeader.map((p, i) => {
  const physical = i + 1;
  if (typeof p === 'number') {
    const special = [2, 3, 14, 15, 7, 8, 9, 10, 11].includes(p);
    return { name: `GPIO${p}`, gpio: p, role: 'gpio', caps: ['in', 'out', 'pwm'], physical, alt: piAlt[p], rank: special ? 5 : 1 } as BoardPin;
  }
  if (p.startsWith('GND')) return { name: p, role: 'gnd', physical } as BoardPin;
  if (p.startsWith('3V3')) return { name: p, role: 'power', voltage: 3.3, physical } as BoardPin;
  if (p.startsWith('5V')) return { name: p, role: 'power', voltage: 5, physical } as BoardPin;
  return { name: p, role: 'other', physical, caution: 'HAT EEPROM pins — do not use.' } as BoardPin;
});

// DevKit V1 header numbering: left row 1–15 top→bottom, right row 16–30 bottom→top (USB at the bottom).
export const ESP32_LEFT = ['EN', 'VP', 'VN', 'D34', 'D35', 'D32', 'D33', 'D25', 'D26', 'D27', 'D14', 'D12', 'D13', 'GND.2', 'VIN'];
export const ESP32_RIGHT = ['3V3', 'GND.1', 'D15', 'D2', 'D4', 'RX2', 'TX2', 'D5', 'D18', 'D19', 'D21', 'RX0', 'TX0', 'D22', 'D23'];
for (const p of esp32Pins) {
  const l = ESP32_LEFT.indexOf(p.name);
  p.physical = l >= 0 ? l + 1 : 16 + ESP32_RIGHT.indexOf(p.name);
}

// ---------------------------------------------------------------- Arduino Nicla family (22.86 mm square)
// Every fact below is quoted with its source in docs/boards/nicla.md. Both boards have header J1 (8 pads,
// left edge, pad 1 at the bottom) and J2 (9 pads, right edge, pad 1 at the bottom) in the top view.
// Their digital header pins go through level translators powered by VDDIO_EXT (3.3 V once the board
// starts), which Arduino calls "low power": they can't drive LEDs, buzzers or relays directly.
const NICLA_ADC_VISION = 'Analog pin: wired straight to the STM32, which "can just handle 1.8 V, a greater input may damage the board" (Arduino). Keep it at or below 1.8 V.';
const NICLA_ADC_VOICE = 'Analog pin: the ADC reference is fixed to 1.8 V, so readings stop rising above 1.8 V (Arduino says the input itself tolerates 3.3 V).';
const NICLA_VIN = 'Power INPUT (3.5–5.5 V). Arduino does not document it as a 5 V output: power 5 V parts from their own supply.';
const NICLA_NC = 'Not connected.';

/** STM32 pin → number (port × 16 + pin, the mbed PinName encoding: PA9 → 9, PG12 → 108). The firmware uses the name (fw). */
const stm = (pin: string) => (pin.charCodeAt(1) - 65) * 16 + Number(pin.slice(2));
const niclaPin = (header: string, pin: Omit<BoardPin, 'header'>): BoardPin => ({ ...pin, header });

const niclaVisionPins: BoardPin[] = [
  niclaPin('J1-1', { name: 'D0', gpio: stm('PG12'), fw: 'D0', role: 'gpio', caps: ['in', 'out'], rank: 1, alt: ['LPIO0', 'PG12'] }),
  niclaPin('J1-2', { name: 'A2', gpio: stm('PF3'), fw: 'A2', role: 'gpio', caps: ['in', 'out', 'adc'], rank: 8, alt: ['PF3'], caution: NICLA_ADC_VISION }),
  niclaPin('J1-3', { name: 'CS', gpio: stm('PE11'), fw: 'CS', role: 'gpio', caps: ['in', 'out', 'pwm'], rank: 2, alt: ['SPI4 CS', 'PE11', 'TIM1_CH2'] }),
  niclaPin('J1-4', { name: 'COPI', gpio: stm('PE14'), fw: 'COPI', role: 'gpio', caps: ['in', 'out', 'pwm'], rank: 2, alt: ['SPI4 COPI', 'PE14', 'TIM1_CH4'] }),
  niclaPin('J1-5', { name: 'CIPO', gpio: stm('PE13'), fw: 'CIPO', role: 'gpio', caps: ['in', 'out', 'pwm'], rank: 2, alt: ['SPI4 CIPO', 'PE13', 'TIM1_CH3'] }),
  niclaPin('J1-6', { name: 'SCLK', gpio: stm('PE12'), fw: 'PE12', role: 'gpio', caps: ['in', 'out'], rank: 2, alt: ['SPI4 SCK', 'PE12'] }),
  niclaPin('J1-7', { name: 'A1', gpio: stm('PF13'), fw: 'A1', role: 'gpio', caps: ['in', 'out', 'adc'], rank: 8, alt: ['PF13'], caution: NICLA_ADC_VISION }),
  niclaPin('J1-8', { name: 'A0', gpio: stm('PC4'), fw: 'A0', role: 'gpio', caps: ['in', 'out', 'adc'], rank: 8, alt: ['PC4'], caution: NICLA_ADC_VISION }),
  niclaPin('J2-1', { name: 'SDA', gpio: stm('PB9'), fw: 'SDA', role: 'gpio', caps: ['in', 'out', 'pwm'], rank: 5, alt: ['I2C1 SDA', 'PB9'] }),
  niclaPin('J2-2', { name: 'SCL', gpio: stm('PB8'), fw: 'SCL', role: 'gpio', caps: ['in', 'out', 'pwm'], rank: 5, alt: ['I2C1 SCL', 'PB8'] }),
  niclaPin('J2-3', { name: 'D1', gpio: stm('PA9'), fw: 'D1', role: 'gpio', caps: ['in', 'out', 'pwm'], rank: 1, alt: ['LPIO1', 'UART TX', 'PA9', 'TIM1_CH2'] }),
  niclaPin('J2-4', { name: 'D2', gpio: stm('PA10'), fw: 'D2', role: 'gpio', caps: ['in', 'out', 'pwm'], rank: 1, alt: ['LPIO2', 'UART RX', 'PA10', 'TIM1_CH3'] }),
  niclaPin('J2-5', { name: 'D3', gpio: stm('PG1'), fw: 'D3', role: 'gpio', caps: ['in', 'out'], rank: 1, alt: ['LPIO3', 'PG1'] }),
  niclaPin('J2-6', { name: 'GND', role: 'gnd' }),
  // Logic-level rail for the header: 3.3 V ("VDDIO_EXT (+3V3)", pinout), software-programmable 1.8–3.3 V.
  niclaPin('J2-7', { name: 'VDDIO_EXT', role: 'power', voltage: 3.3 }),
  niclaPin('J2-8', { name: 'NC', role: 'other', caution: NICLA_NC }),
  niclaPin('J2-9', { name: 'VIN', role: 'power', voltage: 5, caution: NICLA_VIN }),
];

/** Nicla Voice: gpio = nRF52832 P0.xx number; fw = the Arduino pin number from the core's variant.cpp. */
const niclaVoicePins: BoardPin[] = [
  niclaPin('J1-1', { name: 'LPIO0', gpio: 24, fw: '5', role: 'gpio', caps: ['in', 'out'], rank: 1, alt: ['P0_24', 'NDP120 GPIO15'] }),
  niclaPin('J1-2', { name: 'NC.1', role: 'other', caution: NICLA_NC }),
  niclaPin('J1-3', { name: 'CS', gpio: 29, fw: '6', role: 'gpio', caps: ['in', 'out'], rank: 2, alt: ['SPI CS', 'P0_29'] }),
  niclaPin('J1-4', { name: 'COPI', gpio: 27, fw: '8', role: 'gpio', caps: ['in', 'out'], rank: 2, alt: ['SPI COPI', 'P0_27'] }),
  niclaPin('J1-5', { name: 'CIPO', gpio: 28, fw: '7', role: 'gpio', caps: ['in', 'out'], rank: 2, alt: ['SPI CIPO', 'P0_28'] }),
  niclaPin('J1-6', { name: 'SCLK', gpio: 11, fw: '9', role: 'gpio', caps: ['in', 'out'], rank: 2, alt: ['SPI SCK', 'P0_11'] }),
  niclaPin('J1-7', { name: 'ADC2', gpio: 30, fw: 'A1', role: 'gpio', caps: ['in', 'out', 'adc'], rank: 8, alt: ['A1', 'P0_30'], caution: NICLA_ADC_VOICE }),
  niclaPin('J1-8', { name: 'ADC1', gpio: 2, fw: 'A0', role: 'gpio', caps: ['in', 'out', 'adc'], rank: 8, alt: ['A0', 'P0_02'], caution: NICLA_ADC_VOICE }),
  niclaPin('J2-1', { name: 'SDA', gpio: 22, fw: '4', role: 'gpio', caps: ['in', 'out'], rank: 5, alt: ['I2C SDA (Wire)', 'P0_22'] }),
  niclaPin('J2-2', { name: 'SCL', gpio: 23, fw: '3', role: 'gpio', caps: ['in', 'out'], rank: 5, alt: ['I2C SCL (Wire)', 'P0_23'] }),
  niclaPin('J2-3', { name: 'LPIO1', gpio: 20, fw: '2', role: 'gpio', caps: ['in', 'out'], rank: 1, alt: ['UART TX', 'P0_20', 'NDP120 GPIO14'] }),
  niclaPin('J2-4', { name: 'LPIO2', gpio: 9, fw: '1', role: 'gpio', caps: ['in', 'out'], rank: 1, alt: ['UART RX', 'P0_09', 'NDP120 GPIO16'] }),
  niclaPin('J2-5', { name: 'LPIO3', gpio: 10, fw: '0', role: 'gpio', caps: ['in', 'out'], rank: 1, alt: ['P0_10', 'NDP120 GPIO6'] }),
  niclaPin('J2-6', { name: 'GND', role: 'gnd' }),
  // Logic-level rail for the header: the PMIC's LS/LDO output, 3.3 V after nicla::begin(), 100 mA max (TI BQ25120A).
  niclaPin('J2-7', { name: 'VDDIO_EXT', role: 'power', voltage: 3.3 }),
  niclaPin('J2-8', { name: 'NC.2', role: 'other', caution: NICLA_NC }),
  niclaPin('J2-9', { name: 'VIN', role: 'power', voltage: 5, caution: NICLA_VIN }),
];

export const BOARDS: Record<Exclude<BoardId, 'none'>, BoardDef> = {
  esp32: {
    id: 'esp32',
    partType: 'esp32-devkit',
    name: 'ESP32 DevKit V1',
    short: 'ESP32',
    language: 'micropython',
    logicV: 3.3,
    maxPinMa: 40,
    adcBits: 12,
    i2c: { sda: 'D21', scl: 'D22', id: 0 },
    spi: { sck: 'D18', mosi: 'D23', miso: 'D19', cs: 'D5', id: 2 },
    supply3v3: '3V3',
    supply5v: 'VIN',
    gnd: 'GND.1',
    pins: esp32Pins,
    ledPin: 'D2',
    flashing: [
      'Install Python 3, then run `pip install esptool mpremote`.',
      'Download the latest ESP32 MicroPython firmware (.bin) from https://micropython.org/download/ESP32_GENERIC/',
      'Erase and flash: `esptool.py --chip esp32 erase_flash` then `esptool.py --chip esp32 write_flash -z 0x1000 ESP32_GENERIC-*.bin`',
      'Copy the project files: `mpremote cp *.py :` (main.py runs automatically at boot).',
      'Open the serial console with `mpremote repl` to see print() output.',
    ],
  },
  pico: {
    id: 'pico',
    partType: 'pi-pico',
    name: 'Raspberry Pi Pico',
    short: 'Pico',
    language: 'micropython',
    logicV: 3.3,
    maxPinMa: 12,
    adcBits: 16,
    i2c: { sda: 'GP4', scl: 'GP5', id: 0 },
    spi: { sck: 'GP18', mosi: 'GP19', miso: 'GP16', cs: 'GP17', id: 0 },
    supply3v3: '3V3',
    supply5v: 'VBUS',
    gnd: 'GND.1',
    pins: picoPins,
    flashing: [
      'Hold the BOOTSEL button while plugging the Pico into USB — it mounts as a drive called RPI-RP2.',
      'Drag the MicroPython .uf2 from https://micropython.org/download/RPI_PICO/ onto that drive; it reboots automatically.',
      'Install mpremote: `pip install mpremote`.',
      'Copy the project files: `mpremote cp *.py :` (main.py runs automatically at boot).',
      'Open the serial console with `mpremote repl`.',
    ],
  },
  rpi4: {
    id: 'rpi4',
    partType: 'rpi4',
    name: 'Raspberry Pi 4 Model B',
    short: 'Raspberry Pi',
    language: 'python',
    logicV: 3.3,
    maxPinMa: 16,
    adcBits: 10,
    i2c: { sda: 'GPIO2', scl: 'GPIO3', id: 1 },
    spi: { sck: 'GPIO11', mosi: 'GPIO10', miso: 'GPIO9', cs: 'GPIO8', id: 0 },
    supply3v3: '3V3.1',
    supply5v: '5V.1',
    gnd: 'GND.1',
    pins: rpiPins,
    flashing: [
      'Flash Raspberry Pi OS with Raspberry Pi Imager and boot the Pi.',
      'Enable I2C/SPI if used: `sudo raspi-config` → Interface Options.',
      'Install libraries: `sudo apt install python3-gpiozero python3-smbus2 python3-spidev`.',
      'Copy the project folder to the Pi (e.g. `scp -r project pi@raspberrypi.local:~`).',
      'Run it: `python3 main.py` (add it to crontab with @reboot to start automatically).',
    ],
  },
  'nicla-vision': {
    id: 'nicla-vision',
    partType: 'nicla-vision',
    name: 'Arduino Nicla Vision',
    short: 'Nicla Vision',
    language: 'micropython',
    logicV: 3.3,
    // Arduino gives no figure, only "low power … use a MOSFET driver or a buffer"; the TXB0108 translator
    // puts about 4 kΩ in series with each output (TI), so a pin can source well under 1 mA at 3.3 V.
    maxPinMa: 1,
    adcBits: 12,
    i2c: { sda: 'SDA', scl: 'SCL', id: 1 },
    spi: { sck: 'SCLK', mosi: 'COPI', miso: 'CIPO', cs: 'CS', id: 4 },
    supply3v3: 'VDDIO_EXT',
    supply5v: 'VIN',
    supply5vInput: true,
    gnd: 'GND',
    header: 'nicla',
    pins: niclaVisionPins,
    flashing: [
      'Install OpenMV IDE (https://openmv.io/pages/download) and plug the Nicla Vision in with a micro USB data cable.',
      'Click the "connect" (plug) button at the bottom left of OpenMV IDE. If it offers new firmware, choose "Install the latest release firmware" and wait for "DFU firmware update complete!".',
      'Copy main.py and any driver .py files onto the Nicla Vision\'s storage drive; main.py runs every time the board starts.',
      'Open the Serial Terminal in OpenMV IDE to see print() output.',
    ],
    sources: 'docs/boards/nicla.md',
  },
  'nicla-voice': {
    id: 'nicla-voice',
    partType: 'nicla-voice',
    name: 'Arduino Nicla Voice',
    short: 'Nicla Voice',
    language: 'arduino',
    logicV: 3.3,
    // Same "low power" TXB0108-translated header I/O as the Nicla Vision (see above).
    maxPinMa: 1,
    adcBits: 12,
    i2c: { sda: 'SDA', scl: 'SCL', id: 0 },
    spi: { sck: 'SCLK', mosi: 'COPI', miso: 'CIPO', cs: 'CS', id: 0 },
    supply3v3: 'VDDIO_EXT',
    supply5v: 'VIN',
    supply5vInput: true,
    gnd: 'GND',
    header: 'nicla',
    pins: niclaVoicePins,
    flashing: [
      'Install the Arduino IDE (https://www.arduino.cc/en/software). In Tools → Board → Boards Manager, search for "nicla" and install "Arduino Mbed OS Nicla Boards".',
      'Plug the Nicla Voice in with a micro USB data cable and pick Tools → Board → Arduino Mbed OS Nicla Boards → Arduino Nicla Voice, and its port.',
      'Put sketch.ino in a folder called "sketch", open it and click Upload.',
      'Open the Serial Monitor at 115200 baud to see the messages.',
    ],
    sources: 'docs/boards/nicla.md',
  },
};

/** The pin as the board's firmware names it: `Pin("D0")` on the Nicla Vision, the GPIO number elsewhere. */
export function fwPin(board: BoardDef, gpio: number): string {
  const p = pinByGpio(board, gpio);
  return p?.fw !== undefined ? (board.language === 'arduino' ? p.fw : JSON.stringify(p.fw)) : String(gpio);
}

export function boardFor(id: BoardId): BoardDef | undefined {
  return id === 'none' ? undefined : BOARDS[id];
}

export function boardPin(board: BoardDef, name: string): BoardPin | undefined {
  return board.pins.find((p) => p.name === name);
}

export function pinByGpio(board: BoardDef, gpio: number): BoardPin | undefined {
  return board.pins.find((p) => p.gpio === gpio);
}

/** Name of the power pin group a pin belongs to ("GND.2" → "GND"). Pins sharing a group are tied internally. */
export function internalGroup(pinName: string): string {
  const m = /^(GND|3V3|5V)(\.\d+)?$/.exec(pinName);
  if (m) return m[1];
  if (pinName === 'AGND') return 'GND';
  return pinName;
}

/** Shown instead of a simulation for boards whose program is an Arduino sketch (the Nicla Voice). */
export function arduinoSimMessage(boardName: string): string {
  return `Simulation for the ${boardName} needs the firmware emulator (coming). Its program is an Arduino C++ sketch, which the browser Python simulator can't run. The wiring checks still work.`;
}
