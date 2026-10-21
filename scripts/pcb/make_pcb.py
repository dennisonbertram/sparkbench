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


def snapshot(fp, rot, usb=None):
    """Pad offsets (by net) and box relative to the footprint origin at rotation rot."""
    fp.SetPosition(pcbnew.VECTOR2I(0, 0))
    fp.SetOrientationDegrees(rot)
    pads = [(mm(p.GetPosition().x), mm(p.GetPosition().y), p.GetNetname()) for p in fp.Pads()]
    out = {'rot': rot, 'pads': pads, 'box': bbox_of(fp)}
    if usb:
        pp = {p.GetNumber(): (mm(p.GetPosition().x), mm(p.GetPosition().y)) for p in fp.Pads()}
        a, b = pp.get(usb[0]), pp.get(usb[1])
        if a and b:
            out['usb'] = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
    return out


def overlaps(a, b, gap):
    return not (a[2] + gap <= b[0] or b[2] + gap <= a[0] or a[3] + gap <= b[1] or b[3] + gap <= a[1])


def place(board, fps, spec):
    by_ref = {p['ref']: p for p in spec['parts']}
    snaps = {ref: [snapshot(fp, r, by_ref[ref].get('usbPads')) for r in (0, 90, 180, 270)] for ref, fp in fps.items()}
    # ESP32 DevKit: its antenna sticks out ~13 mm past pin 1 (the end opposite USB). Reserve it.
    for ref, ss in snaps.items():
        if by_ref[ref].get('antenna'):
            for s in ss:
                b = s['box']
                ux, uy = s.get('usb', ((b[0] + b[2]) / 2, b[3]))
                cx, cy = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
                # The antenna end is opposite the USB end.
                if abs(uy - cy) > abs(ux - cx):
                    if uy > cy:
                        s['antenna'] = (b[0], b[1] - 13.0, b[2], b[1]); s['box'] = (b[0], b[1] - 13.0, b[2], b[3])
                    else:
                        s['antenna'] = (b[0], b[3], b[2], b[3] + 13.0); s['box'] = (b[0], b[1], b[2], b[3] + 13.0)
                else:
                    if ux > cx:
                        s['antenna'] = (b[0] - 13.0, b[1], b[0], b[3]); s['box'] = (b[0] - 13.0, b[1], b[2], b[3])
                    else:
                        s['antenna'] = (b[2], b[1], b[2] + 13.0, b[3]); s['box'] = (b[0], b[1], b[2] + 13.0, b[3])
    # Plug-in modules lie flat above their socket and overhang it: reserve the whole body
    # (on the side away from the pin names).
    for ref, ss in snaps.items():
        m = by_ref[ref].get('module')
        if not m:
            continue
        for s in ss[:2]:
            b = s['box']
            vertical = s['rot'] % 180 == 0
            if vertical:  # header runs along y; body extends to the right
                cy = (b[1] + b[3]) / 2
                s['box'] = (b[0], min(b[1], cy - m['w'] / 2), b[0] + m['d'], max(b[3], cy + m['w'] / 2))
            else:  # header runs along x; body extends upwards
                cx = (b[0] + b[2]) / 2
                s['box'] = (min(b[0], cx - m['w'] / 2), b[3] - m['d'], max(b[2], cx + m['w'] / 2), b[3])
        del ss[2:]
    for ref, ss in snaps.items():
        if by_ref[ref].get('flushEdge') is not None:
            del ss[1:]  # USB socket: opening faces down (towards the bottom edge)
        elif not by_ref[ref].get('usbPads') and len(ss) > 2:
            del ss[2:]
    # Sockets get their pin names printed beside them: keep that strip free.
    for ref, ss in snaps.items():
        p = by_ref[ref]
        if p.get('module'):
            # Labels go on the open side (left / below), away from the module body.
            for s in ss:
                b = s['box']
                s['box'] = (b[0] - 4.0, b[1], b[2], b[3]) if s['rot'] % 180 == 0 else (b[0], b[1], b[2], b[3] + 4.0)
            continue
        if p['footprint'].startswith('Connector_PinHeader') and p.get('pinNames'):
            both = 4.0 if '2x' in p['footprint'] else 0.0
            b0 = ss[0]['box']
            ss[0]['box'] = (b0[0] - both, b0[1], b0[2] + 4.0, b0[3])
            b9 = ss[1]['box']
            ss[1]['box'] = (b9[0], b9[1] - 4.0, b9[2], b9[3] + both)
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
    # Dev boards: turn so the USB end faces down (it ends up at the bottom edge, antenna at the top).
    pick = snaps[first][0]
    for s in snaps[first]:
        if 'usb' in s:
            b = s['box']
            if s['usb'][1] >= b[3] - 6:
                pick = s
                break
    placed[first] = (0.0, 0.0, pick)
    boxes.append(tuple(pick['box']))
    # Keep the space below the USB connector free, so the cable can reach the board edge.
    forbid = []
    if 'usb' in pick:
        ux = pick['usb'][0]
        forbid.append((ux - 9, pick['box'][3] - 1, ux + 9, 1e6))
    remaining = [r for r in order if r != first]
    fixed = spec.get('fixed') or {}
    if fixed:
        # The user arranged the parts: keep their positions and rotations exactly.
        def snap_for(ref, rot):
            want = round(rot) % 360
            for s in snaps[ref]:
                if round(s['rot']) % 360 == want:
                    return s
            fp = fps[ref]
            return snapshot(fp, want, by_ref[ref].get('usbPads'))
        placed.clear()
        boxes.clear()
        for ref in fps:
            f = fixed.get(ref)
            if not f:
                continue
            s = snap_for(ref, f['rot'])
            placed[ref] = (f['x'], f['y'], s)
            boxes.append((s['box'][0] + f['x'], s['box'][1] + f['y'], s['box'][2] + f['x'], s['box'][3] + f['y']))
        remaining = [r for r in order if r not in placed]
        pick = placed.get(first, (0, 0, pick))[2]
        forbid = []
    while remaining:
        # Edge connectors first (after the board), so they claim their edge before anything else.
        remaining.sort(key=lambda r: (by_ref[r].get('flushEdge') is None, -links(r), -len(by_ref[r]['pads'])))
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
                    if any(overlaps(box, b, 1.0) for b in boxes) or any(overlaps(box, f, 0) for f in forbid):
                        continue
                    wl = 0.0
                    for px, py, n in s['pads']:
                        if n in pts:
                            wl += min(abs(x + px - qx) + abs(y + py - qy) for qx, qy in pts[n])
                    nb = (min(cl[0], box[0]), min(cl[1], box[1]), max(cl[2], box[2]), max(cl[3], box[3]))
                    growth = (nb[2] - nb[0]) * (nb[3] - nb[1]) - area0
                    cost = wl + 0.08 * growth
                    if by_ref[ref].get('flushEdge') is not None:
                        cost += 40.0 * (nb[3] - box[3])  # as low as possible: it ends up on the bottom edge
                    if by_ref[ref].get('edge'):
                        # Cables plug in here: prefer the outside of the board.
                        cost += 3.0 * min(box[0] - nb[0], nb[2] - box[2], box[1] - nb[1], nb[3] - box[3])
                    if best is None or cost < best[0]:
                        best = (cost, x, y, s)
        if best is None:
            raise SystemExit(f'could not place {ref}')
        _, x, y, s = best
        placed[ref] = (x, y, s)
        boxes.append((s['box'][0] + x, s['box'][1] + y, s['box'][2] + x, s['box'][3] + y))
        if by_ref[ref].get('flushEdge') is not None:
            # Nothing else may go below the USB socket's top: it owns the bottom edge.
            forbid.append((-1e6, s['box'][1] + y - 3.0, 1e6, 1e6))
            boxes[-1] = (boxes[-1][0], boxes[-1][1], boxes[-1][2], boxes[-1][3] + 2.0)
    place.flush = None
    for ref, (x, y, s) in placed.items():
        fe = by_ref[ref].get('flushEdge')
        if fe is not None:
            place.flush = y + fe + 100
    place.usb = None
    if first in placed and 'usb' in placed[first][2]:
        fx, fy, fs = placed[first]
        place.usb = (fx + fs['usb'][0] + 100, fy + fs['usb'][1] + 100)

    keepouts = []
    bodies = {}
    place.reserved = {ref: (s['box'][0] + x + 100, s['box'][1] + y + 100, s['box'][2] + x + 100, s['box'][3] + y + 100) for ref, (x, y, s) in placed.items()}
    for ref, (x, y, s) in placed.items():
        fp = fps[ref]
        fp.SetOrientationDegrees(s['rot'])
        fp.SetPosition(pcbnew.VECTOR2I(MM(x + 100), MM(y + 100)))
        if s.get('antenna'):
            a = s['antenna']
            keepouts.append((a[0] + x + 100, a[1] + y + 100, a[2] + x + 100, a[3] + y + 100))
        if by_ref[ref].get('module'):
            b = s['box']
            # The body part of the reserved box (without the label strip on the open side).
            body = (b[0] + 4.0, b[1], b[2], b[3]) if s['rot'] % 180 == 0 else (b[0], b[1], b[2], b[3] - 4.0)
            bodies[ref] = (body[0] + x + 100, body[1] + y + 100, body[2] + x + 100, body[3] + y + 100)
    place.keepouts = keepouts
    place.bodies = bodies
    cl = (min(b[0] for b in boxes) + 100, min(b[1] for b in boxes) + 100, max(b[2] for b in boxes) + 100, max(b[3] for b in boxes) + 100)
    return cl


