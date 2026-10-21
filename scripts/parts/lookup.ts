// Gather what the open libraries already know about a part, without any AI: Fritzing breakout
// pinouts (metadata only, CC-BY-SA, used as reference), KiCad footprints, LCSC stock, and whether
// Sparkbench already has it. Run: npx tsx scripts/parts/lookup.ts "SHT31" [more words…]
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { FP_DIR } from '../../server/pcb';
import { PARTS } from '../../src/core/parts';

const FRITZING = join(homedir(), '.cache/sparkbench/fritzing-parts');

interface FzPart {
  file: string;
  title: string;
  tags: string[];
  props: Record<string, string>;
  pins: string[];
}

function fritzingParts(): FzPart[] {
  const out: FzPart[] = [];
  for (const dir of ['core', 'contrib']) {
    const d = join(FRITZING, dir);
    if (!existsSync(d)) continue;
    for (const f of readdirSync(d).filter((x) => x.endsWith('.fzp'))) {
      const x = readFileSync(join(d, f), 'utf8');
      out.push({
        file: `${dir}/${f}`,
        title: /<title>([^<]*)<\/title>/.exec(x)?.[1]?.trim() ?? f,
        tags: [...x.matchAll(/<tag>([^<]*)<\/tag>/g)].map((m) => m[1].trim()),
        props: Object.fromEntries([...x.matchAll(/<property name=['"]([^'"]+)['"][^>]*>([^<]*)<\/property>/g)].map((m) => [m[1], m[2].trim()])),
        pins: [...x.matchAll(/<connector [^>]*name=['"]([^'"]*)['"]/g)].map((m) => m[1]),
      });
    }
  }
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export function lookup(query: string) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const key = norm(words[0] ?? '');
  const fz = fritzingParts()
    .map((p) => ({ p, hay: norm([p.title, ...p.tags, ...Object.values(p.props)].join(' ')) }))
    .filter(({ hay }) => hay.includes(key))
    .slice(0, 6)
    .map(({ p }) => p);
  const builtin = PARTS.filter((p) => p.keywords.some((k) => norm(k) === key) || norm(p.bom.mpn).includes(key)).map((p) => `${p.type} (${p.name})`);
  const skills = existsSync('.claude/skills') ? readdirSync('.claude/skills').filter((d) => d.startsWith('part-') && norm(d).includes(key)) : [];
  const fps = existsSync(FP_DIR)
    ? readdirSync(FP_DIR)
        .filter((l) => l.endsWith('.pretty'))
        .flatMap((l) => readdirSync(join(FP_DIR, l)).filter((f) => norm(f).includes(key)).map((f) => `${l.replace('.pretty', '')}:${f.replace('.kicad_mod', '')}`))
        .slice(0, 8)
    : [];
  return { builtin, skills, fritzing: fz, kicadFootprints: fps };
}

if (process.argv[1]?.includes('lookup')) {
  const q = process.argv.slice(2).join(' ');
  const r = lookup(q);
  console.log(`Already in Sparkbench: ${[...r.builtin, ...r.skills].join(', ') || 'no'}`);
  console.log(`\nFritzing breakouts matching "${q.split(/\s+/)[0]}" (reference only; vendors' boards differ):`);
  for (const p of r.fritzing) console.log(`- ${p.title} [${p.file}] ${p.props.family ?? ''} ${p.props.variant ?? ''}\n  pins: ${p.pins.join(', ')}`);
  if (!r.fritzing.length) console.log('- none');
  console.log(`\nKiCad footprints with that name: ${r.kicadFootprints.join(', ') || 'none (breakouts use Connector_PinHeader_2.54mm:PinHeader_1xNN_P2.54mm_Vertical)'}`);
  const { search } = await import('../../server/sourcing');
  try {
    const hits = (await search(q.split(/\s+/)[0])).slice(0, 5);
    console.log(`\nLCSC: ${hits.map((h) => `${h.lcsc} ${h.mfr} (${h.pkg}, ${h.stock} in stock)`).join('; ') || 'nothing found'}`);
  } catch (e: any) {
    console.log(`\nLCSC lookup failed: ${e.message}`);
  }
}
