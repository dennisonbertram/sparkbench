// STEP (ISO 10303-21, AP214) export of a JSCAD solid as a B-rep of planar faces with shared edges:
// an exact closed solid that CAD tools (FreeCAD, Fusion, Onshape, KiCad/OpenCascade) import as a body.
import * as jscadNs from '@jscad/modeling';

const jscad: typeof jscadNs = ((jscadNs as any).default ?? jscadNs) as typeof jscadNs;

export function solidToStep(geom: unknown, name: string): string {
  const polys = jscad.geometries.geom3.toPolygons(geom as any);
  const lines: string[] = [];
  let n = 0;
  const e = (s: string) => {
    lines.push(`#${++n}=${s};`);
    return n;
  };
  const f = (v: number) => {
    const r = Math.round(v * 1e5) / 1e5;
    return Number.isInteger(r) ? `${r}.` : String(r);
  };
  // Shared vertices.
  const pts = new Map<string, number>();
  const pt = (v: number[]) => {
    const k = v.map((x) => x.toFixed(5)).join(',');
    let id = pts.get(k);
    if (!id) {
      id = e(`CARTESIAN_POINT('',(${f(v[0])},${f(v[1])},${f(v[2])}))`);
      pts.set(k, id);
    }
    return id;
  };
  // Shared vertices and edges, so faces meet along common edges (a proper B-rep).
  const vtx = new Map<string, number>();
  const vertex = (v: number[]) => {
    const k = v.map((x) => x.toFixed(5)).join(',');
    let id = vtx.get(k);
    if (!id) {
      id = e(`VERTEX_POINT('',#${pt(v)})`);
      vtx.set(k, id);
    }
    return { id, k };
  };
  const dir = (v: number[]) => {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return e(`DIRECTION('',(${f(v[0] / l)},${f(v[1] / l)},${f(v[2] / l)}))`);
  };
  const edges = new Map<string, { id: number; from: string }>();
  const edge = (a: number[], b: number[]) => {
    const va = vertex(a);
    const vb = vertex(b);
    const key = va.k < vb.k ? `${va.k}|${vb.k}` : `${vb.k}|${va.k}`;
    let ed = edges.get(key);
    if (!ed) {
      const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const vec = e(`VECTOR('',#${dir(d)},${f(Math.hypot(d[0], d[1], d[2]))})`);
      const line = e(`LINE('',#${pt(a)},#${vec})`);
      ed = { id: e(`EDGE_CURVE('',#${va.id},#${vb.id},#${line},.T.)`), from: va.k };
      edges.set(key, ed);
    }
    return `#${e(`ORIENTED_EDGE('',*,*,#${ed.id},${ed.from === va.k ? '.T.' : '.F.'})`)}`;
  };
  const faces: number[] = [];
  for (const p of polys) {
    const vs = ((p as any).vertices as number[][]).filter((v, i, arr) => i === 0 || v.some((x, j) => Math.abs(x - arr[i - 1][j]) > 1e-6));
    if (vs.length < 3) continue;
    // Newell normal.
    const nrm = [0, 0, 0];
    for (let i = 0; i < vs.length; i++) {
      const a = vs[i];
      const b = vs[(i + 1) % vs.length];
      nrm[0] += (a[1] - b[1]) * (a[2] + b[2]);
      nrm[1] += (a[2] - b[2]) * (a[0] + b[0]);
      nrm[2] += (a[0] - b[0]) * (a[1] + b[1]);
    }
    if (Math.hypot(...nrm) < 1e-9) continue;
    const refd = [vs[1][0] - vs[0][0], vs[1][1] - vs[0][1], vs[1][2] - vs[0][2]];
    const place = e(`AXIS2_PLACEMENT_3D('',#${pt(vs[0])},#${dir(nrm)},#${dir(refd)})`);
    const plane = e(`PLANE('',#${place})`);
    const loop = e(`EDGE_LOOP('',(${vs.map((v, i) => edge(v, vs[(i + 1) % vs.length])).join(',')}))`);
    const bound = e(`FACE_OUTER_BOUND('',#${loop},.T.)`);
    faces.push(e(`ADVANCED_FACE('',(#${bound}),#${plane},.T.)`));
  }
  const shell = e(`CLOSED_SHELL('',(${faces.map((x) => `#${x}`).join(',')}))`);
  const brep = e(`MANIFOLD_SOLID_BREP('${name}',#${shell})`);
  const origin = e(`CARTESIAN_POINT('',(0.,0.,0.))`);
  const zdir = e(`DIRECTION('',(0.,0.,1.))`);
  const xdir = e(`DIRECTION('',(1.,0.,0.))`);
  const axis = e(`AXIS2_PLACEMENT_3D('',#${origin},#${zdir},#${xdir})`);
  const mm = e(`(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.))`);
  const rad = e(`(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.))`);
  const sr = e(`(NAMED_UNIT(*)SI_UNIT($,.STERADIAN.)SOLID_ANGLE_UNIT())`);
  const unc = e(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-05),#${mm},'distance_accuracy_value','')`);
  const ctx = e(`(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#${unc}))GLOBAL_UNIT_ASSIGNED_CONTEXT((#${mm},#${rad},#${sr}))REPRESENTATION_CONTEXT('',''))`);
  const shape = e(`ADVANCED_BREP_SHAPE_REPRESENTATION('${name}',(#${brep},#${axis}),#${ctx})`);
  const appCtx = e(`APPLICATION_CONTEXT('automotive design')`);
  e(`APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,#${appCtx})`);
  const pctx = e(`PRODUCT_CONTEXT('',#${appCtx},'mechanical')`);
  const prod = e(`PRODUCT('${name}','${name}','',(#${pctx}))`);
  const form = e(`PRODUCT_DEFINITION_FORMATION('','',#${prod})`);
  const dctx = e(`PRODUCT_DEFINITION_CONTEXT('part definition',#${appCtx},'design')`);
  const def = e(`PRODUCT_DEFINITION('design','',#${form},#${dctx})`);
  const pds = e(`PRODUCT_DEFINITION_SHAPE('','',#${def})`);
  e(`SHAPE_DEFINITION_REPRESENTATION(#${pds},#${shape})`);
  const head = [
    'ISO-10303-21;',
    'HEADER;',
    `FILE_DESCRIPTION(('${name}'),'2;1');`,
    `FILE_NAME('${name}.step','${new Date(0).toISOString().slice(0, 19)}',('Sparkbench'),(''),'Sparkbench','Sparkbench','');`,
    "FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));",
    'ENDSEC;',
    'DATA;',
  ];
  return [...head, ...lines, 'ENDSEC;', 'END-ISO-10303-21;', ''].join('\n');
}
