// Documents for making the board: a bring-up test procedure (TEST.md) and a pre-compliance
// checklist (COMPLIANCE.md). Both are derived from the design, so they stay accurate.
import type { Project } from './types';
import type { AcceptanceTest, TestStep } from './acceptance';
import type { MeterCheck } from './multimeter';
import { partDef } from './parts';
import { boardFor } from './boards';
import { revLabel } from './revisions';

function stepText(s: TestStep): string {
  switch (s.kind) {
    case 'wait':
      return `wait ${s.ms >= 1000 ? `${s.ms / 1000} s` : `${s.ms} ms`}`;
    case 'press':
      return `press ${s.part}`;
    case 'set':
      return `make ${s.part} read ${s.control} = ${s.value} (on real hardware: change what it senses)`;
    case 'expect':
      return `check ${s.what === 'screen' ? `${s.part} shows "${s.text}"` : s.what === 'serial' ? `the serial output says "${s.text}"` : s.what === 'no-error' ? 'nothing crashed' : `${s.part} is ${s.on === false ? 'off' : 'on'}`}`;
  }
}

export function testProcedure(project: Project, opts: { tests: AcceptanceTest[]; selftestExpected: string; meter: MeterCheck[] }): string {
  const board = boardFor(project.board);
  const polar = project.parts.filter((p) => ['led', 'rgb-led', 'electrolytic', 'diode', 'buzzer', 'ne555', 'mcp3008', 'npn'].includes(p.type));
  const L: string[] = [`# ${project.name}: board test procedure (${revLabel(project)})`, '', 'Do these in order on every new board. Tick each box.', ''];
  L.push('## 1. Look before you power it', '');
  L.push('- [ ] No solder bridges between neighbouring pads (look closely at sockets and chips).');
  for (const p of polar) {
    const d = partDef(p.type);
    const how = p.type === 'led' || p.type === 'rgb-led' ? 'short leg (flat side) in the square pad' : p.type === 'electrolytic' ? 'striped (−) leg away from the square + pad' : p.type === 'diode' ? 'stripe matches the line on the silkscreen' : p.type === 'npn' ? 'flat face matches the silkscreen outline' : p.type === 'buzzer' ? '+ leg in the + pad' : 'notch matches the silkscreen notch';
    L.push(`- [ ] ${p.ref} ${d.name}: ${how}.`);
  }
  L.push('- [ ] Sockets: pin 1 of each plug-in board/module matches the pin names printed beside the socket.', '');
  L.push('## 2. Check for shorts (power OFF)', '');
  L.push('- [ ] Multimeter on resistance (Ω): touch one probe to the board’s + supply (the 3V3/5V/VIN pin or the + battery pad) and the other to GND (ground, the − side). You should read more than 100 Ω. A beep or 0 Ω means a short circuit: don’t power it.', '');
  L.push('## 3. Power on and measure', '');
  if (opts.meter.length) {
    L.push('Multimeter on DC volts, black probe on GND:', '');
    for (const m of opts.meter.slice(0, 8)) L.push(`- [ ] ${m.what}: about ${m.range ? `${m.range[0]}–${m.range[1]}` : m.expectV} V`);
    L.push('');
  }
  if (board && project.board !== 'rpi4') {
    L.push('## 4. Program and self-test', '');
    L.push(`- [ ] Install MicroPython and copy the files (Sparkbench → **Your board**, or: ${board.flashing.slice(-2).join(' ')}).`);
    L.push('- [ ] Run `selftest.py`. A good board prints:', '', '```', opts.selftestExpected.replace('[program finished]', '').trim(), '```', '');
  } else if (board) {
    L.push('## 4. Self-test', '', '- [ ] Copy the files to the Pi and run `python3 selftest.py`. A good board prints:', '', '```', opts.selftestExpected.replace('[program finished]', '').trim(), '```', '');
  }
  if (opts.tests.length) {
    L.push(`## ${board ? 5 : 4}. Does it do what it should?`, '');
    for (const t of opts.tests) L.push(`- [ ] **${t.title}** — ${t.steps.map(stepText).join(', then ')}.`);
    L.push('');
  }
  L.push('Record the board serial number and the date next to each passed board.', '');
  return L.join('\n');
}

export function complianceChecklist(project: Project): string {
  const board = boardFor(project.board);
  const radio = project.board === 'esp32' || project.board === 'rpi4';
  const mains = project.parts.some((p) => p.type === 'relay');
  const battery = project.parts.some((p) => p.type === 'battery-9v');
  const L: string[] = [
    `# ${project.name}: pre-compliance checklist`,
    '',
    'This is a starting point, not legal advice. Selling electronics usually needs testing by an accredited lab; this list helps you get ready and avoid surprises. Hobby and personal builds don’t need any of this.',
    '',
    '## Where you will sell it',
    '',
    '- [ ] **USA (FCC Part 15):** every digital device is an "unintentional radiator" (Part 15B emissions test or a Supplier’s Declaration of Conformity).',
    '- [ ] **EU/UK (CE / UKCA):** EMC Directive, RoHS, and the Low Voltage Directive above 50 V AC / 75 V DC. Write a Declaration of Conformity and keep a technical file.',
    '',
    '## This design',
    '',
  ];
  if (radio)
    L.push(`- [ ] **It has a radio** (${board?.name}: Wi-Fi/Bluetooth). Use the pre-certified module as-is (no antenna changes, keep the antenna area clear of copper and metal), and keep its FCC ID / CE certificate. In the EU the Radio Equipment Directive applies to the whole product.`);
  else L.push(`- [ ] No radio on board${board ? ` (${board.name})` : ''}: only the unintentional-radiator rules apply.`);
  L.push('- [ ] **RoHS:** order RoHS parts (Sparkbench’s LCSC picks are RoHS) and lead-free solder, and keep the part datasheets.');
  if (mains) L.push('- [ ] **The relay can switch mains or high current.** Keep mains wiring off this board: use an enclosed, certified relay module or a certified smart plug, with fuse, strain relief, earthing and creepage distances checked by a professional. Selling mains-switching products needs electrical-safety testing (UL/IEC 62368-1).');
  if (battery) L.push('- [ ] **Battery powered:** a 9 V alkaline battery is fine to ship separately. Lithium batteries need UN38.3 transport documents.');
  L.push(
    '- [ ] **Power supply:** if you include a USB charger or adapter, buy a certified one (with its own FCC/CE/UL marks); don’t design your own mains supply.',
    '- [ ] **Enclosure:** no sharp edges, nothing hot to the touch, and battery or mains parts mustn’t be reachable without a tool.',
    '- [ ] **ESD:** add a TVS diode on exposed connectors if people will plug and unplug things while it’s running.',
    '',
    '## Labels and paperwork',
    '',
    `- [ ] Product label: name (${project.name}), model/revision (${revLabel(project)}), power rating (e.g. "5 V ⎓ 0.5 A"), your company name and address, serial number.`,
    '- [ ] Marks: FCC statement (USA), CE/UKCA mark (EU/UK), WEEE crossed-out bin (EU), recycling note.',
    '- [ ] User manual with safety warnings and how to dispose of it.',
    '',
  );
  return L.join('\n');
}
