// Breadboard pictures for parts that have no Wokwi element. Each part declares its pin
// coordinates (relative to its top-left corner) next to the drawing that puts them there.
import React from 'react';
import { BOARDS } from '../../core/boards';
import type { PartVisual } from '../../sim/engine';
import { partSize, customModuleSize } from '../../core/layout';
import { customSpec } from '../../core/customParts';

type Pins = Record<string, { x: number; y: number }>;

const pico = BOARDS.pico;
const PICO_PITCH = 9.5;
const picoPins: Pins = {};
for (const p of pico.pins) {
  const n = p.physical!;
  if (n <= 20) picoPins[p.name] = { x: 5, y: 10 + (n - 1) * PICO_PITCH };
  else picoPins[p.name] = { x: 79, y: 10 + (40 - n) * PICO_PITCH };
}

const rpi = BOARDS.rpi4;
const rpiPins: Pins = {};
for (const p of rpi.pins) {
  const n = p.physical!;
  const col = Math.floor((n - 1) / 2);
  rpiPins[p.name] = { x: 34 + col * 13.5, y: n % 2 === 1 ? 30 : 16 };
}

export const CUSTOM_PINS: Record<string, Pins> = {
  'pi-pico': picoPins,
  rpi4: rpiPins,
  ldr: { '1': { x: 14, y: 68 }, '2': { x: 26, y: 68 } },
  ntc: { '1': { x: 14, y: 68 }, '2': { x: 26, y: 68 } },
  soil: { VCC: { x: 16, y: 6 }, GND: { x: 30, y: 6 }, AOUT: { x: 44, y: 6 } },
  relay: { VCC: { x: 4, y: 24 }, GND: { x: 4, y: 45 }, IN: { x: 4, y: 66 }, NO: { x: 96, y: 24 }, COM: { x: 96, y: 45 }, NC: { x: 96, y: 66 } },
  capacitor: { '1': { x: 12, y: 54 }, '2': { x: 24, y: 54 } },
  electrolytic: { '+': { x: 12, y: 68 }, '-': { x: 24, y: 68 } },
  diode: { A: { x: 2, y: 8 }, K: { x: 62, y: 8 } },
  npn: { E: { x: 10, y: 68 }, B: { x: 22, y: 68 }, C: { x: 34, y: 68 } },
  ne555: { GND: { x: 18, y: 78 }, TRIG: { x: 36, y: 78 }, OUT: { x: 54, y: 78 }, RESET: { x: 72, y: 78 }, VCC: { x: 18, y: 2 }, DIS: { x: 36, y: 2 }, THR: { x: 54, y: 2 }, CTRL: { x: 72, y: 2 } },
  mcp3008: Object.fromEntries([
    ...['CH0', 'CH1', 'CH2', 'CH3', 'CH4', 'CH5', 'CH6', 'CH7'].map((n, i) => [n, { x: 12 + i * 18, y: 78 }]),
    ...['VDD', 'VREF', 'AGND', 'CLK', 'DOUT', 'DIN', 'CS', 'DGND'].map((n, i) => [n, { x: 12 + i * 18, y: 2 }]),
  ]),
  'battery-9v': { '+': { x: 22, y: 6 }, '-': { x: 48, y: 6 } },
  'dc-supply': { '+': { x: 30, y: 66 }, '-': { x: 60, y: 66 } },
  'dc-motor': { '+': { x: 26, y: 68 }, '-': { x: 44, y: 68 } },
  'level-shifter': { LV: { x: 5, y: 12 }, GND: { x: 5, y: 26 }, LV1: { x: 5, y: 40 }, LV2: { x: 5, y: 52 }, HV: { x: 75, y: 12 }, HV1: { x: 75, y: 40 }, HV2: { x: 75, y: 52 } },
  epaper29: Object.fromEntries(['VCC', 'GND', 'DIN', 'CLK', 'CS', 'DC', 'RST', 'BUSY'].map((n, i) => [n, { x: 58 + i * 32, y: 184 }])),
};

