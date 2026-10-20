"""Lay out a printed circuit board with KiCad's pcbnew, route it with Freerouting, pour ground.

Run with KiCad's bundled Python:
  python3 make_pcb.py spec.json workdir [--java /path/to/java --freerouting /path/to/freerouting.jar] [--fplib-dir DIR ...]

spec.json is written by src/core/pcb.ts (pcbSpec). Writes workdir/<name>.kicad_pcb and
workdir/layout.json (placement, routing and size summary).
"""
import json
import math
import os
import subprocess
import sys

import pcbnew

MM = pcbnew.FromMM


def mm(v):
    return pcbnew.ToMM(v)


def fp_lib_path(lib, dirs):
    for d in dirs:
        p = os.path.join(d, lib + '.pretty')
        if os.path.isdir(p):
            return p
    raise SystemExit(f'footprint library {lib} not found in {dirs}')


def bbox_of(fp):
    """Courtyard box if the footprint has one, else pads + body graphics (no text)."""
    try:
        cy = fp.GetCourtyard(pcbnew.F_CrtYd)
        if cy.OutlineCount() > 0:
            b = cy.BBox()
            return (mm(b.GetLeft()), mm(b.GetTop()), mm(b.GetRight()), mm(b.GetBottom()))
    except Exception:
        pass
    b = fp.GetBoundingBox(False)
    return (mm(b.GetLeft()), mm(b.GetTop()), mm(b.GetRight()), mm(b.GetBottom()))


def snapshot(fp, rot):
    """Pad offsets (by net) and box relative to the footprint origin at rotation rot."""
    fp.SetPosition(pcbnew.VECTOR2I(0, 0))
    fp.SetOrientationDegrees(rot)
    pads = [(mm(p.GetPosition().x), mm(p.GetPosition().y), p.GetNetname()) for p in fp.Pads()]
    return {'rot': rot, 'pads': pads, 'box': bbox_of(fp)}


def overlaps(a, b, gap):
    return not (a[2] + gap <= b[0] or b[2] + gap <= a[0] or a[3] + gap <= b[1] or b[3] + gap <= a[1])


def place(board, fps, spec):
    by_ref = {p['ref']: p for p in spec['parts']}
    snaps = {ref: [snapshot(fp, 0), snapshot(fp, 90)] for ref, fp in fps.items()}
    gnd = spec.get('groundNet')
    placed = {}  # ref -> (x, y, snap)
    boxes = []

    def net_points(exclude_ground=True):
        pts = {}
        for ref, (x, y, s) in placed.items():
            for px, py, n in s['pads']:
                if not n or (exclude_ground and n == gnd):
                    continue
                pts.setdefault(n, []).append((x + px, y + py))
        return pts

    def links(ref):
        nets = {n for _, _, n in snaps[ref][0]['pads'] if n and n != gnd}
        pts = net_points()
        return sum(len(pts.get(n, [])) for n in nets)

    order = sorted(fps, key=lambda r: (by_ref[r]['role'] != 'board', by_ref[r]['role'] != 'ic', -len(by_ref[r]['pads'])))
    first = order[0]
    placed[first] = (0.0, 0.0, snaps[first][0])
    boxes.append(tuple(v + o for v, o in zip(snaps[first][0]['box'], (0, 0, 0, 0))))
    remaining = [r for r in order if r != first]
    while remaining:
        remaining.sort(key=lambda r: (-links(r), -len(by_ref[r]['pads'])))
        ref = remaining.pop(0)
        pts = net_points()
        cl = (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))
        area0 = (cl[2] - cl[0]) * (cl[3] - cl[1])
        best = None
        step = 1.27
        for s in snaps[ref]:
            bx = s['box']
            w, h = bx[2] - bx[0], bx[3] - bx[1]
            x0, x1 = cl[0] - w - 4, cl[2] + 4
            y0, y1 = cl[1] - h - 4, cl[3] + 4
            nx = int((x1 - x0) / step) + 1
            ny = int((y1 - y0) / step) + 1
            for i in range(nx):
                x = x0 + i * step - bx[0]
                for j in range(ny):
                    y = y0 + j * step - bx[1]
                    box = (bx[0] + x, bx[1] + y, bx[2] + x, bx[3] + y)
                    if any(overlaps(box, b, 1.0) for b in boxes):
                        continue
                    wl = 0.0
                    for px, py, n in s['pads']:
                        if n in pts:
                            wl += min(abs(x + px - qx) + abs(y + py - qy) for qx, qy in pts[n])
                    nb = (min(cl[0], box[0]), min(cl[1], box[1]), max(cl[2], box[2]), max(cl[3], box[3]))
                    growth = (nb[2] - nb[0]) * (nb[3] - nb[1]) - area0
                    cost = wl + 0.08 * growth
                    if best is None or cost < best[0]:
                        best = (cost, x, y, s)
        _, x, y, s = best
        placed[ref] = (x, y, s)
        boxes.append((s['box'][0] + x, s['box'][1] + y, s['box'][2] + x, s['box'][3] + y))

    for ref, (x, y, s) in placed.items():
        fp = fps[ref]
        fp.SetOrientationDegrees(s['rot'])
        fp.SetPosition(pcbnew.VECTOR2I(MM(x + 100), MM(y + 100)))
    cl = (min(b[0] for b in boxes) + 100, min(b[1] for b in boxes) + 100, max(b[2] for b in boxes) + 100, max(b[3] for b in boxes) + 100)
    return cl


