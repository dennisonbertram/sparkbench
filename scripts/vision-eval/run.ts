// Ask Claude (vision) to check each breadboard image against the intended circuit; score the answers.
// Usage: npx tsx scripts/vision-eval/run.ts [--limit N] [--conc 6] [--styles clean,photo] [--conds A,B]
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { CASES, buildPlan } from './layouts';
import { faultsFor, type Fault } from './faults';

const arg = (k: string, d: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const IMG = resolve('test-results/vision/images');
const OUT = resolve('test-results/vision');
const CONC = Number(arg('conc', '6'));
const LIMIT = Number(arg('limit', '9999'));
const STYLES = arg('styles', 'clean,photo').split(',');
const CONDS = arg('conds', 'A,B').split(',');
const MODEL = arg('model', 'claude-opus-5-5');

const SCHEMA = {
  type: 'object',
  properties: {
    correct: { type: 'boolean', description: 'true only if the build matches the intended circuit with no wiring mistakes' },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          parts: { type: 'array', items: { type: 'string' }, description: 'Part refs (R1, D1, U1…) and/or breadboard holes (e.g. g28, B-29) involved' },
          kind: { type: 'string', enum: ['reversed-polarity', 'wrong-hole', 'wrong-pin', 'missing-wire', 'wrong-rail', 'short', 'other'] },
          description: { type: 'string' },
        },
        required: ['parts', 'kind', 'description'],
      },
    },
  },
  required: ['correct', 'issues'],
};

const BREADBOARD = `Breadboard conventions: columns are numbered 1–63 left to right; rows a–e (top half) and f–j (bottom half). In each column, a–e are connected together and f–j are connected together; the centre gap separates them. The top power rails are + (red line, outermost) and − (blue line); the bottom rails are − (blue) then + (red, outermost). Each rail runs the full length. Hole names look like "g28"; rail holes like "T+5" (top +), "T-3", "B-29" (bottom −), "B+23".`;

interface Job { id: string; caseId: string; fault: Fault | null; style: string; cond: string; file: string }
const jobs: Job[] = [];
for (const c of CASES) {
  const builds: [string, Fault | null][] = [['ok', null], ...faultsFor(c).map((f): [string, Fault] => [f.kind, f])];
  for (const [k, f] of builds)
    for (const style of STYLES)
      for (const cond of CONDS) jobs.push({ id: `${c.id}__${k}__${style}__${cond}`, caseId: c.id, fault: f, style, cond, file: `${c.id}__${k}__${style}.${style === 'photo' ? 'jpg' : 'png'}` });
}
jobs.splice(LIMIT);

// The model only ever sees a neutral file name: real names encode the fault and would leak the answer.
const blind = (j: Job) => `board.${j.file.split('.').pop()}`;

function prompt(j: Job) {
  const c = CASES.find((x) => x.id === j.caseId)!;
  return [
    `A beginner built this electronics project on a solderless breadboard and took a picture. Read the image file ./${blind(j)} and check whether it is wired correctly.`,
    ``,
    `Intended circuit: ${c.circuit}`,
    j.cond === 'B' ? `\nThe build plan they were following (hole by hole):\n${buildPlan(c)}` : '',
    ``,
    BREADBOARD,
    ``,
    `Look carefully at where every leg and jumper end actually sits. Report every mistake you can see (LED/electrolytic polarity, a leg in the wrong hole, a jumper on the wrong board pin, a missing wire, a wire on the wrong rail, a part shorted because both legs share a strip). If it is all correct, return correct: true and no issues. Don't report cosmetic things.`,
  ].join('\n');
}

function ask(j: Job): Promise<{ out: any; ms: number; err?: string }> {
  const t0 = Date.now();
  const dir = mkdtempSync(`${tmpdir()}/vis-`);
  copyFileSync(`${IMG}/${j.file}`, `${dir}/${blind(j)}`);
  return new Promise((res) => {
    const p = spawn('claude', ['-p', '--output-format', 'json', '--tools', 'Read', '--allowedTools', 'Read', '--strict-mcp-config', '--no-session-persistence', '--setting-sources', '', '--model', MODEL, '--effort', 'medium', '--json-schema', JSON.stringify(SCHEMA)], { cwd: dir });
    let so = '', se = '';
    p.stdout.on('data', (d) => (so += d));
    p.stderr.on('data', (d) => (se += d));
    const kill = setTimeout(() => p.kill('SIGKILL'), 240_000);
    p.on('close', () => {
      clearTimeout(kill);
      rmSync(dir, { recursive: true, force: true });
      try {
        const d = JSON.parse(so);
        res({ out: d.structured_output ?? JSON.parse(d.result), ms: Date.now() - t0 });
      } catch (e) {
        res({ out: null, ms: Date.now() - t0, err: (se || so).slice(0, 300) });
      }
    });
    p.stdin.end(prompt(j));
  });
}