const pinDot = (x: number, y: number, key: string) => <rect key={key} x={x - 2.5} y={y - 2.5} width={5} height={5} rx={1} fill="#c9b37a" stroke="#6b5a2a" strokeWidth={0.6} />;

/** Pin positions for a datasheet-defined part (see GenericModule). */
export function genericPins(type: string): Pins {
  const cs = customSpec(type);
  if (!cs) return {};
  const [, h] = customModuleSize(cs.pins.length);
  return Object.fromEntries(cs.pins.map((p, i) => [p.name, { x: 21 + i * 18, y: h - 4 }]));
}

/** A colour TFT's thumbnail. */
function TftScreen({ x, y, tft }: { x: number; y: number; tft: { w: number; h: number; thumb: number[]; on: boolean } }) {
  const url = React.useMemo(() => {
    if (typeof document === 'undefined') return '';
    const c = document.createElement('canvas');
    c.width = tft.w;
    c.height = tft.h;
    const ctx = c.getContext('2d');
    if (!ctx) return '';
    const img = ctx.createImageData(tft.w, tft.h);
    for (let i = 0; i < tft.w * tft.h; i++) {
      img.data[i * 4] = tft.on ? tft.thumb[i * 3] : 0;
      img.data[i * 4 + 1] = tft.on ? tft.thumb[i * 3 + 1] : 0;
      img.data[i * 4 + 2] = tft.on ? tft.thumb[i * 3 + 2] : 0;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c.toDataURL();
  }, [tft]);
  const s = 34 / Math.max(tft.w, tft.h);
  return url ? <image href={url} x={x} y={y} width={tft.w * s} height={tft.h * s} style={{ imageRendering: 'pixelated' }} /> : null;
}

/** A character LCD's text, row by row, on a green or dark panel depending on the backlight. */
function LcdScreen({ x, y, w, lcd }: { x: number; y: number; w: number; lcd: NonNullable<PartVisual['lcd']> }) {
  const cols = lcd.cols ?? 16;
  const rows = Math.max(1, Math.ceil(lcd.chars.length / cols));
  const fs = Math.min(7, (w - 4) / (cols * 0.62));
  const text = (r: number) => String.fromCharCode(...lcd.chars.slice(r * cols, (r + 1) * cols).map((c) => (c >= 32 && c < 127 ? c : 32)));
  return (
    <g>
      <rect x={x} y={y} width={w} height={rows * fs * 1.25 + 4} rx={1.5} fill={lcd.backlight ? '#9fd24a' : '#3d4a2a'} />
      {Array.from({ length: rows }, (_, r) => (
        <text key={r} x={x + 2} y={y + 2 + (r + 1) * fs * 1.15} fontSize={fs} fontFamily="'Courier New', monospace" fill="#1c2a10" xmlSpace="preserve">
          {text(r)}
        </text>
      ))}
    </g>
  );
}

/** A datasheet OLED's picture (128×64, page format), drawn at half size. */
function OledScreen({ x, y, ram, on }: { x: number; y: number; ram: number[]; on: boolean }) {
  const url = React.useMemo(() => {
    if (typeof document === 'undefined') return '';
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 64;
    const ctx = c.getContext('2d');
    if (!ctx) return '';
    const img = ctx.createImageData(128, 64);
    for (let page = 0; page < 8; page++)
      for (let px = 0; px < 128; px++) {
        const b = on ? ram[page * 128 + px] : 0;
        for (let bit = 0; bit < 8; bit++) {
          const i = ((page * 8 + bit) * 128 + px) * 4;
          const lit = (b >> bit) & 1;
          img.data[i] = lit ? 170 : 0;
          img.data[i + 1] = lit ? 225 : 0;
          img.data[i + 2] = lit ? 255 : 0;
          img.data[i + 3] = 255;
        }
      }
    ctx.putImageData(img, 0, 0);
    return c.toDataURL();
  }, [ram, on]);
  return url ? <image href={url} x={x} y={y} width={64} height={32} style={{ imageRendering: 'pixelated' }} /> : <rect x={x} y={y} width={64} height={32} fill="#000" />;
}

function GenericModule({ type, visual }: { type: string; visual?: PartVisual }) {
  const cs = customSpec(type)!;
  const [w, h] = customModuleSize(cs.pins.length);
  const pins = genericPins(type);
  const colour = { sensor: '#1f5e8a', display: '#1b2a44', actuator: '#6a3a1f', output: '#5b2a6e', input: '#2b6b3a', ic: '#222', passive: '#555', power: '#7a5a00', board: '#1d6b3a' }[cs.category] ?? '#2b3a4a';
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: 'visible', display: 'block' }}>
      <rect x={0} y={0} width={w} height={h - 12} rx={5} fill={colour} stroke="#0008" />
      {visual?.segText !== undefined && (
        <g>
          <rect x={w / 2 - 34} y={6} width={68} height={22} rx={2} fill="#1a0505" />
          <text x={w / 2} y={23} fontSize={16} fontFamily={cs.sim.segments === 14 ? "'DSEG14 Classic', 'Courier New', monospace" : "'DSEG7 Classic', 'Courier New', monospace"} fontWeight={700} fill={visual.segOn ? '#ff3b30' : '#3a1010'} textAnchor="middle" letterSpacing={2}>
            {visual.segText || '    '}
          </text>
        </g>
      )}
      {visual?.lcd ? (
        <LcdScreen x={4} y={3} w={w - 8} lcd={visual.lcd} />
      ) : visual?.tft ? (
        <TftScreen x={w / 2 - 17} y={2} tft={visual.tft} />
      ) : visual?.oled ? (
        <OledScreen x={w / 2 - 32} y={4} ram={visual.oled} on={!!visual.oledOn} />
      ) : cs.sim.kind === 'segment-display' && cs.sim.matrix ? (
        // 8 rows × 8 columns per chained chip; dots shrink so a 32×8 strip still fits the module.
        (() => {
          const cols = 8 * (cs.sim.protocol === 'max7219' ? (cs.sim.count ?? 1) : 1);
          const pitch = Math.min(4.2, (w - 8) / cols);
          return (
            <g>
              <rect x={w / 2 - (cols * pitch) / 2 - 2} y={2} width={cols * pitch + 4} height={8 * pitch + 4} fill="#111" />
              {Array.from({ length: cols * 8 }, (_, i) => (
                <circle key={i} cx={w / 2 - (cols * pitch) / 2 + pitch / 2 + (i % cols) * pitch} cy={4 + pitch / 2 + Math.floor(i / cols) * pitch} r={pitch * 0.38} fill={(visual?.pixels?.[i * 3] ?? 0) > 10 ? '#ff3b30' : '#3a1010'} />
              ))}
            </g>
          );
        })()
      ) : cs.sim.kind === 'addressable-led' ? (
        <g>
          {Array.from({ length: Math.min(cs.sim.count ?? 1, 12) }, (_, i) => {
            const px = visual?.pixels ?? [];
            const [g, r, b] = [px[i * 3] ?? 0, px[i * 3 + 1] ?? 0, px[i * 3 + 2] ?? 0];
            return <rect key={i} x={6 + i * 7} y={10} width={5} height={5} rx={1} fill={r + g + b > 10 ? `rgb(${Math.min(255, r * 2)},${Math.min(255, g * 2)},${Math.min(255, b * 2)})` : '#eee'} stroke="#999" strokeWidth={0.4} />;
          })}
        </g>
      ) : cs.sim.kind === 'servo' ? (
        // The horn: its angle, or for a continuous-rotation servo a spinning arrow showing the direction.
        <g transform={`translate(${w / 2} 18)`}>
          <circle r={9} fill="#111" />
          {cs.sim.servo?.continuous ? (
            <g className={(visual?.spin ?? 0) > 0.02 ? 'spinning' : ''} style={{ transformOrigin: '0 0', animationDuration: `${0.6 / Math.max(visual?.spin ?? 0, 0.1)}s`, animationDirection: visual?.dir === 'ccw' ? 'reverse' : 'normal' }}>
              <path d="M0 -6 A6 6 0 1 1 -6 0" fill="none" stroke="#eee" strokeWidth={1.4} />
              <path d="M-8 -1 L-6 2 L-4 -1 Z" fill="#eee" />
            </g>
          ) : (
            <rect x={-1.5} y={-8} width={3} height={8} rx={1.5} fill="#eee" transform={`rotate(${(visual?.angle ?? (cs.sim.servo?.degrees ?? 180) / 2) - (cs.sim.servo?.degrees ?? 180) / 2})`} />
          )}
        </g>
      ) : visual?.segText === undefined ? (
        <rect x={w / 2 - 14} y={8} width={28} height={20} rx={2} fill="#111" />
      ) : null}
      <text x={w / 2} y={40} fontSize={8} fill="#eef" textAnchor="middle" fontWeight={600}>{cs.mpn.slice(0, 16)}</text>
      <text x={w / 2} y={50} fontSize={5.5} fill="#cdd" textAnchor="middle">{cs.name.slice(0, 34)}</text>
      {visual?.active !== undefined && <circle cx={w - 10} cy={10} r={4} fill={visual.active ? '#ffd23f' : '#3a3a3a'} />}
      {Object.entries(pins).map(([n, p]) => (
        <g key={n}>
          <rect x={p.x - 2.5} y={h - 16} width={5} height={14} fill="#c9b37a" />
          <text x={p.x} y={h - 20} fontSize={5} fill="#eef" textAnchor="middle" transform={`rotate(-45 ${p.x} ${h - 20})`}>{n}</text>
          {pinDot(p.x, p.y, n)}
        </g>
      ))}
    </svg>
  );
}