def add_outline(board, cl, margin, flush_bottom=None):
    x0, y0, x1, y1 = cl[0] - margin, cl[1] - margin, cl[2] + margin, cl[3] + margin
    if flush_bottom is not None:
        y1 = flush_bottom  # the USB socket's opening sits exactly on the edge
    # Round to 0.5 mm so the board size is a tidy number.
    x0, y0 = math.floor(x0 * 2) / 2, math.floor(y0 * 2) / 2
    x1 = math.ceil(x1 * 2) / 2
    y1 = y1 if flush_bottom is not None else math.ceil(y1 * 2) / 2
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


def short_pin(name):
    """Silkscreen-sized pin name that is never misleading (GPIO17 -> IO17, never GPIO1)."""
    n = name.replace('GPIO', 'IO')
    return n if len(n) <= 6 else n[:6]


def add_pin_labels(board, fps, spec):
    """Print each pin's name beside the pads of sockets for plug-in boards/modules."""
    for p in spec['parts']:
        if not p['footprint'].startswith('Connector_PinHeader') or not p.get('pinNames'):
            continue
        fp = fps[p['ref']]
        cx, cy = mm(fp.GetPosition().x), mm(fp.GetPosition().y)
        pads = list(fp.Pads())
        vertical = abs(fp.GetOrientationDegrees()) % 180 == 0
        two_rows = '2x' in p['footprint']
        mid_x = sum(mm(q.GetPosition().x) for q in pads) / len(pads)
        mid_y = sum(mm(q.GetPosition().y) for q in pads) / len(pads)
        for pad in pads:
            name = p['pinNames'].get(pad.GetNumber())
            if not name:
                continue
            x, y = mm(pad.GetPosition().x), mm(pad.GetPosition().y)
            t = pcbnew.PCB_TEXT(board)
            t.SetText(short_pin(name))
            t.SetLayer(pcbnew.F_SilkS)
            t.SetTextSize(pcbnew.VECTOR2I(MM(0.8), MM(0.8)))
            t.SetTextThickness(MM(0.12))
            if vertical:
                # Two-row headers: left row labelled on the left, right row on the right.
                # Modules overhang to the right, so their labels go on the left.
                left = (two_rows and x < mid_x) or bool(p.get('module'))
                t.SetHorizJustify(pcbnew.GR_TEXT_H_ALIGN_RIGHT if left else pcbnew.GR_TEXT_H_ALIGN_LEFT)
                t.SetPosition(pcbnew.VECTOR2I(MM(x - 1.9 if left else x + 1.9), MM(y)))
            else:
                below = (two_rows and y > mid_y) or bool(p.get('module'))
                t.SetTextAngleDegrees(90)
                t.SetHorizJustify(pcbnew.GR_TEXT_H_ALIGN_RIGHT if below else pcbnew.GR_TEXT_H_ALIGN_LEFT)
                t.SetPosition(pcbnew.VECTOR2I(MM(x), MM(y + 1.9 if below else y - 1.9)))
            board.Add(t)


