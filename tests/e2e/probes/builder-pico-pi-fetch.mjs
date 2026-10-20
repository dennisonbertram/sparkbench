// node tests/e2e/probes/builder-pico-pi-fetch.mjs <slug> "<prompt>"  -> test-results/qa/builder-pico-pi/<slug>/ai.json
import fs from 'fs';
const [slug, prompt] = process.argv.slice(2);
const dir = `test-results/qa/builder-pico-pi/${slug}`; fs.mkdirSync(dir, { recursive: true });
for (let i = 0; i < 6; i++) {
  try {
    const t0 = Date.now();
    const r = await fetch('http://localhost:5173/api/ai/design', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt, history: [] }) });
    const d = await r.json();
    d._ms = Date.now() - t0;
    fs.writeFileSync(`${dir}/ai.json`, JSON.stringify(d, null, 1));
    console.log(slug, 'ok', r.status, d._ms, 'ms', d.project?.name);
    process.exit(0);
  } catch (e) { console.log(slug, 'retry', i, e.message); await new Promise((r) => setTimeout(r, 8000)); }
}
