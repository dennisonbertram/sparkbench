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
import { planBreadboard } from '../core/bbplace';
import { renderBreadboardSvg } from '../core/breadboard';
import { download, slug } from './exporters';
import { generateFiles } from '../core/codegen';
import { buildNets } from '../core/netlist';

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
  const [zoom, setZoom] = useState(1.4);
  const svg = useMemo(() => {
    try {
      return renderSchematicSvg(project, { theme, highlightNet: pinnedName });
    } catch (e: any) {
      return `<p class="err">Could not draw the schematic: ${e.message}</p>`;
    }
  }, [project.parts, project.wires, project.name, theme, pinnedName]);
  const name = slug(project.name);
  // Pick a zoom where pin labels are readable: the drawing is in millimetres; ~7 px per mm at the view's width.
  useEffect(() => {
    const vb = /viewBox="[\d.-]+ [\d.-]+ ([\d.]+) /.exec(svg);
    const wmm = vb ? Number(vb[1]) : 300;
    const viewPx = Math.max(600, (document.querySelector('.view') as HTMLElement | null)?.clientWidth ?? 900) - 40;
    setZoom(Math.min(4, Math.max(1, +((7 * wmm) / viewPx).toFixed(2))));
  }, [project.id, svg.length > 0]);
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
        <button onClick={() => download(`${name}-schematic.svg`, renderSchematicSvg(project, { theme: 'light' }), 'image/svg+xml')}>Download SVG</button>
        <button onClick={() => svgToPng(renderSchematicSvg(project, { theme: 'light' })).then((b) => download(`${name}-schematic.png`, b))}>Download PNG</button>
        <button onClick={() => download(`${name}.kicad_sch`, exportKicadSchematic(project))} title="Open in KiCad's Schematic Editor">KiCad schematic</button>
        <button onClick={() => download(`${name}.kicad_pro`, exportKicadProject(project))}>KiCad project</button>
        <button onClick={() => download(`${name}.net`, exportKicadNetlist(project))}>Netlist</button>
        <button onClick={() => download(`${name}.cir`, exportSpice(project, defaultSpiceOptions(project)))} title="SPICE netlist for ngspice">SPICE (.cir)</button>
        <span className="zoom-group">
          <button onClick={() => setZoom((z) => Math.max(0.6, z / 1.25))} aria-label="Zoom out">−</button>
          <button onClick={() => setZoom(1)} title="Fit width">{Math.round(zoom * 100)}%</button>
          <button onClick={() => setZoom((z) => Math.min(5, z * 1.25))} aria-label="Zoom in">+</button>
        </span>
        {aiStatus.kicad && (
          <button onClick={renderKicad} disabled={kicad?.busy} title="Run the exported file through kicad-cli to check it">
            {kicad?.busy ? 'Running KiCad…' : 'Check in KiCad'}
          </button>
        )}
      </div>
      {kicad?.error && <div className="banner warn">KiCad: {kicad.error}</div>}
      {kicad?.svg && (
        <div className="banner ok">
          Rendered by KiCad · ERC: {ercCount === 0 ? 'no errors' : `${ercCount} error(s)`} <button onClick={() => setKicad(null)}>Show Sparkbench view</button>
        </div>
      )}
      <div
        className={`schematic ${hoverNet ? 'has-hl' : ''}`}
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
        <div className="banner ok net-banner">
          Net <b>{pinnedName}</b> is highlighted.{' '}
          <button onClick={() => useStore.getState().setTab('breadboard')}>Show it on the breadboard</button> <button onClick={() => useStore.getState().set({ pinnedNet: null })}>Clear</button>
        </div>
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
      <div className="file-tabs" role="tablist">
        {files.map((f) => (
          <button key={f} role="tab" aria-selected={f === file} className={f === file ? 'active' : ''} onClick={() => useStore.getState().set({ activeFile: f })}>
            {f}
            {f !== 'main.py' && <span className="file-hint">driver</span>}
          </button>
        ))}
        <span className="spacer" />
        {project.codeCustom && (
          <button
            className="ghost"
            onClick={() => {
              if (!confirm('Replace main.py with freshly generated code? Your edits will be lost.')) return;
              useStore.getState().update((p) => ({ ...p, files: { ...p.files, ...generateFiles(p) }, codeCustom: false }));
            }}
          >
            Regenerate main.py
          </button>
        )}
        <button className="ghost" onClick={() => download(file, project.files[file], 'text/x-python')}>
          Download {file}
        </button>
      </div>
      {err && err.file === file && (
        <div className="banner error">
          <b>Line {err.line}:</b> {err.message}
          {err.hint && <div className="hint">{err.hint}</div>}
        </div>
      )}
      <CodeEditor fileKey={`${project.id}:${file}`} value={project.files[file]} onChange={(v) => useStore.getState().setFile(file, v)} errorLine={errorLine} />
      <CodeAssistant file={file} />
    </div>
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
  const lcscCsv = () => ['LCSC Part Number,Quantity,Comment', ...(live ?? []).filter((l) => l.part).map((l) => `${l.part!.lcsc},${l.quantity},${l.name.replace(/,/g, ' ')}`)].join('\n') + '\n';
  const found = (live ?? []).filter((l) => l.part);
  return (
    <div className="docview">
      <div className="doc-toolbar">
        <span className="doc-title">Parts list</span>
        <button onClick={() => download(`${slug(project.name)}-bom.csv`, bomToCsv(lines), 'text/csv')}>Download CSV</button>
        {!live && <button onClick={loadLive} disabled={loading} data-testid="bom-live">{loading ? 'Checking stock and prices…' : 'Check live stock and prices'}</button>}
        {live && found.length > 0 && <button onClick={() => download(`${slug(project.name)}-lcsc-cart.csv`, lcscCsv(), 'text/csv')} data-testid="bom-cart">Download LCSC cart ({found.length} parts)</button>}
      </div>
      {liveErr && <div className="banner error">{liveErr}</div>}
      {live && (
        <div className="banner" data-testid="bom-live-note">
          {found.length} of {live.length} parts are stocked at LCSC right now (prices below). To order them in one go, download the LCSC cart and upload it at <a href="https://www.lcsc.com/bom" target="_blank" rel="noreferrer">lcsc.com/bom</a>. Boards and plug-in modules are sold by hobby stores: use the links in the Buy column.
        </div>
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
                      LCSC <a href={lp.url} target="_blank" rel="noreferrer">{lp.lcsc}</a> · {lp.mfr} · {lp.stock.toLocaleString()} in stock · ${price(lp, l.quantity).toFixed(3)} each
                    </div>
                  )}
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
            <td colSpan={5}>Estimated total (hobby-store prices)</td>
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
        <button onClick={() => download(`${slug(project.name)}-${file}`, md, 'text/markdown')}>Download Markdown</button>
        <button onClick={() => navigator.clipboard?.writeText(md)}>Copy Markdown</button>
        <button onClick={() => window.print()}>Print</button>
      </div>
      {kind === 'guide' && <BuildMode />}
      {kind === 'guide' && <PhotoCheck />}
      <article className="prose" data-testid={`doc-${kind}`} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
