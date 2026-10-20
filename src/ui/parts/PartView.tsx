// Renders one part on the breadboard: a Wokwi element (MIT, @wokwi/elements) when one exists,
// otherwise our own SVG. Reports pin coordinates and forwards user interaction as sim inputs.
import React, { useEffect, useRef } from 'react';
import type { PartInstance } from '../../core/types';
import { partDef } from '../../core/parts';
import type { PartVisual } from '../../sim/engine';
import { CustomPart, CUSTOM_PINS } from './custom';

export type PinMap = Record<string, { x: number; y: number }>;

interface Props {
  part: PartInstance;
  visual?: PartVisual;
  onPins(id: string, pins: PinMap): void;
  onInput(part: string, key: string, value: number): void;
  inputs: Record<string, number>;
}

export function PartView({ part, visual, onPins, onInput, inputs }: Props) {
  const def = partDef(part.type);
  const ref = useRef<any>(null);
  const tag = def.wokwi?.tag;

  // Pin positions
  useEffect(() => {
    if (!tag) {
      onPins(part.id, CUSTOM_PINS[part.type] ?? {});
      return;
    }
    let cancelled = false;
    (async () => {
      await customElements.whenDefined(tag);
      const el = ref.current;
      if (!el) return;
      await el.updateComplete;
      if (cancelled) return;
      const info: { name: string; x: number; y: number }[] = el.pinInfo ?? [];
      const map: PinMap = {};
      for (const pd of def.pins) {
        const wn = pd.wokwi ?? pd.name;
        const pi = info.find((i) => i.name === wn);
        if (pi) map[pd.name] = { x: pi.x, y: pi.y };
      }
      onPins(part.id, map);
    })();
    return () => {
      cancelled = true;
    };
  }, [part.id, part.type, tag, JSON.stringify(part.props)]);

  // Interaction → simulator inputs
  useEffect(() => {
    const el = ref.current;
    if (!el || !tag) return;
    const handlers: [string, (e: any) => void][] = [];
    if (part.type === 'pushbutton') {
      handlers.push(['button-press', () => onInput(part.id, 'pressed', 1)], ['button-release', () => onInput(part.id, 'pressed', 0)]);
    }
    if (part.type === 'potentiometer') handlers.push(['input', (e) => onInput(part.id, 'position', Number(e.detail ?? el.value))]);
    if (part.type === 'slide-switch') handlers.push(['input', (e) => onInput(part.id, 'position', Number(e.detail ?? el.value))]);
    for (const [ev, h] of handlers) el.addEventListener(ev, h);
    return () => {
      for (const [ev, h] of handlers) el.removeEventListener(ev, h);
    };
  }, [part.id, part.type, tag, onInput]);

  // Keep knob positions in sync with the inputs model.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (part.type === 'potentiometer') el.value = inputs[`${part.id}.position`] ?? 50;
    if (part.type === 'slide-switch') el.value = inputs[`${part.id}.position`] ?? 0;
  }, [inputs[`${part.id}.position`]]);

  // Simulation visuals → element properties
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const v = visual ?? {};
    switch (part.type) {
      case 'led':
        el.value = (v.led ?? 0) > 0.02;
        el.brightness = Math.min(1, v.led ?? 0);
        break;
      case 'rgb-led':
        el.ledRed = v.rgb?.[0] ?? 0;
        el.ledGreen = v.rgb?.[1] ?? 0;
        el.ledBlue = v.rgb?.[2] ?? 0;
        break;
      case 'servo':
        el.angle = v.angle ?? 90;
        break;
      case 'buzzer':
        el.hasSignal = (v.tone ?? 0) > 0;
        break;
      case 'lcd1602':
        if (v.lcd) {
          el.characters = new Uint8Array(v.lcd.chars);
          el.backlight = v.lcd.backlight;
        } else {
          el.characters = new Uint8Array(32).fill(32);
          el.backlight = false;
        }
        break;
      case 'ssd1306': {
        const img: ImageData = el.imageData instanceof ImageData ? el.imageData : new ImageData(128, 64);
        const d = img.data;
        const ram = v.oled;
        for (let page = 0; page < 8; page++)
          for (let x = 0; x < 128; x++) {
            const b = ram && v.oledOn ? ram[page * 128 + x] : 0;
            for (let bit = 0; bit < 8; bit++) {
              const i = ((page * 8 + bit) * 128 + x) * 4;
              const on = (b >> bit) & 1;
              d[i] = on ? 170 : 0;
              d[i + 1] = on ? 225 : 0;
              d[i + 2] = on ? 255 : 0;
              d[i + 3] = 255;
            }
          }
        el.imageData = img;
        el.redraw?.();
        break;
      }
      case 'neopixel-ring': {
        const px = v.pixels ?? [];
        const n = Number(part.props.pixels ?? 12);
        // Real NeoPixels look bright even at 1/4 power; boost for the screen.
        const lum = (v: number) => Math.min(1, Math.sqrt((v ?? 0) / 255) * 1.15);
        for (let i = 0; i < n; i++) el.setPixel?.(i, { r: lum(px[i * 3]), g: lum(px[i * 3 + 1]), b: lum(px[i * 3 + 2]) });
        break;
      }
    }
  }, [visual, part.type]);

  if (part.type === 'epaper29') return <EPaperView visual={visual} />;
  if (!tag) return <CustomPart type={part.type} props={part.props} visual={visual} />;
  const attrs = def.wokwi?.attrs?.(part.props) ?? {};
  const strAttrs: Record<string, string> = {};
  for (const [k, v] of Object.entries(attrs)) if (v !== '' && v !== false) strAttrs[k] = String(v);
  return React.createElement(tag, { ref, ...strAttrs, style: { display: 'block' } });
}

/** 2.9" e-ink module: draws exactly what the simulated SSD1680 panel is showing. */
function EPaperView({ visual }: { visual?: PartVisual }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const ram = visual?.epaper?.ram;
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(296, 128);
    for (let lx = 0; lx < 296; lx++)
      for (let ly = 0; ly < 128; ly++) {
        const px = 127 - ly;
        const white = !ram || (ram[lx * 16 + (px >> 3)] & (0x80 >> (px & 7))) !== 0;
        const i = (ly * 296 + lx) * 4;
        const v = white ? 226 : 28;
        img.data[i] = v;
        img.data[i + 1] = v;
        img.data[i + 2] = white ? 218 : 30;
        img.data[i + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
  }, [ram]);
  const pins = CUSTOM_PINS.epaper29;
  return (
    <div className="epaper" style={{ width: 340, height: 190 }}>
      <div className="epaper-board" />
      <canvas ref={canvas} width={296} height={128} className={`epaper-screen ${visual?.epaper?.refreshing ? 'refreshing' : ''}`} />
      <svg width={340} height={190} className="epaper-pins">
        {Object.entries(pins).map(([n, p]) => (
          <g key={n}>
            <rect x={p.x - 2.5} y={p.y - 2.5} width={5} height={5} rx={1} fill="#c9b37a" stroke="#6b5a2a" strokeWidth={0.6} />
            <text x={p.x} y={p.y - 7} fontSize={7} textAnchor="middle" fill="#e8eef7" fontFamily="var(--mono)">
              {n}
            </text>
          </g>
        ))}
        <text x={20} y={176} fontSize={8} fill="#9fb3d1">2.9" e-Paper · SSD1680</text>
      </svg>
    </div>
  );
}
