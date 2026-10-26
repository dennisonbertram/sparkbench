// The non-canvas center views: schematic, code, parts list, build guide, blog post.
import React, { useEffect, useMemo, useState } from 'react';
import { marked } from 'marked';
import { useStore } from './store';
import { renderSchematicSvg } from '../core/schematic';
import { exportKicadSchematic, exportKicadProject, exportKicadNetlist } from '../core/kicad';
import { exportSpice, defaultSpiceOptions } from '../core/spice';
import { buildBom, bomToCsv, bomTotal } from '../core/bom';
import { buildGuide, buildBlogPost } from '../core/docs';
import { CodeEditor } from './CodeEditor';
import { CodeAssistant } from './CodeAssistant';
import { PhotoCheck } from './PhotoCheck';
import { BuildMode } from './BuildMode';
import { CostHint } from './CostHint';
import { Toolkit } from './Toolkit';
import { planBreadboard } from '../core/bbplace';
import { renderBreadboardSvg } from '../core/breadboard';
import { download, slug } from './exporters';
import { generateFiles } from '../core/codegen';
import { buildNets } from '../core/netlist';
import { Banner, Button, DisclosureMenu, MenuItem, Tabs } from './ds';

function useTheme(): 'light' | 'dark' {
  const [dark, setDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const h = () => setDark(mq.matches);
    mq?.addEventListener('change', h);
    return () => mq?.removeEventListener('change', h);
  }, []);
  return document.documentElement.dataset.theme === 'dark' || (dark && document.documentElement.dataset.theme !== 'light') ? 'dark' : 'light';
}

