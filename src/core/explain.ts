// Plain-English explanation of one line of firmware, for the code editor's hover tooltip.
// Covers the MicroPython / gpiozero calls and Python constructs Sparkbench programs use, and names
// the part on any pin number ("pin 13 is Button A").
import type { Project } from './types';

type Rule = [RegExp, (m: RegExpMatchArray) => string];

const RULES: Rule[] = [
  [/^\s*#\s*(.*)/, () => 'A comment: a note for people reading the code. The board ignores it.'],
  [/^\s*(import|from)\s+([\w.]+)/, (m) => `Loads the "${m[2]}" library so the program can use what's in it.${LIB[m[2]] ? ` ${LIB[m[2]]}` : ''}`],
  [/^\s*def\s+(\w+)\s*\((.*)\)\s*:/, (m) => `Defines a function called ${m[1]}: a named recipe of steps the program can run whenever it says ${m[1]}(…).${m[2].trim() ? ` It takes: ${m[2].trim()}.` : ''}`],
  [/^\s*class\s+(\w+)/, (m) => `Defines a new kind of object called ${m[1]}, bundling some data with the functions that work on it.`],
  [/^\s*while\s+True\s*:/, () => 'Starts the main loop: everything indented below runs again and again, forever, while the board is powered.'],
  [/^\s*while\s+(.+):/, (m) => `Repeats the indented lines below for as long as ${m[1].trim()} is true.`],
  [/^\s*for\s+(\w+)\s+in\s+range\((\d+)\)\s*:/, (m) => `Repeats the indented lines ${m[2]} times, counting with ${m[1]} from 0 to ${Number(m[2]) - 1}.`],
  [/^\s*for\s+(.+)\s+in\s+(.+):/, (m) => `Goes through each item in ${m[2].trim()} in turn, calling it ${m[1].trim()}, and runs the indented lines for each.`],
  [/^\s*if\s+(.+):/, (m) => `Only runs the indented lines below if ${m[1].trim()} is true.`],
  [/^\s*elif\s+(.+):/, (m) => `Otherwise, if ${m[1].trim()} is true, runs the lines below instead.`],
  [/^\s*else\s*:/, () => 'Otherwise (none of the conditions above were true), runs the lines below.'],
  [/^\s*try\s*:/, () => 'Tries the indented lines; if one fails (for example a sensor doesn’t answer), the program jumps to "except" instead of crashing.'],
  [/^\s*except/, () => 'What to do if something in the "try" block failed, so the program keeps running.'],
  [/^\s*return\b(.*)/, (m) => (m[1].trim() ? `Ends this function and hands back ${m[1].trim()}.` : 'Ends this function here.')],
  [/^\s*global\s+(.+)/, (m) => `Says this function changes the shared variable${m[1].includes(',') ? 's' : ''} ${m[1].trim()} (not a private copy).`],
  [/^\s*print\((.*)\)/, () => 'Prints a message to the serial console (the Serial monitor tab, or `mpremote repl` on the real board).'],
  [/time\.sleep_ms\((\w+)\)|time\.sleep\(([\d.]+)\)/, (m) => `Waits ${m[1] ? `${m[1]} milliseconds` : `${m[2]} seconds`} before carrying on.`],
  [/time\.ticks_ms\(\)/, () => 'Reads a stopwatch: the number of milliseconds since the board started. Used to time things without stopping the program.'],
  [/time\.ticks_diff\(/, () => 'Works out how many milliseconds passed between two stopwatch readings (handles the stopwatch wrapping round).'],
  [/Pin\((\d+),\s*Pin\.IN,\s*Pin\.PULL_UP\)/, () => 'Sets up a pin as an input with its built-in pull-up resistor: it reads 1 normally and 0 when a button connects it to GND.'],
  [/Pin\((\d+),\s*Pin\.IN\)/, () => 'Sets up a pin as an input, to read whether a signal is high (1) or low (0).'],
  [/Pin\((\d+),\s*Pin\.OUT/, () => 'Sets up a pin as an output the program can switch on (3.3 V) or off (0 V).'],
  [/PWM\(Pin\((\d+)\)(?:,\s*freq=(\d+))?/, (m) => `Sets up PWM on pin ${m[1]}: the pin switches on and off very fast${m[2] ? ` (${m[2]} times a second)` : ''}, which dims an LED, drives a servo or makes a buzzer sing.`],
  [/ADC\(Pin\((\d+)\)\)/, (m) => `Sets up pin ${m[1]} to measure a voltage (analog input), e.g. from a knob or a light sensor.`],
  [/\.atten\(ADC\.ATTN_11DB\)/, () => 'Lets the analog input measure the full 0–3.3 V range.'],
  [/I2C\((\d+),\s*scl=Pin\((\d+)\),\s*sda=Pin\((\d+)\)/, (m) => `Sets up the I2C bus: two shared wires (clock on pin ${m[2]}, data on pin ${m[3]}) that screens and sensors use to talk to the board.`],
  [/SPI\(/, () => 'Sets up the SPI bus: a fast set of wires used by displays like the e-paper screen.'],
  [/\.duty_u16\(([^)]*)\)/, (m) => `Sets how much of each PWM cycle the pin is on: 0 = off, 65535 = fully on${/^\d+$/.test(m[1]) ? ` (here ${Math.round((Number(m[1]) / 65535) * 100)} %)` : ''}.`],
  [/\.read_u16\(\)/, () => 'Reads the analog voltage as a number from 0 (0 V) to 65535 (3.3 V).'],
  [/\.value\(\)/, () => 'Reads the pin: 1 if it is high (3.3 V), 0 if low (0 V).'],
  [/\.value\((0|1|True|False)\)/, (m) => `Switches the pin ${m[1] === '1' || m[1] === 'True' ? 'on (3.3 V)' : 'off (0 V)'}.`],
  [/\.measure\(\)/, () => 'Asks the temperature/humidity sensor to take a new reading (it can only do this every 2 seconds).'],
  [/\.temperature\(\)/, () => 'Gets the last temperature reading, in °C.'],
  [/\.humidity\(\)/, () => 'Gets the last humidity reading, in % relative humidity.'],
  [/\.accel\(\)/, () => 'Reads the accelerometer: how much gravity/acceleration the board feels along x, y and z, in g (1 g = gravity).'],
  [/\.fill\(0\)/, () => 'Clears the whole screen (in memory; show() puts it on the display).'],
  [/\.text\(([^,]+),/, (m) => `Draws the text ${m[1].trim()} on the screen at the given x, y position (in memory until show()).`],
  [/\.show\(\)/, () => 'Sends everything drawn so far to the screen, so it actually appears.'],
  [/\.write\(\)/, () => 'Sends the new colours to the NeoPixel LEDs.'],
  [/time_pulse_us\(/, () => 'Measures how long a pin stays high, in microseconds; the ultrasonic sensor’s echo time tells the distance (about 58 µs per cm).'],
  [/Button\((\d+)/, (m) => `Sets up a button on GPIO${m[1]} (gpiozero handles the pull-up and debouncing for you).`],
  [/PWMLED\((\d+)\)|LED\((\d+)\)/, (m) => `Sets up an LED on GPIO${m[1] ?? m[2]} that the program can turn on, off or dim.`],
  [/AngularServo\((\d+)/, (m) => `Sets up a servo on GPIO${m[1]}; you set its angle in degrees.`],
  [/MCP3008\(channel=(\d+)\)/, (m) => `Reads analog channel ${m[1]} of the MCP3008 chip, because the Raspberry Pi can’t measure voltages by itself.`],
  [/^\s*(\w+)\s*=\s*(-?[\d.]+)\s*(#.*)?$/, (m) => `Stores the number ${m[2]} in a variable called ${m[1]}.${m[3] ? ` ${m[3].replace(/^#\s*/, '')}` : ''}`],
  [/^\s*(\w+)\s*=\s*(.+)$/, (m) => `Stores the result of ${m[2].trim().slice(0, 60)} in ${m[1]}, so later lines can use it.`],
];

const LIB: Record<string, string> = {
  machine: 'It controls the board’s hardware: pins, PWM, analog inputs, I2C and SPI.',
  time: 'It handles waiting and timing.',
  ssd1306: 'It’s the driver for the small OLED screen.',
  dht: 'It reads the DHT22 temperature/humidity sensor.',
  mpu6050: 'It reads the MPU-6050 motion sensor.',
  neopixel: 'It controls NeoPixel colour LEDs.',
  network: 'It connects to Wi-Fi.',
  urequests: 'It fetches data from the internet (HTTP).',
  gpiozero: 'It’s the friendly Raspberry Pi library for buttons, LEDs, servos and sensors.',
  math: 'It has maths functions like sqrt and atan2.',
};

/** Explanation for one line, or null if there is nothing useful to say (blank lines). */
export function explainLine(line: string, project?: Project | null): string | null {
  if (!line.trim()) return null;
  let text: string | null = null;
  for (const [re, f] of RULES) {
    const m = line.match(re);
    if (m) {
      text = f(m);
      break;
    }
  }
  if (!text) text = 'Runs this step of the program.';
  // Name the part wired to any GPIO number on this line.
  if (project?.features?.length && !/^\s*#/.test(line)) {
    const nums = [...line.matchAll(/(?:Pin\(|GPIO|Button\(|LED\(|PWMLED\(|AngularServo\(|MotionSensor\(|OutputDevice\(|PWMOutputDevice\(|board\.D)(\d+)/g)].map((m) => Number(m[1]));
    const named = [...new Set(nums)]
      .map((n) => {
        const f = project.features!.find((x) => Object.values(x.gpio).includes(n));
        if (!f) return null;
        const sig = Object.entries(f.gpio).find(([, g]) => g === n)?.[0];
        return `pin ${n} is ${f.label}${sig && sig !== 'pin' ? ` (${sig.toUpperCase()})` : ''}`;
      })
      .filter(Boolean);
    if (named.length) text += ` On your board, ${named.join('; ')}.`;
  }
  return text;
}