def add_rect(board, x, y, w, h, layer):
    s = pcbnew.PCB_SHAPE(board)
    s.SetShape(pcbnew.SHAPE_T_RECT)
    s.SetStart(pcbnew.VECTOR2I(MM(x), MM(y)))
    s.SetEnd(pcbnew.VECTOR2I(MM(x + w), MM(y + h)))
    s.SetFilled(True)
    s.SetWidth(0)
    s.SetLayer(layer)
    board.Add(s)


def add_qr(board, modules, x, y, size):
    n = len(modules)
    m = size / n
    for r, row in enumerate(modules):
        for c, dark in enumerate(row):
            if dark:
                add_rect(board, x + c * m, y + r * m, m, m, pcbnew.F_SilkS)


def add_logo(board, x, y, s=2.4):
    """A small lightning-bolt mark (Sparkbench) on the silkscreen."""
    pts = [(0.55, 0), (0.15, 0.55), (0.45, 0.55), (0.3, 1), (0.85, 0.38), (0.55, 0.38), (0.75, 0)]
    poly = pcbnew.PCB_SHAPE(board)
    poly.SetShape(pcbnew.SHAPE_T_POLY)
    poly.SetPolyPoints([pcbnew.VECTOR2I(MM(x + px * s), MM(y + py * s)) for px, py in pts])
    poly.SetFilled(True)
    poly.SetWidth(0)
    poly.SetLayer(pcbnew.F_SilkS)
    board.Add(poly)