export function SchematicView() {
  const project = useStore((s) => s.project)!;
  const hoverNet = useStore((s) => s.hoverNet);
  const pinnedNet = useStore((s) => s.pinnedNet);
  const nets = useMemo(() => buildNets(project).nets, [project.parts, project.wires]);
  const pinnedName = nets.find((n) => n.id === pinnedNet)?.name;
  const aiStatus = useStore((s) => s.aiStatus);
  const theme = useTheme();
  const [kicad, setKicad] = useState<{ svg?: string; erc?: any; error?: string; busy?: boolean } | null>(null);
  const [zoom, setZoom] = useState(1);
  const svg = useMemo(() => {
    try {
      return renderSchematicSvg(project, { theme, highlightNet: pinnedName });
    } catch (e: any) {
      return `<p class="err">Could not draw the schematic: ${e.message}</p>`;
    }
  }, [project.parts, project.wires, project.name, theme, pinnedName]);
  const name = slug(project.name);
  // Open showing the whole sheet; the zoom buttons (or ctrl/⌘ + scroll) get closer.
  useEffect(() => setZoom(1), [project.id]);
  const renderKicad = async () => {
    setKicad({ busy: true });
    try {
      const res = await fetch('/api/kicad/render', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sch: exportKicadSchematic(project), name }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setKicad({ svg: data.svg, erc: data.erc });
    } catch (e: any) {
      setKicad({ error: String(e.message ?? e) });
    }
  };
  const ercCount = kicad?.erc?.sheets?.reduce((n: number, s: any) => n + (s.violations?.filter((v: any) => v.severity === 'error').length ?? 0), 0);
  return (
    <div className="docview">
      <div className="doc-toolbar">
        <span className="doc-title">Schematic</span>
        <Button onClick={() => download(`${name}-schematic.svg`, renderSchematicSvg(project, { theme: 'light' }), 'image/svg+xml')}>Download SVG</Button>
        <Button onClick={() => svgToPng(renderSchematicSvg(project, { theme: 'light' })).then((b) => download(`${name}-schematic.png`, b))}>Download PNG</Button>
        <span className="zoom-group">
          <Button onClick={() => setZoom((z) => Math.max(0.6, z / 1.25))} aria-label="Zoom out">−</Button>
          <Button onClick={() => setZoom(1)} title="Fit the whole sheet in the window">Fit</Button>
          <Button onClick={() => setZoom((z) => Math.min(5, z * 1.25))} aria-label="Zoom in">+</Button>
          <span className="zoom-pct">{Math.round(zoom * 100)}%</span>
        </span>
        <DisclosureMenu label="Files for engineering tools" size="sm" className="doc-more">
          <MenuItem onClick={() => download(`${name}.kicad_sch`, exportKicadSchematic(project))} title="Opens in KiCad, the free circuit design program">KiCad schematic</MenuItem>
          <MenuItem onClick={() => download(`${name}.kicad_pro`, exportKicadProject(project))} title="A KiCad project you can open and turn into a circuit board">KiCad project</MenuItem>
          <MenuItem onClick={() => download(`${name}.net`, exportKicadNetlist(project))} title="Netlist: the list of which pins connect to which, for other design tools">Netlist</MenuItem>
          <MenuItem onClick={() => download(`${name}.cir`, exportSpice(project, defaultSpiceOptions(project)))} title="SPICE: a circuit file for electronics simulators such as ngspice">SPICE (.cir)</MenuItem>
          {aiStatus.kicad && (
            <MenuItem onClick={renderKicad} disabled={kicad?.busy} title="Open the schematic in KiCad on this computer and check it for wiring errors">
              {kicad?.busy ? 'Running KiCad…' : 'Check in KiCad'}
            </MenuItem>
          )}
        </DisclosureMenu>
      </div>
      {kicad?.busy && <Banner role="status">Running KiCad to draw and check the schematic…</Banner>}
      {kicad?.error && <Banner tone="warn">KiCad: {kicad.error}</Banner>}
      {kicad?.svg && (
        <Banner tone="ok">
          Rendered by KiCad · ERC: {ercCount === 0 ? 'no errors' : `${ercCount} error(s)`} <Button onClick={() => setKicad(null)}>Show Sparkbench view</Button>
        </Banner>
      )}
      <div
        className={`schematic ${hoverNet ? 'has-hl' : ''} ${zoom === 1 ? 'fit' : ''}`}
        style={{ ['--z' as any]: zoom }}
        onWheel={(e) => {
          if (!e.ctrlKey && !e.metaKey) return;
          e.preventDefault();
          setZoom((z) => Math.min(5, Math.max(0.6, z * Math.exp(-e.deltaY * 0.002))));
        }}
        data-testid="schematic"
        dangerouslySetInnerHTML={{ __html: kicad?.svg ?? svg }}
        onClick={(e) => {
          const netEl = (e.target as Element).closest('[data-net]');
          if (netEl) {
            const net = nets.find((n) => n.name === netEl.getAttribute('data-net'));
            useStore.getState().set({ pinnedNet: net && net.id !== pinnedNet ? net.id : null });
            return;
          }
          const el = (e.target as Element).closest('[data-part]');
          if (el) useStore.getState().select({ kind: 'part', id: el.getAttribute('data-part')! });
        }}
      />
      {pinnedName && (
        <Banner tone="ok" className="net-banner">
          Net <b>{pinnedName}</b> is highlighted.{' '}
          <Button onClick={() => useStore.getState().setTab('breadboard')}>Show it on the breadboard</Button> <Button onClick={() => useStore.getState().set({ pinnedNet: null })}>Clear</Button>
        </Banner>
      )}
      <p className="doc-foot">Each wire ends in a <b>net label</b>: pins with the same label are connected. Click a wire or label to highlight that net on the breadboard too. Open the KiCad file in KiCad to lay out a PCB.</p>
    </div>
  );
}

/** Rasterise an SVG string to a PNG blob (2× for crisp text). */
async function svgToPng(svg: string): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  const img = new Image();
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = rej;
    img.src = url;
  });
  const vb = /viewBox="([\d.\s-]+)"/.exec(svg)?.[1].split(/\s+/).map(Number);
  const w = vb ? vb[2] : img.width;
  const h = vb ? vb[3] : img.height;
  const scale = Math.max(2, 2400 / w);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(url);
  return new Promise((res) => canvas.toBlob((b) => res(b!), 'image/png'));
}

