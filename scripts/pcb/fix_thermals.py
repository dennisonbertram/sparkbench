"""Give pads that KiCad DRC reports as 'starved_thermal' a solid connection to the ground pour, then refill.

Usage (KiCad's Python): python3 fix_thermals.py board.kicad_pcb drc.json
"""
import json
import sys

import pcbnew

board_path, drc_path = sys.argv[1], sys.argv[2]
drc = json.load(open(drc_path))
uuids = {i['uuid'] for v in drc.get('violations', []) if v['type'] == 'starved_thermal' for i in v['items'] if i['description'].startswith(('PTH pad', 'SMD pad', 'Pad'))}
board = pcbnew.LoadBoard(board_path)
fixed = 0
for fp in board.GetFootprints():
    for pad in fp.Pads():
        if pad.m_Uuid.AsString() in uuids:
            pad.SetLocalZoneConnection(pcbnew.ZONE_CONNECTION_FULL)
            fixed += 1
if fixed:
    pcbnew.ZONE_FILLER(board).Fill(board.Zones())
    pcbnew.SaveBoard(board_path, board)
print(json.dumps({'fixed': fixed}))
