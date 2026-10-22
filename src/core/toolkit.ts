// "What you'll need" beyond the parts list: the board-specific cable, breadboard, wires and tools,
// each with why it's needed. Rendered with pictures in the Build guide.
import type { Project } from './types';
import { planBreadboard } from './bbplace';

export interface ToolItem {
  id: 'breadboard' | 'cobbler' | 'jumpers' | 'jumpers-mf' | 'usb-micro' | 'usb-c-power' | 'computer' | 'battery-snap' | 'multimeter' | 'soldering' | 'screwdriver' | 'tweezers' | 'microsd';
  name: string;
  why: string;
  required: boolean;
}

export interface BenchCounts {
  /** Full-size (830-hole) breadboards the layout uses. */
  breadboards: number;
  /** Male-to-male jumpers in the hole-by-hole layout. */
  jumpers: number;
  /** Male-to-female leads to parts that sit off the breadboard. */
  femaleLeads: number;
  /** Raspberry Pi: a 40-pin T-Cobbler + ribbon cable brings the GPIO header onto the breadboard. */
  cobbler: boolean;
  /** Hole-by-hole build steps, and the time estimate every page quotes. */
  steps: number;
  minutes: number;
}

const counted = new WeakMap<Project, BenchCounts>();

/** The one source of truth for breadboard size, wire counts and build time (from the breadboard layout). */
export function benchCounts(project: Project): BenchCounts {
  const hit = counted.get(project);
  if (hit) return hit;
  let plan: ReturnType<typeof planBreadboard>;
  try {
    plan = planBreadboard(project);
  } catch {
    // No layout possible (unknown parts): fall back to the schematic's wire count.
    const n = project.wires.length;
    return { breadboards: 1, jumpers: n, femaleLeads: 0, cobbler: false, steps: n + project.parts.length, minutes: Math.max(10, Math.round(((n + project.parts.length) * 1.5) / 5) * 5) };
  }
  const steps = plan.steps.length;
  const out: BenchCounts = {
    breadboards: (plan.layout.cols ?? 63) > 63 ? 2 : 1,
    jumpers: plan.layout.wires.length,
    femaleLeads: plan.layout.parts.filter((p) => p.kind === 'offboard').reduce((n, p) => n + Object.keys(p.legs).length, 0),
    cobbler: plan.layout.parts.some((p) => p.kind === 'cobbler'),
    steps,
    minutes: Math.max(10, Math.round((steps * 1.5) / 5) * 5),
  };
  counted.set(project, out);
  return out;
}

/** "at least 25": a pack size with a few spares. */
export const jumpersToBuy = (n: number) => Math.ceil((n + 4) / 5) * 5;

export function toolkit(project: Project): ToolItem[] {
  const out: ToolItem[] = [];
  const { breadboards, jumpers, femaleLeads: offBoard, cobbler } = benchCounts(project);
  out.push({ id: 'breadboard', name: breadboards > 1 ? 'Two full-size breadboards (830 holes each)' : 'A full-size breadboard (830 holes)', why: 'Everything plugs into it, no soldering. The layout in this guide is for this size.', required: true });
  if (cobbler) out.push({ id: 'cobbler', name: '40-pin T-Cobbler breakout with ribbon cable', why: "Brings the Pi's GPIO pins onto the breadboard with the pin names printed next to them, so you don't wire straight onto the Pi.", required: true });
  out.push({ id: 'jumpers', name: `Male-to-male jumper wires (at least ${jumpersToBuy(jumpers)})`, why: `This build uses ${jumpers} jumpers. A mixed-length kit is easiest; pre-cut "breadboard jumper" kits lie flat and make mistakes easy to see.`, required: true });
  if (offBoard) out.push({ id: 'jumpers-mf', name: `Male-to-female jumper wires (${offBoard})`, why: 'For the parts that sit off the breadboard (screens, servos, modules with pins): the female end slides onto their pins.', required: true });
  if (project.board === 'esp32' || project.board === 'pico' || project.board === 'nicla-vision' || project.board === 'nicla-voice') {
    out.push({ id: 'usb-micro', name: 'Micro-USB data cable', why: `Powers the ${project.board === 'esp32' ? 'ESP32 DevKit' : project.board === 'pico' ? 'Pico' : project.board === 'nicla-vision' ? 'Nicla Vision' : 'Nicla Voice'} and carries the program. Many cables only charge: if the computer doesn't see the board, try another cable.`, required: true });
    if (project.board === 'nicla-vision') out.push({ id: 'computer', name: 'A computer with OpenMV IDE', why: 'To install the OpenMV firmware, copy the program onto the board and watch what it prints.', required: true });
    else if (project.board === 'nicla-voice') out.push({ id: 'computer', name: 'A computer with the Arduino IDE', why: 'To compile and upload the sketch and watch what it prints.', required: true });
    else out.push({ id: 'computer', name: 'A computer with Chrome or Edge', why: 'To copy the program onto the board from Sparkbench ("Your board") and watch what it prints.', required: true });
    if (project.board === 'nicla-vision' || project.board === 'nicla-voice') out.push({ id: 'soldering', name: 'Soldering iron, solder and 2.54 mm male headers (1×8 and 1×9)', why: 'The Nicla has bare edge pads: solder headers on so it plugs into the breadboard.', required: true });
  }
  if (project.board === 'rpi4') {
    out.push({ id: 'usb-c-power', name: 'USB-C power supply (5 V, 3 A)', why: 'The Raspberry Pi 4 needs a proper supply; a phone charger often causes random restarts.', required: true });
    out.push({ id: 'microsd', name: 'microSD card (16 GB or more) with Raspberry Pi OS', why: 'The Pi runs from it. Raspberry Pi Imager writes it for you.', required: true });
    out.push({ id: 'computer', name: 'A computer on the same Wi-Fi', why: 'To copy the program to the Pi over the network.', required: true });
  }
  if (project.parts.some((p) => p.type === 'battery-9v')) out.push({ id: 'battery-snap', name: '9 V battery snap with wire leads', why: 'Its two leads plug straight into the power rails.', required: true });
  if (project.parts.some((p) => p.type === 'dc-supply')) out.push({ id: 'screwdriver', name: 'Small screwdriver', why: 'For the screw terminals on the external supply\'s barrel-jack adapter.', required: true });
  if (project.parts.some((p) => p.type === 'neopixel-ring')) out.push({ id: 'soldering', name: 'Soldering iron and solder', why: 'The NeoPixel ring has bare pads: three short wires need soldering on.', required: true });
  if (project.parts.some((p) => p.type === 'lcd1602' || p.type === 'pir') && !out.some((t) => t.id === 'screwdriver')) out.push({ id: 'screwdriver', name: 'Small screwdriver', why: 'For the adjustment screw on the screen or sensor module.', required: true });
  out.push({ id: 'multimeter', name: 'Multimeter (optional)', why: 'For the guided voltage checks if something doesn’t work. A basic one is fine.', required: false });
  out.push({ id: 'tweezers', name: 'Small pliers or tweezers (optional)', why: 'Make it easier to push short legs into the right hole.', required: false });
  return out;
}