export function CodeView() {
  const project = useStore((s) => s.project)!;
  const active = useStore((s) => s.activeFile);
  const err = useStore((s) => s.sim.error);
  const files = Object.keys(project.files);
  if (!files.length)
    return (
      <div className="docview empty">
        <h2>No code needed</h2>
        <p>This circuit has no microcontroller — it works with just its components. Press Run to watch it in the simulator.</p>
      </div>
    );
  const file = files.includes(active) ? active : files[0];
  const errorLine = err?.file === file ? err.line : null;
  return (
    <div className="codeview">
      <Tabs
        variant="file"
        className="file-tabs"
        label="Files"
        items={files.map((f) => ({ id: f, label: <>{f}{f !== 'main.py' && <span className="file-hint">{f.startsWith('arduino/') ? 'Arduino' : 'driver'}</span>}</> }))}
        value={file}
        onChange={(f) => useStore.getState().set({ activeFile: f })}
      >
        {project.codeCustom && (
          <Button
            variant="ghost"
            title="Throw away all changes to main.py (yours and the AI's) and go back to the code Sparkbench generated from the circuit"
            onClick={() => {
              if (!confirm('Go back to the code Sparkbench generated from the circuit? All changes to main.py, by you or the AI, will be lost.')) return;
              useStore.getState().update((p) => ({ ...p, files: { ...p.files, ...generateFiles(p) }, codeCustom: false }));
            }}
          >
            Reset main.py
          </Button>
        )}
        <ArduinoButton />
        <Button variant="ghost" onClick={() => download(file.split('/').pop()!, project.files[file], 'text/plain')}>
          Download {file.split('/').pop()}
        </Button>
      </Tabs>
      {err && err.file === file && (
        <Banner tone="error">
          <b>Line {err.line}:</b> {err.message}
          {err.hint && <div className="hint">{err.hint}</div>}
        </Banner>
      )}
      <CodeEditor fileKey={`${project.id}:${file}`} value={project.files[file]} onChange={(v) => useStore.getState().setFile(file, v)} errorLine={errorLine} />
      <CodeAssistant file={file} />
    </div>
  );
}

/** "Arduino version": Claude translates main.py to C++ and arduino-cli compiles it for this board. */
function ArduinoButton() {
  const project = useStore((s) => s.project)!;
  const ai = useStore((s) => s.aiStatus);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  if (project.board !== 'esp32' && project.board !== 'pico') return null;
  const has = Object.keys(project.files).some((f) => f.startsWith('arduino/'));
  return (
    <>
      <Button
        variant="ghost"
        disabled={!ai.enabled || busy}
        title={ai.enabled ? 'Translate to Arduino C++ and compile it for this board' : 'Needs Claude'}
        data-testid="arduino-make"
        onClick={async () => {
          setBusy(true);
          setMsg('');
          try {
            const r = await fetch('/api/ai/arduino', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project }) });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error);
            useStore.getState().update((p) => ({ ...p, files: { ...Object.fromEntries(Object.entries(p.files).filter(([f]) => !f.startsWith('arduino/'))), ...d.files } }));
            const ino = Object.keys(d.files).find((f) => f.endsWith('.ino'));
            if (ino) useStore.getState().set({ activeFile: ino });
            setMsg(d.ok ? `${d.log.join(' ')} ${d.notes}` : `It didn't compile yet: ${d.log.join(' ')}`);
          } catch (e: any) {
            setMsg(e.message ?? String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Writing and compiling C++… (1–5 min)' : has ? 'Update the Arduino version' : 'Arduino (C++) version'}
      </Button>
      {ai.enabled && !busy && <CostHint kind="arduino" />}
      {msg && <Banner className="arduino-msg" data-testid="arduino-msg">{msg}</Banner>}
    </>
  );
}