def add_outline(board, cl, margin):
    x0, y0, x1, y1 = cl[0] - margin, cl[1] - margin, cl[2] + margin, cl[3] + margin
    # Round to 0.5 mm so the board size is a tidy number.
    x0, y0 = math.floor(x0 * 2) / 2, math.floor(y0 * 2) / 2
    x1, y1 = math.ceil(x1 * 2) / 2, math.ceil(y1 * 2) / 2
    r = 2.0
    segs = [((x0 + r, y0), (x1 - r, y0)), ((x1, y0 + r), (x1, y1 - r)), ((x1 - r, y1), (x0 + r, y1)), ((x0, y1 - r), (x0, y0 + r))]
    for a, b in segs:
        s = pcbnew.PCB_SHAPE(board)
        s.SetShape(pcbnew.SHAPE_T_SEGMENT)
        s.SetStart(pcbnew.VECTOR2I(MM(a[0]), MM(a[1])))
        s.SetEnd(pcbnew.VECTOR2I(MM(b[0]), MM(b[1])))
        s.SetLayer(pcbnew.Edge_Cuts)
        s.SetWidth(MM(0.1))
        board.Add(s)
    for cx, cy, sa in ((x0 + r, y0 + r, 180), (x1 - r, y0 + r, 270), (x1 - r, y1 - r, 0), (x0 + r, y1 - r, 90)):
        s = pcbnew.PCB_SHAPE(board)
        s.SetShape(pcbnew.SHAPE_T_ARC)
        s.SetCenter(pcbnew.VECTOR2I(MM(cx), MM(cy)))
        s.SetStart(pcbnew.VECTOR2I(MM(cx + r * math.cos(math.radians(sa))), MM(cy + r * math.sin(math.radians(sa)))))
        s.SetArcAngleAndEnd(pcbnew.EDA_ANGLE(90, pcbnew.DEGREES_T), True)
        s.SetLayer(pcbnew.Edge_Cuts)
        s.SetWidth(MM(0.1))
        board.Add(s)
    return (x0, y0, x1, y1)


def add_text(board, text, x, y, size=1.5, layer=None):
    t = pcbnew.PCB_TEXT(board)
    t.SetText(text)
    t.SetPosition(pcbnew.VECTOR2I(MM(x), MM(y)))
    t.SetLayer(layer if layer is not None else pcbnew.F_SilkS)
    t.SetTextSize(pcbnew.VECTOR2I(MM(size), MM(size)))
    t.SetTextThickness(MM(size * 0.15))
    board.Add(t)


def add_zone(board, outline, net, layer):
    z = pcbnew.ZONE(board)
    z.SetLayer(layer)
    z.SetNet(net)
    z.SetLocalClearance(MM(0.3))
    z.SetMinThickness(MM(0.25))
    z.SetPadConnection(pcbnew.ZONE_CONNECTION_THERMAL)
    ol = z.Outline()
    ol.NewOutline()
    x0, y0, x1, y1 = outline
    for x, y in ((x0, y0), (x1, y0), (x1, y1), (x0, y1)):
        ol.Append(MM(x), MM(y))
    board.Add(z)
    return z


def setup_rules(board, spec):
    ds = board.GetDesignSettings()
    # Board minimums: a conservative version of common 2-layer fab capabilities (JLCPCB/PCBWay
    # standard service: 0.127 mm track/space, 0.3 mm drill). Normal tracks are much wider.
    for attr, val in (('m_TrackMinWidth', 0.15), ('m_MinClearance', 0.15), ('m_ViasMinSize', 0.6), ('m_MinThroughDrill', 0.3), ('m_ViasMinAnnularWidth', 0.13)):
        try:
            setattr(ds, attr, MM(val))
        except Exception:
            pass
    try:
        ns = ds.m_NetSettings
        dflt = ns.GetDefaultNetclass()
        dflt.SetTrackWidth(MM(0.3))
        dflt.SetClearance(MM(0.2))
        dflt.SetViaDiameter(MM(0.8))
        dflt.SetViaDrill(MM(0.4))
        power = pcbnew.NETCLASS('Power')
        power.SetTrackWidth(MM(0.6))
        power.SetClearance(MM(0.2))
        power.SetViaDiameter(MM(1.0))
        power.SetViaDrill(MM(0.5))
        ns.SetNetclass('Power', power)
        for n in spec['powerNets']:
            ns.SetNetclassPatternAssignment(n, 'Power')
        return 'netclasses'
    except Exception as e:  # API differences between KiCad versions: fall back to defaults
        return f'default rules ({e})'