def add_keepout(board, rect):
    """No copper (pour, tracks or vias) under a radio antenna."""
    z = pcbnew.ZONE(board)
    z.SetIsRuleArea(True)
    z.SetDoNotAllowZoneFills(True)
    z.SetDoNotAllowTracks(True)
    z.SetDoNotAllowVias(True)
    z.SetDoNotAllowPads(False)
    z.SetDoNotAllowFootprints(False)
    ls = pcbnew.LSET()
    ls.AddLayer(pcbnew.F_Cu)
    ls.AddLayer(pcbnew.B_Cu)
    z.SetLayerSet(ls)
    z.SetZoneName('Antenna keep-out')
    ol = z.Outline()
    ol.NewOutline()
    x0, y0, x1, y1 = rect
    for x, y in ((x0, y0), (x1, y0), (x1, y1), (x0, y1)):
        ol.Append(MM(x), MM(y))
    board.Add(z)


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
    fab = spec.get('fabRules') or {}
    for attr, val in (('m_TrackMinWidth', fab.get('track', 0.15)), ('m_MinClearance', fab.get('space', 0.15)), ('m_ViasMinSize', 0.6), ('m_MinThroughDrill', fab.get('drill', 0.3)), ('m_ViasMinAnnularWidth', fab.get('annular', 0.13))):
        try:
            setattr(ds, attr, MM(val))
        except Exception:
            pass
    try:
        ns = ds.m_NetSettings
        dflt = ns.GetDefaultNetclass()
        dflt.SetTrackWidth(MM(0.3))
        dflt.SetClearance(MM(0.22))  # route with a margin over the 0.2 mm DRC rule (router rounding)
        dflt.SetViaDiameter(MM(0.8))
        dflt.SetViaDrill(MM(0.4))
        power = pcbnew.NETCLASS('Power')
        power.SetTrackWidth(MM(0.6))
        power.SetClearance(MM(0.22))
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
    problems_note = []
    for p in spec['parts']:
        lib, name = p['footprint'].split(':', 1)
        fp = pcbnew.FootprintLoad(fp_lib_path(lib, lib_dirs), name)
        if fp is None:
            raise SystemExit(f'footprint {p["footprint"]} not found')
        fp.SetFPID(pcbnew.LIB_ID(lib, name))
        fp.SetReference(p['ref'])
        try:
            fp.Reference().SetKeepUpright(True)
        except Exception:
            pass
        fp.SetValue(p['value'])
        if p.get('ledColor'):
            # Coloured LED body in the 3D render (KiCad's plain 5 mm LED model is red).
            # (The model list hands out copies, so rebuild it.)
            models = fp.Models()
            recoloured = []
            for m in models:
                c = pcbnew.FP_3DMODEL()
                for a in ('m_Scale', 'm_Rotation', 'm_Offset', 'm_Opacity', 'm_Show'):
                    setattr(c, a, getattr(m, a))
                c.m_Filename = m.m_Filename.replace('LED_D5.0mm.', 'LED_D5.0mm_%s.' % p['ledColor'])
                recoloured.append(c)
            models.clear()
            for c in recoloured:
                models.push_back(c)
        # Thermal vias inside a footprint's ground pad that are smaller than the factory can drill
        # (e.g. ESP32-WROOM's 0.2 mm ones): drop them; the pad still connects through the pour.
        min_drill = (spec.get('fabRules') or {}).get('drill', 0.3)
        smd_numbers = {pad.GetNumber() for pad in fp.Pads() if pad.GetAttribute() == pcbnew.PAD_ATTRIB_SMD}
        for pad in list(fp.Pads()):
            if pad.GetAttribute() == pcbnew.PAD_ATTRIB_PTH and pad.GetNumber() in smd_numbers and mm(pad.GetDrillSize().x) < min_drill - 1e-6:
                fp.Remove(pad)
                problems_note.append(f'{p["ref"]}: removed a {mm(pad.GetDrillSize().x):.2f} mm thermal via (smaller than the factory minimum)')
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
    qr = spec.get('qr')
    qr_size = 0
    if qr:
        # A label strip along the bottom edge for the QR code.
        qr_size = 12.0 if len(qr['modules']) <= 29 else 16.0
        cl = (cl[0], cl[1], max(cl[2], cl[0] + qr_size + 30), cl[3] + qr_size + 3)
    outline = add_outline(board, cl, 6.0, getattr(place, 'flush', None))
    x0, y0, x1, y1 = outline
    add_pin_labels(board, fps, spec)
    # Outline of each plug-in module's body on the silkscreen: "plug it in so it covers this".
    for ref, box in getattr(place, 'bodies', {}).items():
        fps[ref].Reference().SetVisible(False)  # "U2 sits here" inside the outline says it
        x0b, y0b, x1b, y1b = box
        for a, b in (((x0b, y0b), (x1b, y0b)), ((x1b, y0b), (x1b, y1b)), ((x1b, y1b), (x0b, y1b)), ((x0b, y1b), (x0b, y0b))):
            seg = pcbnew.PCB_SHAPE(board)
            seg.SetShape(pcbnew.SHAPE_T_SEGMENT)
            seg.SetStart(pcbnew.VECTOR2I(MM(a[0]), MM(a[1])))
            seg.SetEnd(pcbnew.VECTOR2I(MM(b[0]), MM(b[1])))
            seg.SetLayer(pcbnew.F_SilkS)
            seg.SetWidth(MM(0.15))
            board.Add(seg)
        add_text(board, ref + ' sits here', (x0b + x1b) / 2, (y0b + y1b) / 2, 1.0)
    for k in getattr(place, 'keepouts', []):
        add_keepout(board, k)
        add_text(board, 'ANTENNA: keep clear', (k[0] + k[2]) / 2, (k[1] + k[3]) / 2, 1.0)
    if qr:
        qx, qy = x0 + 6.5, y1 - 6.0 - qr_size
        add_qr(board, qr['modules'], qx, qy, qr_size)
        t = pcbnew.PCB_TEXT(board)
        t.SetText('Scan for the build guide')
        t.SetLayer(pcbnew.F_SilkS)
        t.SetTextSize(pcbnew.VECTOR2I(MM(1.0), MM(1.0)))
        t.SetTextThickness(MM(0.15))
        t.SetHorizJustify(pcbnew.GR_TEXT_H_ALIGN_LEFT)
        t.SetPosition(pcbnew.VECTOR2I(MM(qx + qr_size + 2), MM(qy + qr_size / 2)))
        board.Add(t)
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
    add_text(board, 'Sparkbench · ' + spec.get('rev', 'Draft'), (x0 + x1) / 2 + 1.6, y0 + 2.6, 1.0)
    add_logo(board, (x0 + x1) / 2 - 12.5, y0 + 1.4)

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

    # Where every part ended up, relative to the board's top-left corner (for the enclosure).
    parts_out = []
    for fp in board.GetFootprints():
        ref = fp.GetReference()
        if ref.startswith('H') and ref[1:].isdigit():
            continue
        b = bbox_of(fp)
        parts_out.append({'ref': ref, 'x': round(mm(fp.GetPosition().x) - x0, 2), 'y': round(mm(fp.GetPosition().y) - y0, 2), 'rot': fp.GetOrientationDegrees(),
                          'reserved': [round(v - (x0 if i % 2 == 0 else y0), 2) for i, v in enumerate(getattr(place, 'reserved', {}).get(ref, b))],
                          'box': [round(b[0] - x0, 2), round(b[1] - y0, 2), round(b[2] - x0, 2), round(b[3] - y0, 2)]})
    holes = [[3.5, 3.5], [x1 - x0 - 3.5, 3.5], [x1 - x0 - 3.5, y1 - y0 - 3.5], [3.5, y1 - y0 - 3.5]]
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
        'parts': parts_out,
        'usb': [round(place.usb[0] - x0, 2), round(place.usb[1] - y0, 2)] if getattr(place, 'usb', None) else None,
        'holes': holes,
        'problems': problems,
        'notes': problems_note,
        'route_log_tail': route_log[-1500:],
    }, open(os.path.join(work, 'layout.json'), 'w'), indent=1)


if __name__ == '__main__':
    main()