interface LiveLine { key: string; name: string; quantity: number; part: { lcsc: string; mfr: string; pkg: string; stock: number; basic: boolean; prices: [number, number][]; url: string } | null }

export function BomView() {
  const project = useStore((s) => s.project)!;
  const lines = useMemo(() => buildBom(project), [project.parts, project.wires, project.board]);
  const total = bomTotal(lines);
  const [live, setLive] = useState<LiveLine[] | null>(null);
  const [liveErr, setLiveErr] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => setLive(null), [project.parts, project.board]);
  async function loadLive() {
    setLoading(true);
    setLiveErr('');
    try {
      const r = await fetch('/api/sourcing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Could not load live prices');
      setLive(d.lines);
    } catch (e: any) {
      setLiveErr(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }
  const liveFor = (key: string) => live?.find((x) => x.key === key)?.part;
  const price = (p: NonNullable<LiveLine['part']>, q: number) => p.prices.reduce((v, [min, u]) => (q >= min ? u : v), p.prices[0]?.[1] ?? 0);
  // LCSC sells small parts in minimum quantities: the cart (and subtotal) order at least that many.
  const orderQty = (p: NonNullable<LiveLine['part']>, q: number) => Math.max(q, p.prices[0]?.[0] ?? 1);
  const lcscCsv = () => ['LCSC Part Number,Quantity,Comment', ...(live ?? []).filter((l) => l.part).map((l) => `${l.part!.lcsc},${orderQty(l.part!, l.quantity)},${l.name.replace(/,/g, ' ')}`)].join('\n') + '\n';
  const found = (live ?? []).filter((l) => l.part);
  const missing = (live ?? []).filter((l) => !l.part);
  const lcscSubtotal = found.reduce((n, l) => n + price(l.part!, orderQty(l.part!, l.quantity)) * orderQty(l.part!, l.quantity), 0);
  return (
    <div className="docview">
      <div className="doc-toolbar">
        <span className="doc-title">Parts list</span>
        <Button onClick={() => download(`${slug(project.name)}-bom.csv`, bomToCsv(lines), 'text/csv')}>Download CSV</Button>
        {!live && <Button onClick={loadLive} disabled={loading} data-testid="bom-live">{loading ? 'Checking stock and prices…' : 'Check live stock and prices'}</Button>}
        {!live && <CostHint kind="parts" />}
        {live && found.length > 0 && <Button onClick={() => download(`${slug(project.name)}-lcsc-cart.csv`, lcscCsv(), 'text/csv')} data-testid="bom-cart">Download LCSC cart ({found.length} parts)</Button>}
      </div>
      {liveErr && <Banner tone="error">{liveErr}</Banner>}
      {live && (
        <Banner data-testid="bom-live-note">
          Sparkbench looked up the {live.length} component line{live.length === 1 ? '' : 's'} at LCSC: {found.length} {found.length === 1 ? 'is' : 'are'} in stock (green lines below){missing.length ? `, ${missing.length} ${missing.length === 1 ? 'isn’t' : 'aren’t'} (marked “not at LCSC”)` : ''}. The LCSC subtotal for those is <strong>${lcscSubtotal.toFixed(2)}</strong>: LCSC sells small parts in minimum quantities (often 10–100 pieces), so the cart orders at least that many, and shipping (about $5–20) is extra. The breadboard, wires and cables aren’t looked up; buy them, the board and plug-in modules from a hobby store with the links in the Buy column. To order the LCSC parts in one go, download the cart and upload it at <a href="https://www.lcsc.com/bom" target="_blank" rel="noreferrer">lcsc.com/bom</a>.
        </Banner>
      )}
      <table className="bom" data-testid="bom">
        <thead>
          <tr>
            <th>Qty</th>
            <th>Part</th>
            <th>Value</th>
            <th>Refs</th>
            <th className="num">Each</th>
            <th className="num">Total</th>
            <th>Buy</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l: any, i: number) => {
            const lp = liveFor(l.key);
            return (
              <tr key={i} className={l.kind === 'supply' ? 'supply' : ''}>
                <td>{l.quantity}</td>
                <td>
                  <div className="bom-name">{l.name}</div>
                  <div className="bom-desc">{l.description}</div>
                  {lp && (
                    <div className="bom-live" data-testid="bom-live-part">
                      LCSC <a href={lp.url} target="_blank" rel="noreferrer">{lp.lcsc}</a> · {lp.mfr} · {lp.stock.toLocaleString()} in stock · ${price(lp, orderQty(lp, l.quantity)).toFixed(3)} each{orderQty(lp, l.quantity) > l.quantity ? ` (sold in packs of at least ${orderQty(lp, l.quantity)})` : ''}
                    </div>
                  )}
                  {live && !lp && l.kind === 'part' && live.some((x) => x.key === l.key) && <div className="bom-live missing" data-testid="bom-not-lcsc">Not at LCSC: buy it with the links in the Buy column.</div>}
                </td>
                <td>{l.value ?? ''}</td>
                <td className="refs">{Array.isArray(l.references) ? l.references.join(', ') : l.references ?? ''}</td>
                <td className="num">${Number(l.unitPrice ?? l.unitPriceUsd ?? 0).toFixed(2)}</td>
                <td className="num">${Number(l.linePrice ?? l.linePriceUsd ?? 0).toFixed(2)}</td>
                <td className="links">
                  {(l.links ?? l.suppliers ?? []).slice(0, 3).map((s: any) => (
                    <a key={s.name ?? s.label} href={s.url} target="_blank" rel="noreferrer">
                      {s.name ?? s.label}
                    </a>
                  ))}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={5}>Estimated total (hobby-store prices, from the Each column){live && found.length ? `; LCSC subtotal for the ${found.length} green lines: $${lcscSubtotal.toFixed(2)} plus shipping` : ''}</td>
            <td className="num">${Number(typeof total === 'number' ? total : (total as any).total ?? 0).toFixed(2)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export function MarkdownView({ kind }: { kind: 'guide' | 'blog' }) {
  const project = useStore((s) => s.project)!;
  const md = useMemo(() => (kind === 'guide' ? buildGuide(project) : buildBlogPost(project, { schematicSvgPath: 'schematic.svg' })), [project, kind]);
  const theme = useTheme();
  const html = useMemo(() => {
    let h = marked.parse(md, { async: false }) as string;
    // Inline the live schematic where the blog references schematic.svg
    if (h.includes('schematic.svg')) {
      const svg = renderSchematicSvg(project, { theme });
      h = h.replace(/<img[^>]*src="schematic\.svg"[^>]*>/, `<div class="schematic inline">${svg}</div>`);
    }
    if (h.includes('breadboard.svg')) {
      const bb = renderBreadboardSvg(planBreadboard(project).layout, { labels: true });
      h = h.replace(/<img[^>]*src="breadboard\.svg"[^>]*>/, `<div class="breadboard-figure">${bb}</div>`);
    }
    return h;
  }, [md, theme]);
  const file = kind === 'guide' ? 'BUILD.md' : 'BLOG.md';
  return (
    <div className="docview">
      <div className="doc-toolbar">
        <span className="doc-title">{kind === 'guide' ? 'Build guide' : 'Blog post'}</span>
        <Button onClick={() => download(`${slug(project.name)}-${file}`, md, 'text/markdown')}>Download Markdown</Button>
        <Button onClick={() => navigator.clipboard?.writeText(md)}>Copy Markdown</Button>
        <Button onClick={() => window.print()}>Print</Button>
      </div>
      {kind === 'guide' && <BuildMode />}
      {kind === 'guide' && <PhotoCheck />}
      {kind === 'guide' && <Toolkit />}
      <article className="prose" data-testid={`doc-${kind}`} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