export function CustomPart({ type, props, visual }: { type: string; props: Record<string, any>; visual?: PartVisual }) {
  if (customSpec(type)) return <GenericModule type={type} visual={visual} />;
  const [w, h] = partSize(type);
  const pins = CUSTOM_PINS[type] ?? {};
  let body: React.ReactNode = null;
  switch (type) {
    case 'pi-pico':
      body = (
        <>
          <rect x={0} y={0} width={w} height={h} rx={4} fill="#1d6b3a" stroke="#0f4424" />
          <rect x={30} y={-6} width={24} height={14} rx={2} fill="#b8bcc2" stroke="#80858c" />
          <rect x={27} y={78} width={30} height={30} fill="#222" />
          <text x={42} y={96} fontSize={5} fill="#ddd" textAnchor="middle">RP2040</text>
          <rect x={33} y={22} width={18} height={10} rx={1} fill="#eee" />
          <text x={42} y={30} fontSize={5} textAnchor="middle" fill="#333">BOOTSEL</text>
          <circle cx={58} cy={18} r={3} fill={visual?.led ? '#7CFF6B' : '#3b5d3f'} />
          <text x={42} y={150} fontSize={7} fill="#e8f5e9" textAnchor="middle" fontWeight={600}>Raspberry Pi</text>
          <text x={42} y={160} fontSize={7} fill="#e8f5e9" textAnchor="middle" fontWeight={600}>Pico</text>
          {Object.entries(picoPins).map(([n, p]) => (
            <text key={`t${n}`} x={p.x < 40 ? p.x + 5 : p.x - 5} y={p.y + 2} fontSize={4.2} fill="#d8ead9" textAnchor={p.x < 40 ? 'start' : 'end'}>
              {n.replace(/\.\d+$/, '')}
            </text>
          ))}
        </>
      );
      break;
    case 'rpi4':
      body = (
        <>
          <rect x={0} y={0} width={w} height={h} rx={10} fill="#2f8a4a" stroke="#1d5c30" />
          <rect x={26} y={8} width={276} height={30} rx={2} fill="#1c1c1c" />
          <rect x={90} y={80} width={70} height={70} fill="#c0c4c8" stroke="#888" />
          <text x={125} y={118} fontSize={9} textAnchor="middle" fill="#333">BCM2711</text>
          <rect x={w - 50} y={60} width={56} height={44} fill="#c9ccd0" stroke="#888" />
          <rect x={w - 50} y={112} width={56} height={44} fill="#c9ccd0" stroke="#888" />
          <rect x={w - 46} y={164} width={52} height={40} fill="#d8dadd" stroke="#888" />
          <text x={22} y={200} fontSize={12} fill="#e9f7ec" fontWeight={600}>Raspberry Pi 4</text>
          {Object.entries(rpiPins).map(([n, p]) => (
            <text key={`t${n}`} x={p.x} y={p.y === 16 ? 6 : 47} fontSize={4.4} fill="#eaf6ec" textAnchor="middle" transform={`rotate(-60 ${p.x} ${p.y === 16 ? 6 : 47})`}>
              {n.replace('GPIO', '').replace(/\.\d+$/, '')}
            </text>
          ))}
        </>
      );
      break;
    case 'ldr':
    case 'ntc':
      body = (
        <>
          <line x1={14} y1={30} x2={14} y2={68} stroke="#aaa" strokeWidth={1.5} />
          <line x1={26} y1={30} x2={26} y2={68} stroke="#aaa" strokeWidth={1.5} />
          {type === 'ldr' ? (
            <>
              <circle cx={20} cy={20} r={15} fill="#d9b382" stroke="#8a6b3f" />
              <path d="M10 14 h16 v4 h-12 v4 h12 v4 h-16" stroke="#b5452a" strokeWidth={1.6} fill="none" />
            </>
          ) : (
            <>
              <ellipse cx={20} cy={22} rx={9} ry={11} fill="#3a3a3a" />
              <text x={20} y={25} fontSize={6} fill="#ddd" textAnchor="middle">NTC</text>
            </>
          )}
        </>
      );
      break;
    case 'soil':
      body = (
        <>
          <path d={`M4 0 H56 V120 L46 168 L38 120 H22 L14 168 L4 120 Z`} fill="#16313b" stroke="#0a1a20" />
          <rect x={10} y={12} width={40} height={18} fill="#0e2128" />
          <text x={30} y={60} fontSize={6} fill="#bfe3ee" textAnchor="middle">Capacitive</text>
          <text x={30} y={68} fontSize={6} fill="#bfe3ee" textAnchor="middle">Soil Moisture</text>
          {['VCC', 'GND', 'AOUT'].map((n) => (
            <text key={n} x={pins[n].x} y={24} fontSize={4.5} fill="#bfe3ee" textAnchor="middle">{n}</text>
          ))}
        </>
      );
      break;
    case 'relay':
      body = (
        <>
          <rect x={0} y={0} width={w} height={h} rx={4} fill="#1f4fa8" stroke="#123270" />
          <rect x={28} y={14} width={44} height={56} rx={3} fill="#1b62d6" stroke="#0d3a85" />
          <text x={50} y={40} fontSize={6} fill="#e8f0ff" textAnchor="middle">SRD-05VDC</text>
          <text x={50} y={48} fontSize={6} fill="#e8f0ff" textAnchor="middle">SL-C</text>
          <circle cx={18} cy={80} r={3.5} fill={visual?.relay ? '#ff4040' : '#5a1a1a'} />
          <rect x={80} y={12} width={18} height={66} fill="#2a8c4a" stroke="#155a2c" />
          {['VCC', 'GND', 'IN'].map((n) => (
            <text key={n} x={10} y={pins[n].y + 2} fontSize={5} fill="#e8f0ff">{n}</text>
          ))}
          {['NO', 'COM', 'NC'].map((n) => (
            <text key={n} x={78} y={pins[n].y + 2} fontSize={5} fill="#e8f0ff" textAnchor="end">{n}</text>
          ))}
        </>
      );
      break;
    case 'capacitor':
      body = (
        <>
          <line x1={12} y1={30} x2={12} y2={54} stroke="#aaa" strokeWidth={1.5} />
          <line x1={24} y1={30} x2={24} y2={54} stroke="#aaa" strokeWidth={1.5} />
          <ellipse cx={18} cy={20} rx={14} ry={13} fill="#d9922e" stroke="#9a6014" />
          <text x={18} y={23} fontSize={6} fill="#3d2400" textAnchor="middle">{props.farads >= 1e-6 ? `${+(props.farads * 1e6).toFixed(1)}µ` : `${Math.round(props.farads * 1e9)}n`}</text>
        </>
      );
      break;
    case 'electrolytic':
      body = (
        <>
          <line x1={12} y1={44} x2={12} y2={68} stroke="#aaa" strokeWidth={1.5} />
          <line x1={24} y1={44} x2={24} y2={68} stroke="#aaa" strokeWidth={1.5} />
          <rect x={4} y={2} width={28} height={44} rx={5} fill="#1b3d8f" stroke="#0e2357" />
          <rect x={22} y={2} width={7} height={44} fill="#c9d4f0" />
          <text x={25.5} y={28} fontSize={7} fill="#1b3d8f" textAnchor="middle">−</text>
          <text x={14} y={30} fontSize={6} fill="#dfe7ff" textAnchor="middle" transform="rotate(-90 14 28)">{`${+(props.farads * 1e6).toFixed(0)}µF`}</text>
        </>
      );
      break;
    case 'diode':
      body = (
        <>
          <line x1={2} y1={8} x2={62} y2={8} stroke="#aaa" strokeWidth={1.5} />
          <rect x={18} y={3} width={28} height={10} rx={2} fill="#e9a35a" stroke="#8a5a20" />
          <rect x={40} y={3} width={4} height={10} fill="#222" />
        </>
      );
      break;
    case 'npn':
      body = (
        <>
          {[10, 22, 34].map((x) => (
            <line key={x} x1={x} y1={34} x2={x} y2={68} stroke="#aaa" strokeWidth={1.5} />
          ))}
          <path d="M4 34 V14 A18 18 0 0 1 40 14 V34 Z" fill="#222" />
          <text x={22} y={24} fontSize={6} fill="#ccc" textAnchor="middle">2222A</text>
          <text x={10} y={42} fontSize={5} fill="#8a8f96" textAnchor="middle">E</text>
          <text x={22} y={42} fontSize={5} fill="#8a8f96" textAnchor="middle">B</text>
          <text x={34} y={42} fontSize={5} fill="#8a8f96" textAnchor="middle">C</text>
        </>
      );
      break;
    case 'ne555':
    case 'mcp3008': {
      const label = type === 'ne555' ? 'NE555P' : 'MCP3008';
      body = (
        <>
          <rect x={4} y={8} width={w - 8} height={h - 16} rx={3} fill="#232323" stroke="#000" />
          <path d={`M4 ${h / 2 - 6} A6 6 0 0 1 4 ${h / 2 + 6}`} fill="#555" />
          <circle cx={14} cy={h - 18} r={2.5} fill="#444" />
          <text x={w / 2} y={h / 2 + 3} fontSize={9} fill="#ddd" textAnchor="middle" fontWeight={600}>{label}</text>
          {Object.entries(pins).map(([n, p]) => (
            <g key={`l${n}`}>
              <rect x={p.x - 3} y={p.y < 10 ? 0 : h - 9} width={6} height={9} fill="#c7c7c7" />
              <text x={p.x} y={p.y < 10 ? 18 : h - 13} fontSize={4.4} fill="#aaa" textAnchor="middle">{n}</text>
            </g>
          ))}
        </>
      );
      break;
    }
    case 'dc-motor': {
      const fan = props.kind === 'fan';
      const spin = visual?.spin ?? 0;
      body = (
        <>
          <line x1={26} y1={50} x2={26} y2={68} stroke="#d32f2f" strokeWidth={1.6} />
          <line x1={44} y1={50} x2={44} y2={68} stroke="#222" strokeWidth={1.6} />
          {fan ? (
            <>
              <rect x={6} y={2} width={58} height={50} rx={6} fill="#2b2f33" />
              <g className={spin > 0.1 ? 'spinning' : ''} style={{ transformOrigin: '35px 27px', animationDuration: `${0.5 / Math.max(spin, 0.1)}s` }}>
                {[0, 72, 144, 216, 288].map((a) => (
                  <ellipse key={a} cx={35} cy={14} rx={6} ry={12} fill="#9aa4ad" transform={`rotate(${a} 35 27)`} />
                ))}
              </g>
              <circle cx={35} cy={27} r={5} fill="#444" />
            </>
          ) : (
            <>
              <rect x={14} y={4} width={42} height={44} rx={8} fill="#1d5fa8" />
              <rect x={30} y={0} width={10} height={8} fill="#8fb8e6" />
              <text x={35} y={30} fontSize={9} fill="#e6f0ff" textAnchor="middle">PUMP</text>
              {spin > 0.1 && <path d="M40 -2 q8 -8 16 -2 q-8 2 -10 10" fill="#5ab0ff" className="droplet" />}
            </>
          )}
        </>
      );
      break;
    }
    case 'level-shifter':
      body = (
        <>
          <rect x={0} y={2} width={80} height={58} rx={3} fill="#2b5fae" stroke="#163a72" />
          {[22, 34, 46].map((y) => (
            <rect key={y} x={33} y={y - 4} width={14} height={8} fill="#222" />
          ))}
          <text x={40} y={14} fontSize={6} fill="#e6eeff" textAnchor="middle">3V3 ⇄ 5V</text>
          {Object.entries(pins).map(([n, p]) => (
            <text key={`t${n}`} x={p.x < 40 ? p.x + 6 : p.x - 6} y={p.y + 2} fontSize={5} fill="#e6eeff" textAnchor={p.x < 40 ? 'start' : 'end'}>
              {n}
            </text>
          ))}
        </>
      );
      break;
    case 'dc-supply':
      body = (
        <>
          <rect x={4} y={4} width={50} height={34} rx={4} fill="#2b2b2b" />
          <rect x={14} y={12} width={6} height={14} rx={1} fill="#777" />
          <rect x={38} y={12} width={6} height={14} rx={1} fill="#777" />
          <path d="M54 21 C 66 21, 70 36, 70 46" stroke="#1a1a1a" strokeWidth={3} fill="none" />
          <rect x={20} y={46} width={50} height={18} rx={2} fill="#2f7d32" />
          <circle cx={30} cy={55} r={4} fill="#ccc" stroke="#666" />
          <circle cx={60} cy={55} r={4} fill="#ccc" stroke="#666" />
          <text x={29} y={34} fontSize={8} fill="#eee" textAnchor="middle" fontWeight={700}>{`${props.volts ?? 12}V`}</text>
          <text x={30} y={44} fontSize={7} fill="#f55" textAnchor="middle">+</text>
          <text x={60} y={44} fontSize={7} fill="#aaa" textAnchor="middle">−</text>
        </>
      );
      break;
    case 'battery-9v':
      body = (
        <>
          <rect x={2} y={14} width={66} height={104} rx={5} fill="#2b2b2b" />
          <rect x={2} y={60} width={66} height={58} rx={5} fill="#d9a400" />
          <rect x={14} y={2} width={16} height={14} rx={3} fill="#bbb" stroke="#777" />
          <polygon points="40,4 56,4 58,9 56,15 40,15 38,9" fill="#bbb" stroke="#777" />
          <text x={35} y={45} fontSize={18} fill="#eee" textAnchor="middle" fontWeight={700}>9V</text>
          <text x={22} y={30} fontSize={9} fill="#f55" textAnchor="middle">+</text>
          <text x={48} y={30} fontSize={9} fill="#aaa" textAnchor="middle">−</text>
        </>
      );
      break;
  }
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: 'visible', display: 'block' }}>
      {body}
      {Object.entries(pins).map(([n, p]) => pinDot(p.x, p.y, n))}
    </svg>
  );
}