def main():
    spec_path, work = sys.argv[1], sys.argv[2]
    args = sys.argv[3:]
    fr = args[args.index('--freerouting') + 1] if '--freerouting' in args else None
    java = args[args.index('--java') + 1] if '--java' in args else 'java'
    lib_dirs = [args[i + 1] for i, a in enumerate(args) if a == '--fplib-dir']
    spec = json.load(open(spec_path))
    os.makedirs(work, exist_ok=True)
    board = pcbnew.CreateEmptyBoard()
    board.SetCopperLayerCount(2)
    rules = setup_rules(board, spec)

    nets = {}
    for p in spec['parts']:
        for n in p['pads'].values():
            if n not in nets:
                ni = pcbnew.NETINFO_ITEM(board, n)
                board.Add(ni)
                nets[n] = ni

    fps = {}
    problems = []
    for p in spec['parts']:
        lib, name = p['footprint'].split(':', 1)
        fp = pcbnew.FootprintLoad(fp_lib_path(lib, lib_dirs), name)
        if fp is None:
            raise SystemExit(f'footprint {p["footprint"]} not found')
        fp.SetFPID(pcbnew.LIB_ID(lib, name))
        fp.SetReference(p['ref'])
        fp.SetValue(p['value'])
        pad_names = {pad.GetNumber() for pad in fp.Pads()}
        for num, net in p['pads'].items():
            if num not in pad_names:
                problems.append(f'{p["ref"]}: footprint {p["footprint"]} has no pad {num}')
        for pad in fp.Pads():
            n = p['pads'].get(pad.GetNumber())
            if n:
                pad.SetNet(nets[n])
        board.Add(fp)
        fps[p['ref']] = fp

    cl = place(board, fps, spec)
    outline = add_outline(board, cl, 6.0)
    x0, y0, x1, y1 = outline
    for hx, hy in ((x0 + 3.5, y0 + 3.5), (x1 - 3.5, y0 + 3.5), (x1 - 3.5, y1 - 3.5), (x0 + 3.5, y1 - 3.5)):
        h = pcbnew.FootprintLoad(fp_lib_path('MountingHole', lib_dirs), 'MountingHole_3.2mm_M3')
        h.SetPosition(pcbnew.VECTOR2I(MM(hx), MM(hy)))
        h.SetReference(f'H{len([f for f in board.GetFootprints() if f.GetReference().startswith("H")]) + 1}')
        h.Reference().SetVisible(False)
        h.SetFPID(pcbnew.LIB_ID('MountingHole', 'MountingHole_3.2mm_M3'))
        try:
            h.SetBoardOnly(True)  # not in the schematic, on purpose
        except Exception:
            pass
        h.Value().SetVisible(False)
        board.Add(h)
    add_text(board, spec['title'], (x0 + x1) / 2, y1 - 2.6, 1.4)
    add_text(board, 'Sparkbench · Rev A', (x0 + x1) / 2, y0 + 2.6, 1.0)

    pcb_path = os.path.join(work, spec['name'] + '.kicad_pcb')
    pcbnew.SaveBoard(pcb_path, board)

    routed = False
    route_log = ''
    if fr:
        dsn = os.path.join(work, 'board.dsn')
        ses = os.path.join(work, 'board.ses')
        pcbnew.ExportSpecctraDSN(board, dsn)
        # Analytics off, no GUI: Freerouting runs fully offline.
        cmd = [java, '-jar', fr, '-de', dsn, '-do', ses, '-mp', '40', '--gui.enabled=false', '--usage_and_diagnostic_data.disable_analytics=true']
        try:
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=480)
        except subprocess.TimeoutExpired as e:
            r = subprocess.CompletedProcess(cmd, 1, (e.stdout or b'').decode() if isinstance(e.stdout, bytes) else (e.stdout or ''), 'routing timed out')
        route_log = (r.stdout + r.stderr)[-4000:]
        if os.path.exists(ses):
            routed = pcbnew.ImportSpecctraSES(board, ses)
    gnd = spec.get('groundNet')
    if gnd and gnd in nets:
        inset = (x0 + 0.5, y0 + 0.5, x1 - 0.5, y1 - 0.5)
        zones = [add_zone(board, inset, nets[gnd], pcbnew.B_Cu), add_zone(board, inset, nets[gnd], pcbnew.F_Cu)]
        pcbnew.ZONE_FILLER(board).Fill(board.Zones())
    pcbnew.SaveBoard(pcb_path, board)

    unrouted = board.GetConnectivity().GetUnconnectedCount(False) if hasattr(board.GetConnectivity(), 'GetUnconnectedCount') else None
    json.dump({
        'pcb': pcb_path,
        'width_mm': round(x1 - x0, 1),
        'height_mm': round(y1 - y0, 1),
        'routed': bool(routed),
        'unrouted': unrouted,
        'tracks': len([t for t in board.GetTracks() if t.GetClass() == 'PCB_TRACK']),
        'vias': len([t for t in board.GetTracks() if t.GetClass() == 'PCB_VIA']),
        'rules': rules,
        'problems': problems,
        'route_log_tail': route_log[-1500:],
    }, open(os.path.join(work, 'layout.json'), 'w'), indent=1)


if __name__ == '__main__':
    main()