// Scoring: a fault is "detected" if correct=false; "localised" if an issue names one of the culprits.
function score(j: Job, out: any) {
  if (!out) return { detected: false, localised: false, fp: false };
  const said = JSON.stringify(out.issues ?? []).toLowerCase();
  if (!j.fault) return { detected: false, localised: false, fp: out.correct === false || (out.issues?.length ?? 0) > 0 };
  const detected = out.correct === false;
  const localised = detected && j.fault.culprits.some((c) => new RegExp(`\\b${c.toLowerCase().replace(/[+\-]/g, (m) => `\\${m}`)}\\b`).test(said));
  return { detected, localised, fp: false };
}

const cachePath = `${OUT}/results.json`;
const cache: Record<string, any> = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {};
mkdirSync(OUT, { recursive: true });
let next = 0, done = 0;
const todo = jobs.filter((j) => !cache[j.id]?.out);
console.log(`${jobs.length} jobs (${todo.length} to run, conc ${CONC})`);
await Promise.all(Array.from({ length: CONC }, async () => {
  while (next < todo.length) {
    const j = todo[next++];
    const r = await ask(j);
    cache[j.id] = { ...r, fault: j.fault?.kind ?? 'none', truth: j.fault?.description ?? 'correct build' };
    writeFileSync(cachePath, JSON.stringify(cache, null, 1));
    console.log(`[${++done}/${todo.length}] ${j.id} ${r.err ? 'ERR ' + r.err : r.out.correct ? 'says OK' : `${r.out.issues.length} issue(s)`} ${(r.ms / 1000).toFixed(0)}s`);
  }
}));

// Report
type Row = { n: number; det: number; loc: number; fp: number; clean: number };
const agg: Record<string, Row> = {};
const bump = (k: string, j: Job, s: ReturnType<typeof score>) => {
  const r = (agg[k] ??= { n: 0, det: 0, loc: 0, fp: 0, clean: 0 });
  if (j.fault) { r.n++; r.det += +s.detected; r.loc += +s.localised; } else { r.clean++; r.fp += +s.fp; }
};
const lines: string[] = [];
for (const j of jobs) {
  const c = cache[j.id];
  if (!c?.out) continue;
  const s = score(j, c.out);
  bump(`all`, j, s);
  bump(`cond ${j.cond} (${j.cond === 'A' ? 'circuit description' : 'hole-by-hole plan'})`, j, s);
  bump(`style ${j.style}`, j, s);
  bump(`${j.style} + ${j.cond}`, j, s);
  bump(`fault ${j.fault?.kind ?? 'none'}`, j, s);
  bump(`case ${j.caseId}`, j, s);
  lines.push(`### ${j.id}\n- truth: ${c.truth}\n- model: ${c.out.correct ? 'correct' : 'NOT correct'}${(c.out.issues ?? []).map((i: any) => `\n  - [${i.kind}] (${i.parts.join(', ')}) ${i.description}`).join('')}\n- score: ${j.fault ? `${s.detected ? 'detected' : 'MISSED'}${s.detected ? (s.localised ? ', localised' : ', NOT localised') : ''}` : s.fp ? 'FALSE ALARM' : 'clean ✓'}`);
}
const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : '—');
const table = ['| slice | faults | detected | localised | clean builds | false alarms |', '|---|---|---|---|---|---|', ...Object.entries(agg).map(([k, r]) => `| ${k} | ${r.n} | ${pct(r.det, r.n)} | ${pct(r.loc, r.n)} | ${r.clean} | ${pct(r.fp, r.clean)} |`)].join('\n');
writeFileSync(`${OUT}/REPORT.md`, `# Vision wiring-check eval (${MODEL})\n\n${table}\n\n## Every answer\n\n${lines.join('\n\n')}\n`);
console.log('\n' + table);
